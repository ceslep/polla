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
 * @return array{participant: string, phone: string}
 */
function authenticate(string $spreadsheetId, string $username, string $password, bool $dev, Sheets $service): array {
    if ($dev) {
        return ['participant' => 'Dev User', 'phone' => $username];
    }
    if (!preg_match('/^\d{10}$/', $username)) {
        throw new Exception('El usuario debe tener exactamente 10 dígitos.');
    }
    if (!preg_match('/^\d{4}$/', $password)) {
        throw new Exception('La contraseña debe tener exactamente 4 dígitos.');
    }

    $range = PARTICIPANTS_WORKSHEET . '!A2:C1000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues() ?: [];

    foreach ($rows as $row) {
        $rowUsername = trim((string)($row[1] ?? ''));
        $rowPassword = trim((string)($row[2] ?? ''));
        if ($rowUsername === $username && $rowPassword === $password) {
            return [
                'participant' => trim((string)($row[0] ?? '')),
                'phone' => $rowUsername
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

    $range = WORKSHEET . '!A1:J50000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $allValues = $response->getValues() ?: [];

    if (count($allValues) === 0) {
        echo json_encode(['success' => true, 'bets' => [], 'total' => 0]);
        exit;
    }

    $headers = $allValues[0];
    $bets = [];

    for ($i = 1; $i < count($allValues); $i++) {
        $row = $allValues[$i];
        $obj = [];
        foreach ($headers as $col => $headerName) {
            $obj[$headerName] = $row[$col] ?? '';
        }

        // Filtro por phone autenticado (no el del payload)
        if (($obj['phone'] ?? '') !== $authedPhone) continue;

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
