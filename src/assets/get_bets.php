<?php
/**
 * get_bets.php - Obtener apuestas (polla mundialista) desde Google Sheets
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/get_bets.php
 *
 * Lee la hoja de apuestas (por defecto "datos") escrita por save_bets.php y
 * devuelve cada fila como objeto usando los encabezados de la primera fila.
 * Permite filtrar por participante.
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "worksheetTitle": "datos", "filterParticipant": "NOMBRE" }
 *
 * Respuesta:
 *   { "success": true, "bets": [ { id, participant, originalMessage, ... } ], "total": N }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';

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
        throw new Exception('JSON inválido.');
    }

    if (!isset($data['spreadsheetId'])) {
        throw new Exception('Se requiere el spreadsheetId.');
    }

    $spreadsheetId    = $data['spreadsheetId'];
    $worksheetTitle   = $data['worksheetTitle'] ?? 'datos';
    $filterParticipant = isset($data['filterParticipant'])
        ? strtolower(trim($data['filterParticipant']))
        : null;

    $client = new Client();
    $client->setApplicationName('Polla Mundialista');
    $client->setScopes([Sheets::SPREADSHEETS]);

    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    $range = $worksheetTitle . '!A1:T50000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $allValues = $response->getValues() ?: [];

    if (count($allValues) === 0) {
        echo json_encode(['success' => true, 'bets' => [], 'total' => 0]);
        exit;
    }

    // Primera fila = encabezados.
    $headers = $allValues[0];
    $bets = [];

    for ($i = 1; $i < count($allValues); $i++) {
        $row = $allValues[$i];

        // Construir objeto fila a partir de los encabezados.
        $obj = [];
        foreach ($headers as $col => $headerName) {
            $obj[$headerName] = $row[$col] ?? '';
        }

        if ($filterParticipant !== null) {
            $rowParticipant = strtolower(trim($obj['participant'] ?? ''));
            if ($rowParticipant !== $filterParticipant) {
                continue;
            }
        }

        $obj['rowIndex'] = $i + 1;
        $bets[] = $obj;
    }

    echo json_encode([
        'success' => true,
        'bets'    => $bets,
        'total'   => count($bets)
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ]);
}
?>
