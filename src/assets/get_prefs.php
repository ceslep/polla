<?php
/**
 * get_prefs.php - Leer preferencias por participante desde Google Sheets
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/get_prefs.php
 *
 * Lee la hoja "prefs" (2 columnas A:B) y devuelve la fila que matchea el
 * `phone` enviado. Si la hoja no existe o el phone no aparece, devuelve
 * defaults (seen_tour = false).
 *
 * Esquema de la hoja "prefs" (2 columnas A:B):
 *   A:phone          (10 dígitos, last-10; sin prefijo país ni separadores)
 *   B:seen_tour      (TRUE / FALSE)
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "phone": "3117250869" }
 *
 * Respuesta (200):
 *   { success: true, prefs: { phone, seen_tour: bool } }
 *
 * Errores:
 *   400 JSON inválido / falta spreadsheetId o phone
 *   500 error de Sheets
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'prefs';
const RANGE = 'prefs!A1:B50000';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Método no permitido. Use POST.', 405);
    }

    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('JSON inválido: ' . json_last_error_msg());
    }

    foreach (['spreadsheetId', 'phone'] as $field) {
        if (!isset($data[$field]) || trim((string)$data[$field]) === '') {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    $spreadsheetId = $data['spreadsheetId'];
    // Normalizamos a sólo dígitos, últimos 10 (mismo criterio que save_pwa_bet.php).
    $phoneRaw = (string)$data['phone'];
    $phoneClean = preg_replace('/\D+/', '', $phoneRaw);
    if (strlen($phoneClean) < 10) {
        throw new Exception('phone debe tener al menos 10 dígitos.');
    }
    $phone = substr($phoneClean, -10);

    $client = new Client();
    $client->setApplicationName('Polla Mundialista Prefs');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    $seenTour = false;
    try {
        $response = $service->spreadsheets_values->get($spreadsheetId, RANGE);
        $values = $response->getValues() ?: [];
        $hasHeaders = count($values) > 0 && strtolower(trim($values[0][0] ?? '')) === 'phone';
        $dataStart = $hasHeaders ? 1 : 0;
        for ($i = $dataStart; $i < count($values); $i++) {
            $rowPhone = trim((string)($values[$i][0] ?? ''));
            $rowPhoneDigits = preg_replace('/\D+/', '', $rowPhone);
            $rowPhoneLast10 = strlen($rowPhoneDigits) >= 10 ? substr($rowPhoneDigits, -10) : '';
            if ($rowPhoneLast10 === $phone) {
                $raw = strtolower(trim((string)($values[$i][1] ?? '')));
                $seenTour = in_array($raw, ['true', '1', 'yes'], true);
                break;
            }
        }
    } catch (Exception $e) {
        // Hoja prefs no existe aún → defaults (no rompe el flujo del frontend).
        error_log('get_prefs: hoja prefs no legible, defaults: ' . $e->getMessage());
    }

    echo json_encode([
        'success' => true,
        'prefs' => [
            'phone' => $phone,
            'seen_tour' => $seenTour,
        ],
    ]);

} catch (Exception $e) {
    $code = http_response_code();
    if ($code === 200 || !$code) {
        http_response_code(500);
    }
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
