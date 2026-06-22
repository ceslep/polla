<?php
/**
 * save_pwa_bet.php - Guardar apuestas del PWA en Google Sheets (INMUTABLE)
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/save_pwa_bet.php
 *
 * Cambios vs versión anterior:
 *   - Auth vía {username, password} (no más {phone, pin}). Valida contra
 *     la hoja "participantes" (columnas B+C).
 *   - El nombre y teléfono del bet se toman de la hoja "participantes"
 *     (NO del payload), evitando que el cliente suplante la identidad.
 *   - `dev: true` salta la validación de credenciales (uso exclusivo en
 *     localhost). El frontend sólo envía este flag cuando hostname es dev.
 *
 * Esquema de la hoja "apuestas" (11 columnas A:K, alineado con seed_apuestas_from_json.php):
 *   A:id, B:timestamp (COT, formato WhatsApp 'n/j/y H:i'),
 *   C:participant, D:phone, E:matchDate, F:(vacía),
 *   G:homeTeam, H:awayTeam, I:homeScore, J:awayScore, K:submittedAt (ISO)
 *
 * Petición (POST, JSON):
 *   {
 *     "spreadsheetId": "...",
 *     "date": "YYYY-MM-DD",                    // día de los partidos (en COT)
 *     "firstMatchTime": "HH:MM",               // hora COT del primer partido
 *     "username": "3117250869",                // last 10 digits del phone (col B)
 *     "password": "0869",                      // last 4 digits (col C)
 *     "dev": false,
 *     "bets": [
 *       { "matchId": 42, "homeTeam": "Spain", "awayTeam": "Saudi Arabia",
 *         "homeScore": 3, "awayScore": 1 },
 *       ...
 *     ]
 *   }
 *
 * Respuestas:
 *   200 { success: true, saved: N, alreadyExists: M }
 *   200 { success: true, saved: 0, alreadyExists: N } (idempotente)
 *   400 { success: false, error: "..." } (credenciales inválidas, ventana cerrada, JSON inválido)
 *   500 { success: false, error: "..." } (error de Sheets)
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Google\Service\Sheets\BatchUpdateValuesRequest;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'apuestas';
const PARTICIPANTS_WORKSHEET = 'participantes';
const TIMEZONE = 'America/Bogota';
const COT_OFFSET_HOURS = -5;

const HEADERS = [
    'id', 'timestamp', 'participant', 'phone', 'matchDate', '',
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
 * Autentica al usuario contra la hoja `participantes`. Devuelve ['participant' => ..., 'phone' => ...]
 * o lanza excepción con código 401 si las credenciales no coinciden.
 *
 * En dev mode (`$dev === true`) se salta la validación de formato (10/4 dígitos)
 * pero se hace el lookup real en la hoja `participantes` para que el nombre
 * del participante quede correctamente escrito en la hoja `apuestas`.
 *
 * @return array{participant: string, phone: string}
 */
function authenticate(string $spreadsheetId, string $username, string $password, bool $dev, Sheets $service): array {
    if (!$dev) {
        if (!preg_match('/^\d{10}$/', $username)) {
            throw new Exception('El usuario debe tener exactamente 10 dígitos.');
        }
        if (!preg_match('/^\d{4}$/', $password)) {
            throw new Exception('La contraseña debe tener exactamente 4 dígitos.');
        }
    }

    // Sanitizar input: quedarse con los últimos 10/4 dígitos (en dev puede venir
    // con espacios, guiones, prefijos).
    $usernameClean = preg_replace('/\D+/', '', $username);
    $usernameLast10 = strlen($usernameClean) >= 10
        ? substr($usernameClean, -10)
        : $usernameClean;
    $passwordClean = preg_replace('/\D+/', '', $password);
    $passwordLast4 = strlen($passwordClean) >= 4
        ? substr($passwordClean, -4)
        : $passwordClean;

    $range = PARTICIPANTS_WORKSHEET . '!A2:E1000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues() ?: [];

    foreach ($rows as $row) {
        // Columna B puede traer prefijo país y separadores; limpiamos a
        // sólo dígitos y comparamos los últimos 10 contra el username.
        $rowPhoneRaw = trim((string)($row[1] ?? ''));
        $rowPhoneClean = preg_replace('/\D+/', '', $rowPhoneRaw);
        $rowPhoneLast10 = strlen($rowPhoneClean) >= 10
            ? substr($rowPhoneClean, -10)
            : '';

        // Columna C: limpiamos y comparamos los últimos 4 contra el password.
        $rowPasswordRaw = trim((string)($row[2] ?? ''));
        $rowPasswordClean = preg_replace('/\D+/', '', $rowPasswordRaw);
        $rowPasswordLast4 = strlen($rowPasswordClean) >= 4
            ? substr($rowPasswordClean, -4)
            : '';

        if ($rowPhoneLast10 !== '' && $rowPhoneLast10 === $usernameLast10
            && $rowPasswordLast4 !== '' && $rowPasswordLast4 === $passwordLast4) {
            return [
                'participant' => trim((string)($row[0] ?? '')),
                'phone' => $rowPhoneLast10
            ];
        }
    }

    http_response_code(401);
    throw new Exception('Credenciales inválidas.');
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

    foreach (['spreadsheetId', 'date', 'firstMatchTime', 'username', 'password', 'bets'] as $field) {
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
    $username = trim($data['username']);
    $password = trim($data['password']);
    $dev = $data['dev'] === true;

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        throw new Exception('date debe tener formato YYYY-MM-DD.');
    }
    if (!preg_match('/^\d{1,2}:\d{2}$/', $firstMatchTime)) {
        throw new Exception('firstMatchTime debe tener formato HH:MM.');
    }

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // 1. Autenticar contra la hoja `participantes`
    $auth = authenticate($spreadsheetId, $username, $password, $dev, $service);
    $participant = $auth['participant'];
    $phone = $auth['phone'];

    // 2. Validar ventana (server-side, hora COT)
    $window = validateWindow($date, $firstMatchTime);
    if (!$dev && !$window['ok']) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Ventana de apuestas cerrada.',
            'window' => $window
        ]);
        exit;
    }

    // 3. Generar ids determinísticos: pwa_<phone>_<date>_<matchId>
    $nowIso = (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    // Timestamp en formato WhatsApp-like (n/j/y H:i) en COT — coincide con
    // el formato de la columna B de los bets del seed.
    $cotTimestamp = (new DateTime('now', tz()))->format('n/j/y H:i');

    /** @var array<int, array{id: string, row: array}> */
    $newRows = [];
    foreach ($data['bets'] as $bet) {
        if (!isset($bet['matchId'], $bet['homeTeam'], $bet['awayTeam'], $bet['homeScore'], $bet['awayScore'])) {
            throw new Exception('Cada bet debe tener matchId, homeTeam, awayTeam, homeScore, awayScore.');
        }
        $homeScore = filter_var($bet['homeScore'], FILTER_VALIDATE_INT);
        $awayScore = filter_var($bet['awayScore'], FILTER_VALIDATE_INT);
        if ($homeScore === false || $homeScore < 0 || $homeScore > 9) {
            throw new Exception('homeScore debe ser entero entre 0 y 9.');
        }
        if ($awayScore === false || $awayScore < 0 || $awayScore > 9) {
            throw new Exception('awayScore debe ser entero entre 0 y 9.');
        }
        $id = sprintf('pwa_%s_%s_%s', $phone, $date, $bet['matchId']);
        $newRows[] = [
            'id' => $id,
            'row' => [
                $id,                          // A: id
                $cotTimestamp,                // B: timestamp (COT, formato seed)
                $participant,                 // C: participant
                $phone,                       // D: phone
                $date,                        // E: matchDate
                '',                           // F: vacía (alineada con seed)
                (string)$bet['homeTeam'],     // G
                (string)$bet['awayTeam'],     // H
                $homeScore,                   // I
                $awayScore,                   // J
                $nowIso                       // K: submittedAt (ISO)
            ]
        ];
    }

    // 4. Leer la hoja `apuestas` para detectar duplicados (idempotencia)
    /** @var array<string, int> $existingMap id => rowIndex (1-based) */
    $existingMap = [];
    /** @var array<int, array> $existingValues */
    $existingValues = [];
    $hasHeaders = false;

    try {
        $range = WORKSHEET . '!A1:K50000';
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
        error_log('save_pwa_bet: hoja apuestas no existe o error de lectura: ' . $e->getMessage());
    }

    // 5. Detectar duplicados y preparar inserts
    $inserts = [];
    $alreadyExists = [];
    $nextRow = count($existingValues) + 1;

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
        $existingMap[$id] = $nextRow;
        $nextRow++;
    }

    // 6. Headers si la hoja está vacía
    $batchOps = [];
    if (!$hasHeaders) {
        $batchOps[] = [
            'range' => WORKSHEET . '!A1:K1',
            'values' => [HEADERS]
        ];
    }

    // 7. Preparar batch update con los inserts
    foreach ($inserts as $ins) {
        $entry = null;
        foreach ($newRows as $nr) {
            if ($nr['id'] === $ins['id']) { $entry = $nr; break; }
        }
        if (!$entry) continue;
        $batchOps[] = [
            'range' => WORKSHEET . '!A' . $ins['rowIndex'] . ':K' . $ins['rowIndex'],
            'values' => [$entry['row']]
        ];
    }

    // 8. Ejecutar batch
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
    $code = http_response_code();
    if ($code === 200 || !$code) {
        http_response_code(500);
    }
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
