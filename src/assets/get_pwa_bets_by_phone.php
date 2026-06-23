<?php
/**
 * get_pwa_bets_by_phone.php - Leer apuestas de un participante arbitrario (root auth)
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/get_pwa_bets_by_phone.php
 *
 * Devuelve los bets de la hoja `apuestas` cuyo `phone` (col D) coincide con
 * el `targetPhone` enviado. Pensado para que el panel root (PwaRootPanel)
 * verifique si un participante ya envió apuestas para una fecha, sin
 * tener que pedirle su contraseña al root.
 *
 * Auth: {username, password} validados contra `participantes`. El authed
 * user DEBE tener isRoot=TRUE en columna F; si no, devuelve 403.
 *
 * Petición (POST, JSON):
 *   {
 *     "spreadsheetId": "...",
 *     "username": "...",
 *     "password": "...",
 *     "dev": false,
 *     "targetPhone": "3117250869",      // 10 dígitos (col B de `participantes`)
 *     "matchDate": "YYYY-MM-DD"         // (opcional) filtra por matchDate
 *   }
 *
 * Respuestas:
 *   200 { success: true, bets: [ ... ], total: N, target: {name, phone} }
 *   400 { success: false, error: "targetPhone requerido / inválido" }
 *   401 { success: false, error: "Credenciales inválidas" }
 *   403 { success: false, error: "Se requieren permisos de root." }
 *   404 { success: false, error: "El targetPhone no existe en la hoja." }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

// PHPMailer: el `vendor/` del host solo tiene el Google client (Composer no
// instaló PHPMailer). Lo cargamos igual que `solicitarCodigo2.php` desde la
// carpeta `phpmailer/src/` que ya vive en el host. `require_once` es
// idempotente, así que si en el futuro se añade por Composer no duplica.
require_once __DIR__ . '/phpmailer/src/Exception.php';
require_once __DIR__ . '/phpmailer/src/PHPMailer.php';
require_once __DIR__ . '/phpmailer/src/SMTP.php';

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'apuestas';
const PARTICIPANTS_WORKSHEET = 'participantes';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
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

    foreach (['spreadsheetId', 'username', 'password', 'targetPhone'] as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    $spreadsheetId = $data['spreadsheetId'];
    $username = trim($data['username']);
    $password = trim($data['password']);
    $targetPhoneRaw = trim((string)$data['targetPhone']);
    $filterDate = isset($data['matchDate']) ? trim((string)$data['matchDate']) : null;
    $dev = ($data['dev'] ?? false) === true;

    if (!$dev) {
        if (!preg_match('/^\d{10}$/', $username)) {
            throw new Exception('El usuario debe tener exactamente 10 dígitos.');
        }
        if (!preg_match('/^\d{4}$/', $password)) {
            throw new Exception('La contraseña debe tener exactamente 4 dígitos.');
        }
    }

    $usernameClean = preg_replace('/\D+/', '', $username);
    $usernameLast10 = strlen($usernameClean) >= 10
        ? substr($usernameClean, -10)
        : $usernameClean;
    $passwordClean = preg_replace('/\D+/', '', $password);
    $passwordLast4 = strlen($passwordClean) >= 4
        ? substr($passwordClean, -4)
        : $passwordClean;

    $targetPhoneClean = preg_replace('/\D+/', '', $targetPhoneRaw);
    $targetPhoneLast10 = strlen($targetPhoneClean) >= 10
        ? substr($targetPhoneClean, -10)
        : $targetPhoneClean;
    if (!preg_match('/^\d{10}$/', $targetPhoneLast10)) {
        throw new Exception('targetPhone debe tener exactamente 10 dígitos.');
    }

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA Root');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // 1. Validar caller: tiene que existir en `participantes` con isRoot=TRUE.
    $callerIsRoot = false;
    $targetName = null;
    $participantsRange = PARTICIPANTS_WORKSHEET . '!A2:F1000';
    $participantsResponse = $service->spreadsheets_values->get($spreadsheetId, $participantsRange);
    $participantsRows = $participantsResponse->getValues() ?: [];

    foreach ($participantsRows as $row) {
        $rowPhoneRaw = trim((string)($row[1] ?? ''));
        $rowPhoneClean = preg_replace('/\D+/', '', $rowPhoneRaw);
        $rowPhoneLast10 = strlen($rowPhoneClean) >= 10
            ? substr($rowPhoneClean, -10)
            : '';
        $rowPasswordRaw = trim((string)($row[2] ?? ''));
        $rowPasswordClean = preg_replace('/\D+/', '', $rowPasswordRaw);
        $rowPasswordLast4 = strlen($rowPasswordClean) >= 4
            ? substr($rowPasswordClean, -4)
            : '';
        $rowIsRootRaw = strtolower(trim((string)($row[5] ?? '')));
        $rowIsRoot = in_array($rowIsRootRaw, ['true', '1', 'yes', 'si'], true);

        if (!$callerIsRoot
            && $rowPhoneLast10 !== '' && $rowPhoneLast10 === $usernameLast10
            && $rowPasswordLast4 !== '' && $rowPasswordLast4 === $passwordLast4
            && $rowIsRoot) {
            $callerIsRoot = true;
        }

        if ($rowPhoneLast10 === $targetPhoneLast10) {
            $targetName = trim((string)($row[0] ?? ''));
        }
    }

    if (!$callerIsRoot) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Se requieren permisos de root (isRoot=TRUE) para leer apuestas de otros.'
        ]);
        exit;
    }

    if ($targetName === null) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'El participante destino (targetPhone) no existe en la hoja.'
        ]);
        exit;
    }

    // 2. Leer la hoja `apuestas` y filtrar por phone del target.
    $range = WORKSHEET . '!A1:K50000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $allValues = $response->getValues() ?: [];

    if (count($allValues) === 0) {
        echo json_encode([
            'success' => true,
            'bets' => [],
            'total' => 0,
            'target' => ['name' => $targetName, 'phone' => $targetPhoneLast10]
        ]);
        exit;
    }

    $headers = $allValues[0];
    $bets = [];

    // Misma normalización que get_pwa_bets.php para que el frontend lea
    // siempre las mismas claves (participant, matchDate, homeTeam, etc.).
    $aliasMap = [
        'participant' => ['participant', 'participante'],
        'phone'       => ['phone'],
        'matchDate'   => ['matchDate', 'date'],
        'matchId'     => ['matchId'],
        'homeTeam'    => ['homeTeam', 'team1'],
        'awayTeam'    => ['awayTeam', 'team2'],
        'homeScore'   => ['homeScore', 'score1'],
        'awayScore'   => ['awayScore', 'score2'],
        'submittedAt' => ['submittedAt', 'timestamp', 'datetime'],
    ];

    for ($i = 1; $i < count($allValues); $i++) {
        $row = $allValues[$i];
        $raw = [];
        foreach ($headers as $col => $headerName) {
            $raw[$headerName] = $row[$col] ?? '';
        }

        if (($raw['phone'] ?? '') !== $targetPhoneLast10) continue;

        $obj = ['id' => $raw['id'] ?? ''];
        foreach ($aliasMap as $canonical => $aliases) {
            $value = '';
            foreach ($aliases as $alias) {
                if (isset($raw[$alias]) && $raw[$alias] !== '') {
                    $value = $raw[$alias];
                    break;
                }
            }
            $obj[$canonical] = $value;
        }

        if ($filterDate !== null && $filterDate !== '') {
            if (($obj['matchDate'] ?? '') !== $filterDate) continue;
        }

        $obj['rowIndex'] = $i + 1;
        $bets[] = $obj;
    }

    usort($bets, function ($a, $b) {
        return strcmp($b['submittedAt'] ?? '', $a['submittedAt'] ?? '');
    });

    echo json_encode([
        'success' => true,
        'bets' => $bets,
        'total' => count($bets),
        'target' => ['name' => $targetName, 'phone' => $targetPhoneLast10]
    ]);

} catch (Exception $e) {
    $code = ($e->getMessage() === 'Método no permitido. Use POST.') ? 405 : 500;
    if ($code === 500) {
        $code = http_response_code() ?: 500;
    }
    if ($code === 200 || !$code) {
        $code = 500;
    }
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
