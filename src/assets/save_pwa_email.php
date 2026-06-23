<?php
/**
 * save_pwa_email.php - Guarda (o limpia) el email de notificaciones de un
 * participante PWA en la hoja `participantes`.
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/save_pwa_email.php
 *
 * El email es OPCIONAL: el frontend puede enviar `email: ''` para borrarlo.
 * El backend valida formato con filter_var(FILTER_VALIDATE_EMAIL) cuando viene
 * no vacío. Autentica al participante con {username, currentPassword}
 * (mismas reglas de limpieza que login_pwa.php: últimos 10 dígitos del phone
 * y últimos 4 del password).
 *
 * Esquema de la hoja "participantes" (5 columnas A:E):
 *   A: participant
 *   B: phone
 *   C: password
 *   D: mustChangePassword (TRUE/FALSE)
 *   E: email               (opcional, esta feature la agregó)
 *
 * Petición (POST, JSON):
 *   {
 *     "spreadsheetId": "...",
 *     "username": "3218552353",
 *     "currentPassword": "2353",
 *     "email": "nombre@dominio.com"  // o "" para borrar
 *     "dev": false
 *   }
 *
 * Validaciones:
 *   - username: 10 dígitos exactos
 *   - currentPassword: 4 dígitos exactos
 *   - email: si viene no vacío, debe pasar filter_var FILTER_VALIDATE_EMAIL
 *           y no superar 254 caracteres (límite RFC 5321)
 *
 * En modo `dev: true` no se escribe en Sheets (sólo valida formato y simula
 * el guardado). En producción, escribe en la fila correspondiente.
 *
 * Respuestas:
 *   200 { success: true, email: "..." }
 *   401 { success: false, error: "Credenciales inválidas" }
 *   400 { success: false, error: "..." }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
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

    foreach (['spreadsheetId', 'username', 'currentPassword', 'email'] as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    $spreadsheetId = $data['spreadsheetId'];
    $username = trim($data['username']);
    $currentPassword = trim($data['currentPassword']);
    $email = trim((string)$data['email']);
    $dev = ($data['dev'] ?? false) === true;

    if (!preg_match('/^\d{10}$/', $username)) {
        throw new Exception('El usuario debe tener exactamente 10 dígitos.');
    }
    if (!preg_match('/^\d{4}$/', $currentPassword)) {
        throw new Exception('La contraseña actual debe tener exactamente 4 dígitos.');
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new Exception('El email no tiene un formato válido.');
    }
    if (strlen($email) > 254) {
        throw new Exception('El email no puede superar 254 caracteres.');
    }

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA Save Email');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // 1. Leer la hoja para encontrar la fila del usuario (A2:E1000 para
    //    incluir la columna E aunque no la usemos aquí — debe existir el
    //    header).
    $range = WORKSHEET . '!A2:E1000';
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

    // 3. Escribir email en columna E (string vacío para borrar)
    $body = new BatchUpdateValuesRequest([
        'valueInputOption' => 'RAW',
        'data' => [
            [
                'range' => WORKSHEET . "!E{$sheetRow}:E{$sheetRow}",
                'values' => [[$email]]
            ]
        ]
    ]);
    $service->spreadsheets_values->batchUpdate($spreadsheetId, $body);

    echo json_encode([
        'success' => true,
        'email' => $email,
        'message' => $email === ''
            ? 'Email eliminado.'
            : 'Email guardado correctamente.'
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
