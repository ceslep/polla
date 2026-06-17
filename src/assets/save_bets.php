<?php
/**
 * save_bets.php - Guardado de apuestas (polla mundialista) en Google Sheets
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/save_bets.php
 *
 * Recibe el arreglo de apuestas del frontend y hace UPSERT (update/insert):
 * - Si ya existe una fila con mismo participant+timestamp, SOLO actualiza originalMessage (col T)
 * - Si no existe, inserta como nueva fila
 * - Las filas existentes que no vienen en el payload se preservan
 *
 * La estructura Bet del proyecto (ver src/lib/types.js) se aplana en columnas:
 *
 * Hoja "datos" (20 columnas A:T):
 *   A:id, B:messageId, C:timestamp, D:participant, E:phone, F:type, G:bet_text,
 *   H:homeTeam, I:awayTeam, J:homeScore, K:awayScore,
 *   L:champion, M:runnerup, N:topscorer,
 *   O:status, P:points, Q:real_result, R:verified, S:manuallyEdited, T:originalMessage
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "worksheetTitle": "batos", "bets": [ ...Bet ] }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Google\Service\Sheets\BatchUpdateValuesRequest;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/** Columnas de la hoja "bets" en orden. */
const BETS_HEADERS = [
    'id', 'messageId', 'timestamp', 'participant', 'phone', 'type', 'bet_text',
    'homeTeam', 'awayTeam', 'homeScore', 'awayScore',
    'champion', 'runnerup', 'topscorer',
    'status', 'points', 'real_result', 'verified', 'manuallyEdited', 'originalMessage'
];

/**
 * Genera clave única para dedupe: id (único por cada bet)
 * @param array $bet
 * @return string
 */
function betKey(array $bet): string {
    return trim($bet['id'] ?? '');
}

/**
 * Aplana una apuesta del frontend en una fila de 20 columnas.
 * @param array $bet
 * @return array
 */
function betToRow(array $bet): array
{
    $prediction = isset($bet['prediction']) && is_array($bet['prediction']) ? $bet['prediction'] : [];

    // real_result puede venir como 'real_result' o 'realResult' segun el flujo.
    $realResult = $bet['real_result'] ?? $bet['realResult'] ?? '';

    // Convierte valores mixtos (yes/no/true/false) a 'TRUE'/'FALSE' para Sheets
    $boolToStr = static fn($v): string =>
        (is_string($v) && in_array(strtolower($v), ['yes', 'true'], true)) || ($v === true)
            ? 'TRUE'
            : 'FALSE';

    return [
        $bet['id'] ?? '',
        $bet['messageId'] ?? '',
        $bet['timestamp'] ?? '',
        $bet['participant'] ?? '',
        $bet['phone'] ?? '',
        $bet['type'] ?? '',
        $bet['bet_text'] ?? '',
        $prediction['homeTeam'] ?? '',
        $prediction['awayTeam'] ?? '',
        // Los marcadores pueden ser 0; conservamos el cero pero dejamos '' si no existen.
        isset($prediction['homeScore']) ? $prediction['homeScore'] : '',
        isset($prediction['awayScore']) ? $prediction['awayScore'] : '',
        $prediction['champion'] ?? '',
        $prediction['runnerup'] ?? '',
        $prediction['topscorer'] ?? '',
        $bet['status'] ?? '',
        $bet['points'] ?? 0,
        $realResult,
        $boolToStr($bet['verified'] ?? false),
        $boolToStr($bet['manuallyEdited'] ?? false),
        $bet['originalMessage'] ?? $bet['original_message'] ?? '',
    ];
}

/**
 * Obtiene los datos existentes de la hoja.
 * @param Sheets $service
 * @param string $spreadsheetId
 * @param string $worksheetTitle
 * @return array [data, hasHeaders]
 */
function getExistingData(Sheets $service, string $spreadsheetId, string $worksheetTitle): array {
    try {
        $range = $worksheetTitle . '!A1:T50000';
        $response = $service->spreadsheets_values->get($spreadsheetId, $range);
        $values = $response->getValues() ?: [];
        $hasHeaders = count($values) > 0 && strtolower($values[0][0] ?? '') === 'id';
        return [$values, $hasHeaders];
    } catch (Exception $e) {
        error_log("Error leyendo hoja existente: " . $e->getMessage());
        return [[], false];
    }
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

    error_log("save_bets.php recibido " . strlen($input) . " bytes");

    if (!isset($data['spreadsheetId'])) {
        throw new Exception('Se requiere el spreadsheetId.');
    }
    if (!isset($data['bets']) || !is_array($data['bets'])) {
        throw new Exception('Se requiere el arreglo "bets".');
    }

    $spreadsheetId  = $data['spreadsheetId'];
    $worksheetTitle = $data['worksheetTitle'] ?? 'datos';
    $bets           = $data['bets'];

    $client = new Client();
    $client->setApplicationName('Polla Mundialista');
    $client->setScopes([Sheets::SPREADSHEETS]);

    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // 1. Leer datos existentes
    [$existingData, $hasHeaders] = getExistingData($service, $spreadsheetId, $worksheetTitle);

    // 2. Construir mapa de búsqueda: messageId => rowIndex (1-based para Sheets API)
    //    Empezamos desde fila 2 si hay headers (la fila 1 son headers)
    $existingMap = [];
    $dataStartRow = $hasHeaders ? 2 : 1;
    for ($i = $dataStartRow; $i < count($existingData); $i++) {
        $row = $existingData[$i];
        // Columna A = id (index 0)
        $id = trim($row[0] ?? '');
        if ($id) {
            $existingMap[$id] = $i + 1; // Sheets usa 1-based
        }
    }

    // 3. Preparar operaciones de update/insert
    $dataRange = $worksheetTitle . '!A';
    $updates = []; // Stack de datos para batch update
    $insertRowIndex = count($existingData) + 1; // Próxima fila disponible para insert

    foreach ($bets as $bet) {
        if (!is_array($bet)) continue;

        $key = betKey($bet);
        $newRow = betToRow($bet);

        if (isset($existingMap[$key])) {
            // UPDATE: Solo actualiza originalMessage (columna T = índice 19)
            $rowIndex = $existingMap[$key];
            $updateRange = $worksheetTitle . '!T' . $rowIndex;
            $updates[] = [
                'range' => $updateRange,
                'values' => [[$newRow[19]]] // originalMessage
            ];
        } else {
            // INSERT: Nueva fila
            $insertRange = $worksheetTitle . '!A' . $insertRowIndex . ':T' . $insertRowIndex;
            $updates[] = [
                'range' => $insertRange,
                'values' => [$newRow]
            ];
            $existingMap[$key] = $insertRowIndex;
            $insertRowIndex++;
        }
    }

    // 4. Si hay headers pero la primera fila no los tiene, insertarlos
    if (!$hasHeaders && count($updates) > 0) {
        array_unshift($updates, [
            'range' => $worksheetTitle . '!A1:T1',
            'values' => [BETS_HEADERS]
        ]);
    }

    // 5. Ejecutar batch update
    $updatedCount = 0;
    $insertedCount = 0;
    $hasHeaderUpdate = false;

    if (count($updates) > 0) {
        // Contar updates vs inserts basado en lo que enviamos
        foreach ($updates as $u) {
            $range = $u['range'];
            if (preg_match('/!T(\d+)$/', $range)) {
                $updatedCount++;
            } elseif (preg_match('/!A(\d+):T(\d+)$/', $range, $m)) {
                if ($m[1] == 1 && strtolower($u['values'][0][0] ?? '') === 'id') {
                    $hasHeaderUpdate = true;
                } else {
                    $insertedCount++;
                }
            }
        }

        $body = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data' => $updates
        ]);
        $service->spreadsheets_values->batchUpdate($spreadsheetId, $body);
    }

    // Si no había headers y no se insertó ninguno, agregar headers primero
    if (!$hasHeaders && count($bets) > 0 && $insertedCount === 0 && $updatedCount === 0) {
        $headerBody = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data' => [[
                'range' => $worksheetTitle . '!A1:T1',
                'values' => [BETS_HEADERS]
            ]]
        ]);
        $service->spreadsheets_values->batchUpdate($spreadsheetId, $headerBody);
    }

    echo json_encode([
        'success'  => true,
        'message'  => 'Apuestas guardadas exitosamente.',
        'saved'     => count($bets),
        'updated'   => $updatedCount,
        'inserted'  => $insertedCount,
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ]);
}
?>
