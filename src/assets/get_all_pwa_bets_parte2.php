<?php
/**
 * get_all_pwa_bets.php - Lee TODAS las apuestas PWA (público, sin auth)
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/get_all_pwa_bets.php
 *
 * Devuelve todas las filas de la hoja `apuestas`. Pensado para alimentar
 * el modal de "Movimiento de puestos" en la PWA, que necesita ver los
 * bets de TODOS los participantes sin requerir login.
 *
 * ⚠️  Este endpoint es PÚBLICO: no valida credenciales. Solo devuelve
 *     datos agregados (sin passwords ni info sensible). El id del sheet
 *     está hardcoded en el código (igual que los otros endpoints).
 *
 * Esquema de la hoja "apuestas" (10 columnas A:J):
 *   A:id, B:participant, C:phone, D:matchDate, E:matchId,
 *   F:homeTeam, G:awayTeam, H:homeScore, I:awayScore, J:submittedAt
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "..." }
 *
 * Respuesta:
 *   200 { success: true, bets: [ ... ], total: N }
 *   500 { success: false, error: "..." }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'apuestas2';

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
        throw new Exception('Falta el campo requerido: spreadsheetId');
    }

    $spreadsheetId = $data['spreadsheetId'];

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA - All Bets');
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
    /**
     * Normalización de campos: la hoja `apuestas` puede tener dos schemas
     * distintos según cómo se pobló:
     *
     *   PWA schema (save_pwa_bet.php):
     *     id, participant, phone, matchDate, matchId,
     *     homeTeam, awayTeam, homeScore, awayScore, submittedAt
     *
     *   Seed schema (seed_apuestas_from_json.php):
     *     id, timestamp, participante, phone, date, (vacía),
     *     team1, team2, score1, score2, datetime
     *
     * Devolvemos siempre el PWA schema para que el frontend funcione
     * sin importar cómo se haya poblado la hoja.
     */
    $aliasMap = [
        'participant' => ['participant', 'participante'],
        'phone'       => ['phone'],
        'matchDate'   => ['matchDate', 'date'],
        'matchId'     => ['matchId'],
        'homeTeam'    => ['homeTeam', 'team1'],
        'awayTeam'    => ['awayTeam', 'team2'],
        'homeScore'   => ['homeScore', 'score1'],
        'awayScore'   => ['awayScore', 'score2'],
        'submittedAt' => ['submittedAt', 'timestamp', 'datetime'],
    ];
    /** @type {Array<array<string, string>>} */
    $bets = [];
    for ($i = 1; $i < count($allValues); $i++) {
        $row = $allValues[$i];
        $raw = [];
        foreach ($headers as $col => $headerName) {
            $raw[$headerName] = $row[$col] ?? '';
        }
        // Saltar filas sin id (filas vacías)
        if (empty($raw['id'])) continue;

        // Mapear al PWA schema
        $obj = ['id' => $raw['id']];
        foreach ($aliasMap as $canonical => $aliases) {
            $value = '';
            foreach ($aliases as $alias) {
                if (isset($raw[$alias]) && $raw[$alias] !== '') {
                    $value = $raw[$alias];
                    break;
                }
            }
            $obj[$canonical] = $value;
        }
        $bets[] = $obj;
    }

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
