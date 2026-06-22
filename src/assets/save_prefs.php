<?php
/**
 * save_prefs.php - Guardar preferencias de un participante en Google Sheets
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/save_prefs.php
 *
 * UPSERT por phone en la hoja "prefs" (2 columnas A:B).
 * Crea los headers en la primera fila si la hoja está vacía.
 *
 * Esquema de la hoja "prefs":
 *   A:phone          (10 dígitos, last-10)
 *   B:seen_tour      (TRUE / FALSE)
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "phone": "3117250869", "seen_tour": true }
 *
 * Respuesta (200):
 *   { success: true, action: "updated" | "inserted" | "unchanged",
 *     prefs: { phone, seen_tour } }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\BatchUpdateValuesRequest;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'prefs';
const RANGE = 'prefs!A1:B50000';
const HEADERS = ['phone', 'seen_tour'];

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
    $phoneRaw = (string)$data['phone'];
    $phoneClean = preg_replace('/\D+/', '', $phoneRaw);
    if (strlen($phoneClean) < 10) {
        throw new Exception('phone debe tener al menos 10 dígitos.');
    }
    $phone = substr($phoneClean, -10);
    $seenTour = filter_var($data['seen_tour'] ?? false, FILTER_VALIDATE_BOOLEAN);

    $client = new Client();
    $client->setApplicationName('Polla Mundialista Prefs');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // 1. Leer prefs existentes
    $existingMap = []; // phone (last10) => rowIndex 1-based
    $hasHeaders = false;
    $existingCount = 0;
    try {
        $response = $service->spreadsheets_values->get($spreadsheetId, RANGE);
        $values = $response->getValues() ?: [];
        $hasHeaders = count($values) > 0 && strtolower(trim($values[0][0] ?? '')) === 'phone';
        $dataStart = $hasHeaders ? 1 : 0;
        for ($i = $dataStart; $i < count($values); $i++) {
            $rowPhone = trim((string)($values[$i][0] ?? ''));
            $digits = preg_replace('/\D+/', '', $rowPhone);
            $last10 = strlen($digits) >= 10 ? substr($digits, -10) : '';
            if ($last10 !== '') {
                $existingMap[$last10] = $i + 1;
            }
        }
        $existingCount = count($values);
    } catch (Exception $e) {
        error_log('save_prefs: hoja prefs no legible, se asume vacía: ' . $e->getMessage());
    }

    $action = 'unchanged';
    $ops = [];

    // 2. Headers si la hoja está vacía
    if (!$hasHeaders) {
        $ops[] = [
            'range' => WORKSHEET . '!A1:B1',
            'values' => [HEADERS],
        ];
    }

    $newRow = [$phone, $seenTour ? 'TRUE' : 'FALSE'];

    if (isset($existingMap[$phone])) {
        // UPDATE
        $rowIndex = $existingMap[$phone];
        $ops[] = [
            'range' => WORKSHEET . '!A' . $rowIndex . ':B' . $rowIndex,
            'values' => [$newRow],
        ];
        $action = 'updated';
    } else {
        // INSERT
        $nextRow = max($existingCount + 1, ($hasHeaders ? 2 : 1));
        $ops[] = [
            'range' => WORKSHEET . '!A' . $nextRow . ':B' . $nextRow,
            'values' => [$newRow],
        ];
        $action = 'inserted';
    }

    if (count($ops) > 0) {
        $body = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data' => $ops,
        ]);
        $service->spreadsheets_values->batchUpdate($spreadsheetId, $body);
    }

    echo json_encode([
        'success' => true,
        'action' => $action,
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
