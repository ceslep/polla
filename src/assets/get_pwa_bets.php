<?php
/**
 * get_pwa_bets.php - Leer apuestas del PWA desde Google Sheets (auth requerida)
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/get_pwa_bets.php
 *
 * Lee la hoja "apuestas" y devuelve los bets del participante autenticado.
 * Si el flag `matchDate` viene, filtra además por fecha.
 *
 * Auth: {username, password} validados contra la hoja "participantes".
 * `dev: true` salta la validación.
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "username": "...", "password": "...", "dev": false, "matchDate": "YYYY-MM-DD" }
 *
 * Respuesta:
 *   200 { success: true, bets: [ ... ], total: N }
 *   401 { success: false, error: "..." }
 *   403 { success: false, error: "Debes cambiar tu contraseña / registrar email" }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

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

/**
 * Misma función que save_pwa_bet.php. Si la duplicación crece, mover a un
 * helper compartido en src/assets/_lib/.
 *
 * En dev mode (`$dev === true`) se salta la validación de formato (10/4 dígitos)
 * pero se hace el lookup real en la hoja `participantes` para que el nombre
 * del participante sea el real (no "Dev User").
 *
 * @return array{participant: string, phone: string, passwordChanged: bool, email: string}
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

    // Sanitizar input: quedarse con los últimos 10/4 dígitos.
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
            // Columna D: TRUE/FALSE. TRUE = el usuario YA cambió su contraseña.
            $rowMustChangeRaw = strtolower(trim((string)($row[3] ?? '')));
            $passwordChanged = in_array($rowMustChangeRaw, ['true', '1', 'yes', 'si'], true);

            // Columna E: email (puede estar vacía).
            $email = trim((string)($row[4] ?? ''));

            return [
                'participant' => trim((string)($row[0] ?? '')),
                'phone' => $rowPhoneLast10,
                'passwordChanged' => $passwordChanged,
                'email' => $email
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

    foreach (['spreadsheetId', 'username', 'password'] as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    $spreadsheetId = $data['spreadsheetId'];
    $username = trim($data['username']);
    $password = trim($data['password']);
    $dev = $data['dev'] === true;
    $filterDate = isset($data['matchDate']) ? trim($data['matchDate']) : null;

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    $auth = authenticate($spreadsheetId, $username, $password, $dev, $service);
    $authedPhone = $auth['phone'];

    // Gates de cumplimiento: D = passwordChanged, E = email.
    if (empty($auth['passwordChanged'])) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Debes cambiar tu contraseña antes de consultar tus apuestas.'
        ]);
        exit;
    }
    if (empty($auth['email'])) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Debes registrar un correo electrónico antes de consultar tus apuestas.'
        ]);
        exit;
    }

    $range = WORKSHEET . '!A1:K50000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $allValues = $response->getValues() ?: [];

    if (count($allValues) === 0) {
        echo json_encode(['success' => true, 'bets' => [], 'total' => 0]);
        exit;
    }

    $headers = $allValues[0];
    $bets = [];

    // La hoja "apuestas" puede tener dos schemas distintos (PWA:11 cols vs
    // seed:11 cols con nombres distintos). Normalizamos al PWA schema para
    // que el frontend siempre lea las mismas claves (matchDate, homeTeam,
    // participant, submittedAt, etc.).
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

        // Filtro por phone autenticado (no el del payload). En ambos schemas
        // la columna se llama "phone".
        if (($raw['phone'] ?? '') !== $authedPhone) continue;

        // Mapear al PWA schema.
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

        if ($filterDate !== null) {
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
        'participant' => $auth['participant'],
        'phone' => $authedPhone
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
