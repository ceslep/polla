<?php
/**
 * save_pwa_bet.php - Guardar apuestas del PWA en Google Sheets (INMUTABLE)
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/save_pwa_bet.php
 *
 * A diferencia de save_bets.php, este endpoint es **INSERT-only** (no UPSERT).
 * Esto garantiza la inmutabilidad que pidió el usuario: una apuesta enviada
 * no se puede modificar. Si el cliente reintenta por error de red, el id
 * determinístico detecta el duplicado y devuelve 200 con la fila existente.
 *
 * Esquema de la hoja "apuestas" (10 columnas A:J):
 *   A:id, B:participant, C:phone, D:matchDate, E:matchId,
 *   F:homeTeam, G:awayTeam, H:homeScore, I:awayScore, J:submittedAt
 *
 * Petición (POST, JSON):
 *   {
 *     "spreadsheetId": "...",
 *     "date": "YYYY-MM-DD",                    // día de los partidos (en COT)
 *     "firstMatchTime": "HH:MM",               // hora COT del primer partido
 *     "participant": "Huguito P",
 *     "phone": "+57 315 6389889",
 *     "pin": "9889",                            // últimos 4 dígitos del phone
 *     "bets": [
 *       { "matchId": 42, "homeTeam": "Spain", "awayTeam": "Saudi Arabia",
 *         "homeScore": 3, "awayScore": 1 },
 *       ...
 *     ]
 *   }
 *
 * Respuestas:
 *   200 { success: true, saved: N, alreadyExists: N }
 *   200 { success: true, saved: 0, alreadyExists: N } (idempotente)
 *   400 { success: false, error: "..." } (PIN incorrecto, ventana cerrada, JSON inválido)
 *   500 { success: false, error: "..." } (error de Sheets)
 *
 * CORS: igual que save_bets.php (Access-Control-Allow-Origin: *).
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Google\Service\Sheets\BatchUpdateValuesRequest;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'apuestas';
const TIMEZONE = 'America/Bogota';
const COT_OFFSET_HOURS = -5; // fallback si intl no está disponible

const HEADERS = [
    'id', 'participant', 'phone', 'matchDate', 'matchId',
    'homeTeam', 'awayTeam', 'homeScore', 'awayScore', 'submittedAt'
];

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/**
 * @return DateTimeZone
 */
function tz(): DateTimeZone {
    try {
        return new DateTimeZone(TIMEZONE);
    } catch (Exception $e) {
        return new DateTimeZone(sprintf('%+03d:00', COT_OFFSET_HOURS));
    }
}

/**
 * @return string 'YYYY-MM-DD HH:MM:SS' en COT
 */
function nowCot(): string {
    return (new DateTime('now', tz()))->format('Y-m-d H:i:s');
}

/**
 * @param string $date 'YYYY-MM-DD'
 * @return string 'YYYY-MM-DD HH:MM:SS' en COT
 */
function startOfDayCot(string $date): string {
    return $date . ' 00:00:00';
}

/**
 * Valida la ventana: ahora en COT debe estar entre [date 00:00 COT, firstMatchTime - 1min COT].
 * @param string $date 'YYYY-MM-DD'
 * @param string $firstMatchTime 'HH:MM'
 * @return array{ok: bool, now: string, openAt: string, closeAt: string}
 */
function validateWindow(string $date, string $firstMatchTime): array {
    $timezone = tz();
    $openAt = new DateTime($date . ' 00:00:00', $timezone);
    $closeAt = new DateTime($date . ' ' . $firstMatchTime . ':00', $timezone);
    $closeAt->modify('-1 minute');
    $now = new DateTime('now', $timezone);

    return [
        'ok' => ($now >= $openAt && $now <= $closeAt),
        'now' => $now->format('Y-m-d H:i:s'),
        'openAt' => $openAt->format('Y-m-d H:i:s'),
        'closeAt' => $closeAt->format('Y-m-d H:i:s')
    ];
}

/**
 * Limpia el phone a sólo dígitos. Acepta "+57 315 6389889" o "573156389889".
 * @param string $phone
 * @return string sólo dígitos
 */
function digitsOnly(string $phone): string {
    return preg_replace('/\D+/', '', $phone);
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Método no permitido. Use POST.');
    }

    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('JSON inválido: ' . json_last_error_msg());
    }

    foreach (['spreadsheetId', 'date', 'firstMatchTime', 'participant', 'phone', 'pin', 'bets'] as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    if (!is_array($data['bets']) || count($data['bets']) === 0) {
        throw new Exception('El campo "bets" debe ser un arreglo no vacío.');
    }

    $spreadsheetId = $data['spreadsheetId'];
    $date = trim($data['date']);
    $firstMatchTime = trim($data['firstMatchTime']);
    $participant = trim($data['participant']);
    $phone = trim($data['phone']);
    $pin = trim($data['pin']);

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        throw new Exception('date debe tener formato YYYY-MM-DD.');
    }
    if (!preg_match('/^\d{1,2}:\d{2}$/', $firstMatchTime)) {
        throw new Exception('firstMatchTime debe tener formato HH:MM.');
    }
    if (!preg_match('/^\d{4}$/', $pin)) {
        throw new Exception('pin debe tener exactamente 4 dígitos.');
    }

    // 1. Validar PIN: últimos 4 dígitos del phone (cliente y servidor coinciden)
    $phoneDigits = digitsOnly($phone);
    if (strlen($phoneDigits) < 4) {
        throw new Exception('phone inválido (muy corto).');
    }
    $expectedPin = substr($phoneDigits, -4);
    if ($pin !== $expectedPin) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'PIN incorrecto. Verifica los últimos 4 dígitos de tu número.'
        ]);
        exit;
    }

    // 2. Validar ventana (server-side)
    $window = validateWindow($date, $firstMatchTime);
    if (!$window['ok']) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Ventana de apuestas cerrada.',
            'window' => $window
        ]);
        exit;
    }

    // 3. Generar ids determinísticos: pwa_<phone>_<date>_<matchId>
    $phoneIdSafe = preg_replace('/[^a-zA-Z0-9]/', '', $phone);
    $nowIso = (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');

    /** @var array<int, array{id: string, row: array}> */
    $newRows = [];
    /** @var array<int, string> */
    $newIds = [];
    foreach ($data['bets'] as $bet) {
        if (!isset($bet['matchId'], $bet['homeTeam'], $bet['awayTeam'], $bet['homeScore'], $bet['awayScore'])) {
            throw new Exception('Cada bet debe tener matchId, homeTeam, awayTeam, homeScore, awayScore.');
        }
        $homeScore = filter_var($bet['homeScore'], FILTER_VALIDATE_INT);
        $awayScore = filter_var($bet['awayScore'], FILTER_VALIDATE_INT);
        if ($homeScore === false || $homeScore < 0 || $homeScore > 99) {
            throw new Exception('homeScore debe ser entero entre 0 y 99.');
        }
        if ($awayScore === false || $awayScore < 0 || $awayScore > 99) {
            throw new Exception('awayScore debe ser entero entre 0 y 99.');
        }
        $id = sprintf('pwa_%s_%s_%s', $phoneIdSafe, $date, $bet['matchId']);
        $newIds[] = $id;
        $newRows[] = [
            'id' => $id,
            'row' => [
                $id,
                $participant,
                $phone,
                $date,
                (string)$bet['matchId'],
                (string)$bet['homeTeam'],
                (string)$bet['awayTeam'],
                $homeScore,
                $awayScore,
                $nowIso
            ]
        ];
    }

    // 4. Conectar a Sheets
    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // 5. Leer la hoja existente (si existe) para detectar duplicados
    /** @var array<string, int> $existingMap id => rowIndex (1-based) */
    $existingMap = [];
    /** @var array<int, array> $existingValues */
    $existingValues = [];
    $hasHeaders = false;

    try {
        $range = WORKSHEET . '!A1:J50000';
        $response = $service->spreadsheets_values->get($spreadsheetId, $range);
        $existingValues = $response->getValues() ?: [];
        $hasHeaders = count($existingValues) > 0 && strtolower($existingValues[0][0] ?? '') === 'id';
        $dataStartRow = $hasHeaders ? 2 : 1;
        for ($i = $dataStartRow; $i < count($existingValues); $i++) {
            $rowId = trim($existingValues[$i][0] ?? '');
            if ($rowId) {
                $existingMap[$rowId] = $i + 1;
            }
        }
    } catch (Exception $e) {
        // Hoja no existe o está vacía. El cliente debió crearla manualmente.
        // Si $hasHeaders es false, vamos a insertar headers + filas.
        error_log('save_pwa_bet: hoja apuestas no existe o error de lectura: ' . $e->getMessage());
    }

    // 6. Detectar duplicados (idempotencia) y preparar inserts
    $inserts = [];
    $alreadyExists = [];
    $nextRow = count($existingValues) + 1;
    if (!$hasHeaders && count($existingValues) > 0) {
        $nextRow = count($existingValues) + 1;
    } elseif ($hasHeaders) {
        $nextRow = count($existingValues) + 1;
    } else {
        $nextRow = 1; // we'll insert headers first
    }

    foreach ($newRows as $entry) {
        $id = $entry['id'];
        if (isset($existingMap[$id])) {
            $alreadyExists[] = $id;
            continue;
        }
        $inserts[] = [
            'id' => $id,
            'rowIndex' => $nextRow
        ];
        $existingMap[$id] = $nextRow; // protege contra duplicados dentro del mismo payload
        $nextRow++;
    }

    // 7. Si la hoja está vacía, agregar headers primero
    $batchOps = [];
    if (!$hasHeaders) {
        $batchOps[] = [
            'range' => WORKSHEET . '!A1:J1',
            'values' => [HEADERS]
        ];
    }

    // 8. Preparar batch update con los inserts
    foreach ($inserts as $ins) {
        $entry = null;
        foreach ($newRows as $nr) {
            if ($nr['id'] === $ins['id']) { $entry = $nr; break; }
        }
        if (!$entry) continue;
        $batchOps[] = [
            'range' => WORKSHEET . '!A' . $ins['rowIndex'] . ':J' . $ins['rowIndex'],
            'values' => [$entry['row']]
        ];
    }

    // 9. Ejecutar batch
    if (count($batchOps) > 0) {
        $body = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data' => $batchOps
        ]);
        $service->spreadsheets_values->batchUpdate($spreadsheetId, $body);
    }

    echo json_encode([
        'success' => true,
        'message' => count($inserts) > 0
            ? 'Apuestas guardadas exitosamente.'
            : 'Todas las apuestas ya existían (idempotente).',
        'saved' => count($inserts),
        'alreadyExists' => count($alreadyExists),
        'window' => $window,
        'submittedAt' => $nowIso
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
