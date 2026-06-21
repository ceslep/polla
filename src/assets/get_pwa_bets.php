<?php
/**
 * get_pwa_bets.php - Leer apuestas del PWA desde Google Sheets
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/get_pwa_bets.php
 *
 * Lee la hoja "apuestas" escrita por save_pwa_bet.php y devuelve las filas
 * como objetos usando los encabezados de la primera fila.
 *
 * Filtros soportados (todos opcionales):
 *   - phone:        +57 315 6389889 (matchea los últimos 4 dígitos también)
 *   - matchDate:    YYYY-MM-DD (para "mis apuestas de hoy")
 *   - participant:  texto libre (case-insensitive)
 *
 * Si no se pasan filtros, devuelve todas las apuestas (uso admin).
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "phone": "...", "matchDate": "YYYY-MM-DD" }
 *
 * Respuesta:
 *   { "success": true, "bets": [ { id, participant, phone, ... } ], "total": N }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'apuestas';

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

    if (!isset($data['spreadsheetId'])) {
        throw new Exception('Se requiere spreadsheetId.');
    }

    $spreadsheetId = $data['spreadsheetId'];
    $filterPhone = isset($data['phone']) ? preg_replace('/\D+/', '', $data['phone']) : null;
    $filterDate = isset($data['matchDate']) ? trim($data['matchDate']) : null;
    $filterParticipant = isset($data['participant']) ? strtolower(trim($data['participant'])) : null;

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

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

        // Filtros
        if ($filterPhone !== null) {
            $rowPhoneDigits = preg_replace('/\D+/', '', $obj['phone'] ?? '');
            // Matchea por número completo o por últimos 4 dígitos
            if ($rowPhoneDigits !== $filterPhone
                && substr($rowPhoneDigits, -4) !== substr($filterPhone, -4)) {
                continue;
            }
        }
        if ($filterDate !== null) {
            if (($obj['matchDate'] ?? '') !== $filterDate) continue;
        }
        if ($filterParticipant !== null) {
            $rowPart = strtolower(trim($obj['participant'] ?? ''));
            if ($rowPart !== $filterParticipant) continue;
        }

        $obj['rowIndex'] = $i + 1;
        $bets[] = $obj;
    }

    // Ordenar por submittedAt descendente (más reciente primero)
    usort($bets, function ($a, $b) {
        return strcmp($b['submittedAt'] ?? '', $a['submittedAt'] ?? '');
    });

    echo json_encode([
        'success' => true,
        'bets' => $bets,
        'total' => count($bets)
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
