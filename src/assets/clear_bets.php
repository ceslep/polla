<?php
/**
 * clear_bets.php - Borra todas las filas de datos en Google Sheets
 *
 * Solo borra filas de datos (empieza en fila 2), preserva los headers.
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "worksheetTitle": "datos" }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\BatchUpdateSpreadsheetRequest;
use Google\Service\Sheets\DeleteDimensionRequest;
use Google\Service\Sheets\DimensionRange;

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';

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

    $spreadsheetId  = $data['spreadsheetId'];
    $worksheetTitle = $data['worksheetTitle'] ?? 'datos';

    $client = new Client();
    $client->setApplicationName('Polla Mundialista');
    $client->setScopes([Sheets::SPREADSHEETS]);

    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // Obtener info de la hoja para saber cuántas filas tiene
    $spreadsheet = $service->spreadsheets->get($spreadsheetId);
    $sheets = $spreadsheet->getSheets();
    $sheetId = null;

    foreach ($sheets as $sheet) {
        if ($sheet->getProperties()->getTitle() === $worksheetTitle) {
            $sheetId = $sheet->getProperties()->getSheetId();
            break;
        }
    }

    if ($sheetId === null) {
        throw new Exception("No se encontró la hoja '{$worksheetTitle}'.");
    }

    // Leer cuántas filas tienen datos
    $range = $worksheetTitle . '!A1:T1';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $values = $response->getValues() ?: [];
    $rowCount = count($values);

    $deletedRows = 0;
    if ($rowCount > 1) {
        // Borrar todas las filas de datos (desde fila 2 hasta el final)
        $deleteDimension = new DeleteDimensionRequest([
            'range' => new DimensionRange([
                'sheetId' => $sheetId,
                'dimension' => 'ROWS',
                'startIndex' => 1,  // Empezar en fila 2 (0-indexed)
                'endIndex' => $rowCount
            ])
        ]);

        $batchUpdateRequest = new BatchUpdateSpreadsheetRequest([
            'requests' => [['deleteDimension' => $deleteDimension]]
        ]);

        $service->spreadsheets->batchUpdate($spreadsheetId, $batchUpdateRequest);
        $deletedRows = $rowCount - 1;
    }

    echo json_encode([
        'success' => true,
        'message' => "Se borraron {$deletedRows} filas de Google Sheets.",
        'deleted' => $deletedRows
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ]);
}
?>
