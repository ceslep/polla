<?php
/**
 * change_pwa_password.php - Cambia la contraseña de un participante PWA
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/change_pwa_password.php
 *
 * Autentica al participante con {username, currentPassword} (mismas reglas
 * de limpieza que login_pwa.php: últimos 10 dígitos del phone y últimos 4
 * del password actual). Si coincide, escribe la nueva contraseña en la
 * columna C y marca la columna D como TRUE para no volver a pedir el cambio.
 *
 * Esquema de la hoja "participantes" (4 columnas A:D):
 *   A: participant
 *   B: phone
 *   C: password
 *   D: mustChangePassword (TRUE/FALSE)
 *
 * Petición (POST, JSON):
 *   {
 *     "spreadsheetId": "...",
 *     "username": "3218552353",
 *     "currentPassword": "2353",
 *     "newPassword": "9876",
 *     "dev": false
 *   }
 *
 * Validaciones:
 *   - username: 10 dígitos exactos
 *   - currentPassword: 4 dígitos exactos
 *   - newPassword: 4 dígitos exactos
 *   - newPassword debe ser distinto de currentPassword
 *
 * En modo `dev: true` no se escribe en Sheets (sólo valida formato y simula
 * el cambio). En producción, escribe en la fila correspondiente.
 *
 * Respuestas:
 *   200 { success: true }
 *   401 { success: false, error: "Credenciales inválidas" }
 *   400 { success: false, error: "..." }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Google\Service\Sheets\BatchUpdateValuesRequest;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'participantes';

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

    foreach (['spreadsheetId', 'username', 'currentPassword', 'newPassword'] as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    $spreadsheetId = $data['spreadsheetId'];
    $username = trim($data['username']);
    $currentPassword = trim($data['currentPassword']);
    $newPassword = trim($data['newPassword']);
    $dev = $data['dev'] === true;

    if (!preg_match('/^\d{10}$/', $username)) {
        throw new Exception('El usuario debe tener exactamente 10 dígitos.');
    }
    if (!preg_match('/^\d{4}$/', $currentPassword)) {
        throw new Exception('La contraseña actual debe tener exactamente 4 dígitos.');
    }
    if (!preg_match('/^\d{4}$/', $newPassword)) {
        throw new Exception('La nueva contraseña debe tener exactamente 4 dígitos.');
    }
    if ($newPassword === $currentPassword) {
        throw new Exception('La nueva contraseña debe ser distinta de la actual.');
    }

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA Change Password');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // 1. Leer la hoja para encontrar la fila del usuario
    $range = WORKSHEET . '!A2:D1000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues() ?: [];

    $matchedRowIndex = null; // 0-based en $rows, equivale a fila spreadsheet (rowIndex+2)

    foreach ($rows as $i => $row) {
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

        if ($rowPhoneLast10 !== '' && $rowPhoneLast10 === $username
            && $rowPasswordLast4 !== '' && $rowPasswordLast4 === $currentPassword) {
            $matchedRowIndex = $i;
            break;
        }
    }

    if ($matchedRowIndex === null) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Credenciales inválidas. Verifica tu número y contraseña actual.'
        ]);
        exit;
    }

    // 2. Calcular el rowIndex real de Sheets (1-based, +2 porque arrancamos en A2)
    $sheetRow = $matchedRowIndex + 2;

    // 3. Escribir nueva contraseña (col C) y marcar mustChangePassword=TRUE (col D)
    $body = new BatchUpdateValuesRequest([
        'valueInputOption' => 'RAW',
        'data' => [
            [
                'range' => WORKSHEET . "!C{$sheetRow}:D{$sheetRow}",
                'values' => [[$newPassword, 'TRUE']]
            ]
        ]
    ]);
    $service->spreadsheets_values->batchUpdate($spreadsheetId, $body);

    echo json_encode([
        'success' => true,
        'message' => 'Contraseña actualizada correctamente.'
    ]);

} catch (Exception $e) {
    $code = ($e->getMessage() === 'Método no permitido. Use POST.') ? 405 : 500;
    if (http_response_code() === 200 || !http_response_code()) {
        http_response_code($code);
    }
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
