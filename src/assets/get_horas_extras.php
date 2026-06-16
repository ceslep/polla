<?php
/**
 * get_horas_extras.php - Obtener registros de horas extras y firmas desde Google Sheets
 *
 * Para hoja "extras": filtros por grado, materia
 * Para hoja "firmas": filtro por docente
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

    $spreadsheetId = $data['spreadsheetId'];
    $worksheetTitle = $data['worksheetTitle'] ?? 'extras';
    $filterGrado = isset($data['filterGrado']) ? strtolower(trim($data['filterGrado'])) : null;
    $filterMateria = isset($data['filterMateria']) ? strtolower(trim($data['filterMateria'])) : null;
    $filterDocente = isset($data['filterDocente']) ? strtolower(trim($data['filterDocente'])) : null;
    
    // Determinar el rango basado en la hoja
    if ($worksheetTitle === 'firmas') {
        $range = 'firmas!A1:B5000';
    } else {
        $range = $worksheetTitle . '!A1:P5000';
    }

    $client = new Client();
    $client->setApplicationName('Horas Extras');
    $client->setScopes([Sheets::SPREADSHEETS]);

    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $allValues = $response->getValues() ?: [];

    $records = [];
    
    // Manejar hoja "firmas" con filtro por docente
    if ($worksheetTitle === 'firmas') {
        for ($i = 1; $i < count($allValues); $i++) {
            $row = $allValues[$i];
            $rowDocente = isset($row[0]) ? strtolower(trim($row[0])) : '';
            
            if ($filterDocente !== null && $rowDocente !== $filterDocente) {
                continue;
            }
            
            $records[] = [
                'rowIndex' => $i + 1,
                'values' => $row
            ];
        }
    } else {
        // Hoja "extras" con filtros por grado y materia
        for ($i = 1; $i < count($allValues); $i++) {
            $row = $allValues[$i];
            $rowGrado = isset($row[7]) ? strtolower(trim($row[7])) : '';
            $rowMateria = isset($row[8]) ? strtolower(trim($row[8])) : '';

            if ($filterGrado !== null && $rowGrado !== $filterGrado) {
                continue;
            }
            if ($filterMateria !== null && $rowMateria !== $filterMateria) {
                continue;
            }

            $records[] = [
                'rowIndex' => $i + 1,
                'values' => $row
            ];
        }
    }

    echo json_encode([
        'success' => true,
        'records' => $records,
        'total' => count($records)
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>