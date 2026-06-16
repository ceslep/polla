<?php
/**
 * save_horas_extras.php - Guardado de horas extras y firmas en Google Sheets
 *
 * Hoja "extras" (16 columnas A:P):
 *   A:fecha, B:DIA, C:MES, D:AÑO, E:docente, F:HORA DE ENTRADA, G:HORA DE SALIDA,
 *   H:GRADO ATENDIDO, I:ASIGNATURA, J:ACTIVIDAD, K:HORAS EXTRAS,
 *   L:FIRMA DEL DOCENTE, M:OBSERVACIONES O NOVEDADES, N:ESCALAFON,
 *   O:(libre), P:CEDULA
 *
 * Hoja "firmas" (2 columnas A:B):
 *   DOCENTE, FIRMA_BASE64
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;

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

    // Debug log
    error_log("save_horas_extras.php recibido: " . $input);

    if (!isset($data['spreadsheetId'])) {
        throw new Exception('Se requiere el spreadsheetId.');
    }

    $spreadsheetId = $data['spreadsheetId'];
    $worksheetTitle = $data['worksheetTitle'] ?? 'extras';
    
    // Debug log
    error_log("worksheetTitle: " . $worksheetTitle);

    $client = new Client();
    $client->setApplicationName('Horas Extras');
    $client->setScopes([Sheets::SPREADSHEETS]);

    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    if (!isset($data['values']) || !is_array($data['values'])) {
        throw new Exception('Se requieren los valores a guardar.');
    }

    $values = $data['values'];
    $rowIndex = $data['rowIndex'] ?? null;

    // Manejar hoja "firmas" de manera especial
    if ($worksheetTitle === 'firmas') {
        $range = 'firmas!A1:B5000';
        
        try {
            // Obtener registros existentes para buscar si el docente ya existe
            $response = $service->spreadsheets_values->get($spreadsheetId, $range);
            $allValues = $response->getValues() ?: [];
        } catch (Exception $e) {
            error_log("Error al obtener datos de firmas: " . $e->getMessage());
            throw new Exception("Error al acceder a hoja firmas: " . $e->getMessage());
        }
        
        $docenteABuscar = strtolower(trim($values[0]));
        error_log("Buscando docente: " . $docenteABuscar);
        $existingRowIndex = null;
        
        // Buscar si el docente ya existe (ignorando primera fila si es header)
        for ($i = 1; $i < count($allValues); $i++) {
            $row = $allValues[$i];
            if (isset($row[0]) && strtolower(trim($row[0])) === $docenteABuscar) {
                $existingRowIndex = $i + 1; // +1 porque rowIndex es 1-based
                break;
            }
        }
        
        // Verificar si hay headers, si no agregar
        if (count($allValues) === 0) {
            try {
                // No hay datos, agregar headers
                $headerRange = 'firmas!A1:B1';
                $headerBody = new ValueRange(['values' => [['DOCENTE', 'FIRMA_BASE64']]]);
                $service->spreadsheets_values->update($spreadsheetId, $headerRange, $headerBody, ['valueInputOption' => 'RAW']);
                error_log("Headers de firmas creados");
            } catch (Exception $e) {
                error_log("Error al crear headers de firmas: " . $e->getMessage());
                throw new Exception("Error al crear headers de firmas: " . $e->getMessage());
            }
        }
        
        if ($existingRowIndex !== null) {
            try {
                // Actualizar firma existente
                $insertRange = "firmas!A{$existingRowIndex}:B{$existingRowIndex}";
                $body = new ValueRange(['values' => [$values]]);
                $params = ['valueInputOption' => 'RAW'];
                $service->spreadsheets_values->update($spreadsheetId, $insertRange, $body, $params);
                echo json_encode([
                    'success' => true,
                    'message' => 'Firma actualizada exitosamente.',
                    'rowIndex' => $existingRowIndex,
                    'updated' => true
                ]);
            } catch (Exception $e) {
                error_log("Error al actualizar firma: " . $e->getMessage());
                throw new Exception("Error al actualizar firma: " . $e->getMessage());
            }
        } else {
            try {
                // Insertar nueva firma
                $nextRow = count($allValues) + 1;
                if ($nextRow === 1 && count($allValues) === 0) {
                    // La hoja está vacía, el header fue agregado arriba, entonces la data va en fila 2
                    $nextRow = 2;
                }
                error_log("Insertando firma en fila: " . $nextRow);
                $insertRange = "firmas!A{$nextRow}:B{$nextRow}";
                $body = new ValueRange(['values' => [$values]]);
                $params = ['valueInputOption' => 'RAW'];
                $service->spreadsheets_values->update($spreadsheetId, $insertRange, $body, $params);
                echo json_encode([
                    'success' => true,
                    'message' => 'Firma guardada exitosamente.',
                    'rowIndex' => $nextRow,
                    'updated' => false
                ]);
            } catch (Exception $e) {
                error_log("Error al insertar firma: " . $e->getMessage());
                throw new Exception("Error al insertar firma: " . $e->getMessage());
            }
        }
        exit;
    }

    // Hoja "extras" (comportamiento original)
    $range = $worksheetTitle . '!A1:P5000';

    $headers = [
        'FECHA', 'DIA', 'MES', 'AÑO', 'DOCENTE', 'HORA DE ENTRADA',
        'HORA DE SALIDA', 'GRADO ATENDIDO', 'ASIGNATURA', 'ACTIVIDAD',
        'HORAS EXTRAS', 'FIRMA DEL DOCENTE', 'OBSERVACIONES O NOVEDADES',
        'ESCALAFON', 'CEDULA'
    ];

    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $allValues = $response->getValues() ?: [];
    $nextRow = count($allValues) + 1;

    if ($nextRow <= 1) {
        $headerRange = $worksheetTitle . '!A1:P1';
        $headerBody = new ValueRange(['values' => [$headers]]);
        $service->spreadsheets_values->update($spreadsheetId, $headerRange, $headerBody, ['valueInputOption' => 'RAW']);
        $nextRow = 2;
    }

    $lastCol = 'P';
    if ($rowIndex !== null) {
        $insertRange = $worksheetTitle . "!A{$rowIndex}:{$lastCol}{$rowIndex}";
        $body = new ValueRange(['values' => [$values]]);
        $params = ['valueInputOption' => 'RAW'];
        $service->spreadsheets_values->update($spreadsheetId, $insertRange, $body, $params);
        echo json_encode([
            'success' => true,
            'message' => 'Registro actualizado exitosamente.',
            'rowIndex' => $rowIndex,
            'updated' => true
        ]);
    } else {
        $insertRange = $worksheetTitle . "!A{$nextRow}:{$lastCol}{$nextRow}";
        $body = new ValueRange(['values' => [$values]]);
        $params = ['valueInputOption' => 'RAW'];
        $service->spreadsheets_values->update($spreadsheetId, $insertRange, $body, $params);
        echo json_encode([
            'success' => true,
            'message' => 'Registro guardado exitosamente.',
            'rowIndex' => $nextRow,
            'updated' => false
        ]);
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>