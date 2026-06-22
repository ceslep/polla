<?php
/**
 * seed_apuestas_from_json.php - Siembra la hoja "apuestas" desde un JSON
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/seed_apuestas_from_json.php
 *
 * Lee un JSON producido por `node export_clean_bets.mjs` (polla_clean.json)
 * y lo escribe en la hoja "apuestas" del mismo spreadsheet que usan
 * save_bets.php / save_pwa_bet.php. Es idempotente: UPSERT por `id`.
 *
 * Esquema de la hoja "apuestas" (11 columnas A:K):
 *   A:id            (clave de dedup — bet.id del JSON, copiado literal)
 *   B:timestamp     (string crudo del export de WhatsApp)
 *   C:participante  (display name del participante)
 *   D:phone         (teléfono tal como viene en Sheets)
 *   E:date          (YYYY-MM-DD del partido real, de matchedMatch.date)
 *   F:              (columna vacía — sin header, sin valor)
 *   G:team1         (homeTeam normalizado)
 *   H:team2         (awayTeam normalizado)
 *   I:score1        (homeScore)
 *   J:score2        (awayScore)
 *   K:datetime      (ISO de message.timestamp parseado, e.g. "2026-06-12T10:52:52")
 *
 * Filtro aplicado:
 *   - Solo bets con type === 'score'
 *   - Solo bets con matchedMatch no nulo (partido real resuelto)
 *   - champion / runnerup / topscorer quedan excluidos (no tienen team1/team2)
 *
 * Petición (POST):
 *   ?confirm=YES
 *   Content-Type: multipart/form-data con campo "file" (el .json)
 *     — o —
 *   Content-Type: application/json con el JSON en el body
 *
 * Respuesta (200):
 *   { success: true, received, matched, skipped, updated, inserted,
 *     duration_ms }
 *
 * Seguridad:
 *   - Rechaza sin ?confirm=YES (403)
 *   - Solo POST (405 en otros métodos)
 *   - CORS abierto (mismo patrón que save_bets.php)
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\BatchUpdateValuesRequest;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const SPREADSHEET_ID = '1PIo_oLVjQubdbLodigV3cwOfwQ29k-SGsRmbeorI3nM';
const WORKSHEET = 'apuestas';
const RANGE = 'apuestas!A1:K50000';
const REQUIRED_CONFIRM = 'YES';

/**
 * Headers esperados en la hoja (la hoja YA debe tenerlos — este script
 * no los escribe). Documentados para validación.
 */
const EXPECTED_HEADERS = [
    'id',          // A
    'timestamp',   // B
    'participante',// C
    'phone',       // D
    'date',        // E
    '',            // F (vacía)
    'team1',       // G
    'team2',       // H
    'score1',      // I
    'score2',      // J
    'datetime',    // K
];

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
 }

$t0 = microtime(true);

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Método no permitido. Use POST.', 405);
    }

    if (($_GET['confirm'] ?? '') !== REQUIRED_CONFIRM) {
        http_response_code(403);
        throw new Exception('Se requiere ?confirm=' . REQUIRED_CONFIRM . ' en la URL.');
    }

    // ---------- 1. Leer JSON desde multipart, raw body, o archivo ----------
    $rawJson = null;
    $source = null;

    if (isset($_FILES['file']) && is_array($_FILES['file']) && ($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $tmp = $_FILES['file']['tmp_name'];
        $rawJson = file_get_contents($tmp);
        $source = 'multipart file: ' . ($_FILES['file']['name'] ?? 'uploaded');
    } else {
        $rawJson = file_get_contents('php://input');
        if ($rawJson !== false && $rawJson !== '') {
            $source = 'raw request body';
        }
    }

    if ($rawJson === null || $rawJson === '' || $rawJson === false) {
        throw new Exception('No se recibió JSON. Use multipart con campo "file" o Content-Type: application/json.');
    }

    $payload = json_decode($rawJson, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('JSON inválido: ' . json_last_error_msg());
    }
    if (!isset($payload['participants']) || !is_array($payload['participants'])) {
        throw new Exception('El JSON debe tener la clave "participants" como arreglo.');
    }

    // ---------- 2. Proyectar bets a filas de 11 columnas ----------
    $rows = [];        // [['id' => ..., 'cells' => [...11]], ...]
    $received = 0;     // bets totales encontradas en el JSON
    $matched = 0;      // score bets con matchedMatch
    $skippedNonScore = 0;
    $skippedNoMatch = 0;

    foreach ($payload['participants'] as $participant) {
        $participantName = (string)($participant['participant'] ?? '');
        $phone = (string)($participant['phone'] ?? '');
        $messages = $participant['messages'] ?? [];
        if (!is_array($messages)) continue;

        foreach ($messages as $message) {
            $rawTimestamp = (string)($message['timestamp'] ?? '');
            $datetime = parseTimestampToIso($rawTimestamp);
            $bets = $message['bets'] ?? [];
            if (!is_array($bets)) continue;

            foreach ($bets as $bet) {
                if (!is_array($bet)) continue;
                $received++;

                if (($bet['type'] ?? null) !== 'score') {
                    $skippedNonScore++;
                    continue;
                }

                $mm = $bet['matchedMatch'] ?? null;
                if (!is_array($mm) || empty($mm)) {
                    $skippedNoMatch++;
                    continue;
                }

                $prediction = $bet['prediction'] ?? [];
                $homeTeam = (string)($prediction['homeTeam'] ?? '');
                $awayTeam = (string)($prediction['awayTeam'] ?? '');
                $homeScore = $prediction['homeScore'] ?? '';
                $awayScore = $prediction['awayScore'] ?? '';
                $matchDate = (string)($mm['date'] ?? '');

                $cells = [
                    (string)($bet['id'] ?? ''),    // A: id
                    $rawTimestamp,                 // B: timestamp (crudo)
                    $participantName,              // C: participante
                    $phone,                        // D: phone
                    $matchDate,                    // E: date (YYYY-MM-DD)
                    '',                            // F: vacía
                    $homeTeam,                     // G: team1
                    $awayTeam,                     // H: team2
                    is_int($homeScore) || (is_string($homeScore) && $homeScore !== '')
                        ? (int)$homeScore
                        : '',
                    is_int($awayScore) || (is_string($awayScore) && $awayScore !== '')
                        ? (int)$awayScore
                        : '',
                    $datetime,                     // K: datetime (ISO)
                ];

                $rows[] = [
                    'id' => (string)($bet['id'] ?? ''),
                    'cells' => $cells,
                ];
                $matched++;
            }
        }
    }

    if ($matched === 0) {
        echo json_encode([
            'success' => true,
            'source' => $source,
            'received' => $received,
            'matched' => 0,
            'skipped_non_score' => $skippedNonScore,
            'skipped_no_match' => $skippedNoMatch,
            'updated' => 0,
            'inserted' => 0,
            'duration_ms' => (int)((microtime(true) - $t0) * 1000),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // ---------- 3. Conectar a Google Sheets ----------
    $client = new Client();
    $client->setApplicationName('Polla Mundialista Seed');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado: ' . SERVICE_ACCOUNT_KEY_FILE);
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // ---------- 4. Leer hoja "apuestas" para dedup por id ----------
    try {
        $response = $service->spreadsheets_values->get(SPREADSHEET_ID, RANGE);
        $existingValues = $response->getValues() ?: [];
    } catch (Exception $e) {
        $existingValues = [];
        error_log('seed_apuestas: hoja apuestas no legible, se asume vacía: ' . $e->getMessage());
    }

    $hasHeaders = count($existingValues) > 0
        && strtolower(trim($existingValues[0][0] ?? '')) === 'id';

    if ($hasHeaders) {
        // Validación rápida: la primera fila debe coincidir con EXPECTED_HEADERS
        // (en particular la col F vacía). Solo logueamos si difiere, no fallamos.
        $headerDiff = [];
        foreach (EXPECTED_HEADERS as $i => $expected) {
            $actual = strtolower(trim($existingValues[0][$i] ?? ''));
            $exp = strtolower(trim($expected));
            if ($actual !== $exp) {
                $headerDiff[] = "col " . chr(65 + $i) . " (idx $i): esperado '$expected', actual '$actual'";
            }
        }
        if (count($headerDiff) > 0) {
            error_log('seed_apuestas: headers no coinciden: ' . implode('; ', $headerDiff));
        }
    }

    $existingMap = []; // id => rowIndex 1-based
    $dataStartRow = $hasHeaders ? 2 : 1;
    for ($i = $dataStartRow; $i < count($existingValues); $i++) {
        $rowId = trim($existingValues[$i][0] ?? '');
        if ($rowId !== '') {
            $existingMap[$rowId] = $i + 1;
        }
    }

    // ---------- 5. Preparar UPSERT (update existing / append new) ----------
    $batchOps = [];
    $updatedCount = 0;
    $insertedCount = 0;
    $nextRow = count($existingValues) + 1; // para appends al final

    foreach ($rows as $row) {
        $id = $row['id'];
        $cells = $row['cells'];

        if (isset($existingMap[$id])) {
            $rowIndex = $existingMap[$id];
            $batchOps[] = [
                'range' => WORKSHEET . '!A' . $rowIndex . ':K' . $rowIndex,
                'values' => [$cells],
            ];
            $updatedCount++;
        } else {
            $batchOps[] = [
                'range' => WORKSHEET . '!A' . $nextRow . ':K' . $nextRow,
                'values' => [$cells],
            ];
            $existingMap[$id] = $nextRow;
            $nextRow++;
            $insertedCount++;
        }
    }

    // ---------- 6. Ejecutar batch ----------
    if (count($batchOps) > 0) {
        $body = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data' => $batchOps,
        ]);
        $service->spreadsheets_values->batchUpdate(SPREADSHEET_ID, $body);
    }

    $durationMs = (int)((microtime(true) - $t0) * 1000);

    echo json_encode([
        'success' => true,
        'source' => $source,
        'received' => $received,
        'matched' => $matched,
        'skipped_non_score' => $skippedNonScore,
        'skipped_no_match' => $skippedNoMatch,
        'updated' => $updatedCount,
        'inserted' => $insertedCount,
        'existing_rows_before' => max(0, count($existingValues) - ($hasHeaders ? 1 : 0)),
        'worksheet' => WORKSHEET,
        'spreadsheet_id' => SPREADSHEET_ID,
        'duration_ms' => $durationMs,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

} catch (Exception $e) {
    $code = http_response_code();
    if ($code === 200 || !$code) {
        http_response_code(500);
    }
    $errBody = [
        'success' => false,
        'error' => $e->getMessage(),
    ];
    if (isset($t0)) {
        $errBody['duration_ms'] = (int)((microtime(true) - $t0) * 1000);
    }
    echo json_encode($errBody, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
}

/**
 * Parsea el timestamp del JSON de WhatsApp a ISO 8601 sin timezone
 * (lo que había en el mensaje, local time de quien lo envió).
 *
 * Acepta:
 *   "2026-06-12 10:52:52"       (con espacios extra entre fecha y hora)
 *   "2026/6/14 11:14:52"        (slashes, mes/día sin zero-pad)
 *   "2026-06-12T10:52:52"       (ya ISO)
 *
 * Devuelve string vacío si no puede parsearlo.
 */
function parseTimestampToIso(string $raw): string {
    $cleaned = trim(preg_replace('/\s+/', ' ', $raw));
    if ($cleaned === '') return '';

    $formats = [
        'Y-m-d H:i:s',
        'Y/n/j H:i:s',
        'Y-m-d\TH:i:s',
        'Y/n/j\TH:i:s',
    ];
    foreach ($formats as $fmt) {
        $dt = DateTime::createFromFormat($fmt, $cleaned);
        if ($dt instanceof DateTime) {
            // Re-emitir canónico con ceros de padding (importante: el
            // JSON original trae "2026/6/14" sin zero-pad; aquí lo
            // normalizamos a "2026-06-14T11:14:52").
            return $dt->format('Y-m-d\TH:i:s');
        }
    }
    return '';
}
