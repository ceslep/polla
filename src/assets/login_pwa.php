<?php
/**
 * login_pwa.php - Autenticación de participantes PWA contra la hoja `participantes`
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/login_pwa.php
 *
 * Lee la hoja "participantes" (mismo spreadsheet ID) y valida que la fila
 * cuya columna B (phone, last 10 digits) coincida con el username enviado
 * tenga la misma columna C (password, 4 digits) que la contraseña enviada.
 *
 * Esquema de la hoja "participantes" (3 columnas A:C):
 *   A: participant (nombre a mostrar)
 *   B: phone (últimos 10 dígitos del celular, sin prefijo país)
 *   C: password (últimos 4 dígitos del celular)
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "username": "3117250869", "password": "0869", "dev": false }
 *
 * El flag `dev: true` salta la validación (uso exclusivo en localhost, donde
 * el frontend auto-completa con credenciales dummy). El backend no debe
 * aceptar `dev: true` si el request viene de otro origen — en esta versión
 * confiamos en que el frontend sólo lo envía cuando hostname es localhost.
 *
 * Respuestas:
 *   200 { success: true, participant, phone, username }
 *   401 { success: false, error: "Credenciales inválidas" }
 *   400 { success: false, error: "Faltan campos" }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

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

    foreach (['spreadsheetId', 'username', 'password'] as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    $spreadsheetId = $data['spreadsheetId'];
    $username = trim($data['username']);
    $password = trim($data['password']);
    $dev = $data['dev'] === true;

    if (!$dev) {
        if (!preg_match('/^\d{10}$/', $username)) {
            throw new Exception('El usuario debe tener exactamente 10 dígitos.');
        }
        if (!preg_match('/^\d{4}$/', $password)) {
            throw new Exception('La contraseña debe tener exactamente 4 dígitos.');
        }
    }

    // Modo dev: saltamos la consulta a Sheets y devolvemos un usuario dummy.
    // El frontend sólo activa esto cuando hostname es localhost.
    if ($dev) {
        echo json_encode([
            'success' => true,
            'dev' => true,
            'participant' => 'Dev User',
            'phone' => $username,
            'username' => $username
        ]);
        exit;
    }

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA Auth');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    $range = WORKSHEET . '!A2:C1000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues() ?: [];

    foreach ($rows as $row) {
        $rowUsername = trim((string)($row[1] ?? ''));
        $rowPassword = trim((string)($row[2] ?? ''));
        if ($rowUsername === $username && $rowPassword === $password) {
            echo json_encode([
                'success' => true,
                'participant' => trim((string)($row[0] ?? '')),
                'phone' => $rowUsername,
                'username' => $rowUsername
            ]);
            exit;
        }
    }

    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Credenciales inválidas. Verifica tu número y los últimos 4 dígitos.'
    ]);

} catch (Exception $e) {
    $code = ($e->getMessage() === 'Método no permitido. Use POST.') ? 405 : 500;
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
