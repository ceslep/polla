<?php
/**
 * save_bets.php - Guardado de apuestas (polla mundialista) en Google Sheets
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/save_bets.php
 *
 * Recibe el arreglo completo de apuestas (tal como lo guarda el frontend en
 * localStorage 'polla_bets') y reescribe la hoja entera. La estructura Bet del
 * proyecto (ver src/lib/types.js) se aplana en columnas:
 *
 * Hoja "bets" (20 columnas A:T):
 *   A:id, B:messageId, C:timestamp, D:participant, E:phone, F:type, G:bet_text,
 *   H:homeTeam, I:awayTeam, J:homeScore, K:awayScore,
 *   L:champion, M:runnerup, N:topscorer,
 *   O:status, P:points, Q:real_result, R:verified, S:manuallyEdited, T:originalMessage
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "worksheetTitle": "bets", "bets": [ ...Bet ] }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Google\Service\Sheets\ClearValuesRequest;

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
 * Aplana una apuesta del frontend en una fila de 19 columnas.
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
    $worksheetTitle = $data['worksheetTitle'] ?? 'bets';
    $bets           = $data['bets'];

    $client = new Client();
    $client->setApplicationName('Polla Mundialista');
    $client->setScopes([Sheets::SPREADSHEETS]);

    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    $lastCol = 'T'; // 20 columnas

    // 1. Limpiar la hoja completa antes de reescribir.
    $clearRange = $worksheetTitle . '!A1:' . $lastCol . '50000';
    try {
        $service->spreadsheets_values->clear($spreadsheetId, $clearRange, new ClearValuesRequest());
    } catch (Exception $e) {
        // Si la hoja no existe aun, la creamos.
        error_log("clear fallo, intentando crear hoja: " . $e->getMessage());
        $batch = new Google\Service\Sheets\BatchUpdateSpreadsheetRequest([
            'requests' => [
                ['addSheet' => ['properties' => ['title' => $worksheetTitle]]]
            ]
        ]);
        $service->spreadsheets->batchUpdate($spreadsheetId, $batch);
    }

    // 2. Construir filas: headers + una fila por apuesta.
    $rows = [BETS_HEADERS];
    foreach ($bets as $bet) {
        if (is_array($bet)) {
            $rows[] = betToRow($bet);
        }
    }

    $writeRange = $worksheetTitle . '!A1:' . $lastCol . count($rows);
    $body = new ValueRange(['values' => $rows]);
    $service->spreadsheets_values->update(
        $spreadsheetId,
        $writeRange,
        $body,
        ['valueInputOption' => 'RAW']
    );

    echo json_encode([
        'success'  => true,
        'message'  => 'Apuestas guardadas exitosamente.',
        'saved'    => count($bets),
        'rows'     => count($rows),
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ]);
}
?>
