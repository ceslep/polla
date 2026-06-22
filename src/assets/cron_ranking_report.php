<?php
/**
 * cron_ranking_report.php - Reporte automático de ranking a participantes
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/cron_ranking_report.php
 *
 * ─── QUÉ HACE ─────────────────────────────────────────────────────────────────
 *   1. Lee la hoja `participantes` → nombre, phone, email.
 *   2. Lee la hoja `apuestas` → todos los bets PWA.
 *   3. Lee la hoja `alias` → alias por participante (opcional, mejora visual).
 *   4. Lee la hoja `mail_log` → control anti-duplicados.
 *   5. Fetch `openfootball/worldcup.json` (sin cache, fresh).
 *   6. Calcula la última fecha con partidos finalizados.
 *   7. Para cada participante con email válido:
 *      a. Calcula su puesto, puntos, breakdown (exactas/correctas/erradas/pend).
 *      b. Calcula sus últimas 5 apuestas finalizadas.
 *      c. Calcula un body_hash (md5) del contenido.
 *      d. Si el hash difiere del último enviado PARA ESA MATCHDAY, envía el email.
 *         CC al ROOT_EMAIL (admin) como respaldo/monitoreo.
 *      e. Registra en mail_log.
 *   8. Log a stdout (redirigido a archivo por el cron).
 *
 * ─── IDEMPOTENCIA ─────────────────────────────────────────────────────────────
 *   La hoja `mail_log` debe existir con los siguientes headers en A1:F1:
 *     A: participant
 *     B: matchday_date
 *     C: sent_at
 *     D: subject
 *     E: success
 *     F: body_hash
 *
 *   El script NO crea la hoja automáticamente. Si no existe, aborta con error.
 *
 * ─── USO ──────────────────────────────────────────────────────────────────────
 *   Cron (recomendado: cada hora):
 *     0 * * * * /usr/bin/php /home/USER/public_html/gs/cron_ranking_report.php >> /home/USER/logs/cron_polla.log 2>&1
 *
 *   Manual (para probar):
 *     php /home/USER/public_html/gs/cron_ranking_report.php
 *
 * ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
 *   Editar las constantes al inicio del archivo:
 *     - SPREADSHEET_ID
 *     - ROOT_EMAIL / ROOT_NAME
 *     - GMAIL_USER / GMAIL_PASS
 */

require __DIR__ . '/vendor/autoload.php';

// Guard: este script solo se ejecuta desde CLI (cron). Bloquea acceso web
// para evitar que terceros (o vos mismo por accidente) puedan triggear el
// envío masivo de emails a los participantes.
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    die("Acceso denegado. Este script solo se ejecuta desde CLI/cron.\n");
}

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// ══════════════════════════════════════════════════════════════════════════════
//  🔧 CONFIGURACIÓN — EDITAR ANTES DE DESPLEGAR
// ══════════════════════════════════════════════════════════════════════════════

const SPREADSHEET_ID    = '1PIo_oLVjQubdbLodigV3cwOfwQ29k-SGsRmbeorI3nM';
const SERVICE_ACCOUNT   = __DIR__ . '/assets/serviceaccount.json';
const SHEET_PARTICIPANTES = 'participantes';
const SHEET_APUESTAS      = 'apuestas';
const SHEET_ALIAS         = 'alias';
const SHEET_MAIL_LOG      = 'mail_log';

const ROOT_EMAIL = 'admin@iedeoccidente.com';   // ← CAMBIAR por tu email
const ROOT_NAME  = 'Admin Polla';

const GMAIL_USER = 'ingeleandro@gmail.com';
const GMAIL_PASS = 'zqqqtaoakbavgkou';           // ← contraseña de aplicación

const OPENFOOTBALL_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const PWA_URL = 'https://app.iedeoccidente.com/polla/#/apostar';

// ══════════════════════════════════════════════════════════════════════════════
//  TEAM_ALIASES — replica de src/lib/parser.js
//  (mantener en sync con el frontend)
// ══════════════════════════════════════════════════════════════════════════════

const TEAM_ALIASES = [
    'mexico' => 'Mexico', 'méxico' => 'Mexico',
    'espana' => 'Spain', 'españa' => 'Spain', 'spain' => 'Spain',
    'sudafeica' => 'South Africa', 'sudafrica' => 'South Africa', 'sadafrica' => 'South Africa',
    'sudafrida' => 'South Africa', 'south africa' => 'South Africa',
    'sur africa' => 'South Africa', 'surafrica' => 'South Africa', 'surafric' => 'South Africa',
    'corea' => 'South Korea', 'corea del sur' => 'South Korea', 'corea s' => 'South Korea',
    'korea' => 'South Korea', 'south korea' => 'South Korea',
    'checa' => 'Czech Republic', 'chec' => 'Czech Republic', 'chequia' => 'Czech Republic',
    'chekya' => 'Czech Republic', 'czech' => 'Czech Republic', 'rcheca' => 'Czech Republic',
    'rep checa' => 'Czech Republic', 'rep. checa' => 'Czech Republic', 'r checa' => 'Czech Republic',
    'r. checa' => 'Czech Republic', 'republica checa' => 'Czech Republic',
    'república checa' => 'Czech Republic', 'republica c' => 'Czech Republic',
    'republica' => 'Czech Republic', 'czech republic' => 'Czech Republic',
    'republica ch' => 'Czech Republic',
    'francia' => 'France', 'france' => 'France',
    'argentina' => 'Argentina', 'arg' => 'Argentina',
    'inglaterra' => 'England', 'england' => 'England', 'uk' => 'United Kingdom',
    'brasil' => 'Brazil', 'brazil' => 'Brazil',
    'alemania' => 'Germany', 'alemana' => 'Germany', 'germany' => 'Germany',
    'portugal' => 'Portugal',
    'holanda' => 'Netherlands', 'paises bajos' => 'Netherlands', 'p bajos' => 'Netherlands',
    'netherlands' => 'Netherlands',
    'bélgica' => 'Belgium', 'belgica' => 'Belgium', 'belgium' => 'Belgium',
    'italia' => 'Italy', 'italy' => 'Italy',
    'uruguay' => 'Uruguay', 'colombia' => 'Colombia', 'chile' => 'Chile',
    'eeuu' => 'USA', 'euu' => 'USA', 'estados' => 'USA', 'unidos' => 'USA',
    'estados unidos' => 'USA', 'usa' => 'USA', 'united states' => 'USA',
    'canda' => 'Canada', 'can' => 'Canada', 'canadá' => 'Canada', 'canada' => 'Canada',
    'japón' => 'Japan', 'japon' => 'Japan', 'japan' => 'Japan',
    'australia' => 'Australia',
    'arabia' => 'Saudi Arabia', 'arabia saudita' => 'Saudi Arabia',
    'arabia saudí' => 'Saudi Arabia', 'arabia saudi' => 'Saudi Arabia',
    'arabiasaudita' => 'Saudi Arabia', 'araudia' => 'Saudi Arabia',
    'araudia saudita' => 'Saudi Arabia', 'saudi arabia' => 'Saudi Arabia',
    'qatar' => 'Qatar', 'emiratos' => 'United Arab Emirates',
    'marruecos' => 'Morocco', 'morocco' => 'Morocco', 'maruecos' => 'Morocco',
    'senegal' => 'Senegal', 'sénegal' => 'Senegal',
    'ghana' => 'Ghana',
    'camerún' => 'Cameroon', 'cameroon' => 'Cameroon',
    'bosnia' => 'Bosnia & Herzegovina', 'bos' => 'Bosnia & Herzegovina',
    'bósnia' => 'Bosnia & Herzegovina', 'bosnia herzegovina' => 'Bosnia & Herzegovina',
    'bosniaherzegovina' => 'Bosnia & Herzegovina',
    'paraguay' => 'Paraguay', 'parag' => 'Paraguay',
    'haiti' => 'Haiti', 'haití' => 'Haiti',
    'escancia' => 'Scotland', 'escocia' => 'Scotland', 'escosia' => 'Scotland',
    'escogia' => 'Scotland', 'scotland' => 'Scotland',
    'suisa' => 'Switzerland', 'suiza' => 'Switzerland', 'zuisa' => 'Switzerland',
    'zuiza' => 'Switzerland', 'switzerland' => 'Switzerland',
    'catar' => 'Qatar', 'qarar' => 'Qatar', 'quatar' => 'Qatar',
    'irán' => 'Iran', 'iran' => 'Iran',
    'turquia' => 'Turkey', 'turquía' => 'Turkey', 'turqui' => 'Turkey',
    'turkia' => 'Turkey', 'turquuia' => 'Turkey', 'turkey' => 'Turkey',
    'cura' => 'Curaçao', 'curacao' => 'Curaçao', 'curaçao' => 'Curaçao',
    'curazao' => 'Curaçao', 'cruzao' => 'Curaçao', 'corazao' => 'Curaçao', 'cucacao' => 'Curaçao',
    'ecuador' => 'Ecuador',
    'costa' => 'Ivory Coast', 'costa marfil' => 'Ivory Coast',
    'costa de marfil' => 'Ivory Coast', 'costa d marfil' => 'Ivory Coast',
    'c marfil' => 'Ivory Coast', 'c maril' => 'Ivory Coast',
    'c de marfil' => 'Ivory Coast', 'cmarfil' => 'Ivory Coast', 'cmaril' => 'Ivory Coast',
    'costamarfil' => 'Ivory Coast', 'costadom' => 'Ivory Coast',
    'ivory coast' => 'Ivory Coast', 'fil' => 'Ivory Coast', 'marfil' => 'Ivory Coast',
    'suecia' => 'Sweden', 'suecis' => 'Sweden', 'sweden' => 'Sweden',
    'tunes' => 'Tunisia', 'tine' => 'Tunisia', 'tinez' => 'Tunisia', 'tines' => 'Tunisia',
    'tunez' => 'Tunisia', 'tunel' => 'Tunisia', 'tenez' => 'Tunisia', 'tunisia' => 'Tunisia',
    'egipto' => 'Egypt', 'egypt' => 'Egypt', 'egyto' => 'Egypt',
    'n zelanda' => 'New Zealand', 'zelanda' => 'New Zealand',
    'nueva zelanda' => 'New Zealand', 'nueva selanda' => 'New Zealand',
    'new zealand' => 'New Zealand', 'nz' => 'New Zealand',
    'islas cabo verde' => 'Cape Verde', 'cabo verde' => 'Cape Verde',
    'c verde' => 'Cape Verde', 'verde' => 'Cape Verde', 'cape verde' => 'Cape Verde',
    'iraq' => 'Iraq', 'irak' => 'Iraq',
    'noruega' => 'Norway', 'norway' => 'Norway',
    'argelia' => 'Algeria', 'algeria' => 'Algeria',
    'austria' => 'Austria', 'austria.' => 'Austria',
    'jordania' => 'Jordan', 'jordan' => 'Jordan',
    'rdcongo' => 'DR Congo', 'dr congo' => 'DR Congo', 'rd congo' => 'DR Congo', 'congo' => 'DR Congo',
    'uzbekistan' => 'Uzbekistan', 'usbekistan' => 'Uzbekistan',
    'uzbékistan' => 'Uzbekistan', 'uzbekistán' => 'Uzbekistan',
    'uzbek' => 'Uzbekistan', 'uzbequistan' => 'Uzbekistan', 'uzbequistán' => 'Uzbekistan',
    'croacia' => 'Croatia', 'croatia' => 'Croatia',
    'panama' => 'Panama', 'panamá' => 'Panama',
];

/**
 * Replica de src/lib/parser.js → normalizeTeamName.
 * Quita emojis, acentos, puntuación, lowercase, lookup en alias map.
 * @param string $name
 * @return string
 */
function normalizeTeamName($name) {
    if (!$name) return '';
    // Quitar emojis (rango extendido de pictográficos + presentation)
    $stripped = preg_replace('/[\x{1F000}-\x{1FFFF}]/u', '', $name);
    $stripped = preg_replace('/[\x{2600}-\x{27BF}]/u', '', $stripped);
    $lower = strtolower($stripped);
    $lower = str_replace(
        ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ä', 'ë', 'ï', 'ö', 'ü', 'ç'],
        ['a', 'e', 'i', 'o', 'u', 'n', 'a', 'e', 'i', 'o', 'u', 'c'],
        $lower
    );
    $lower = preg_replace('/[.,\/#!$%\^&\*;:{}=\-_`~()]/', '', $lower);
    $lower = preg_replace('/\s{2,}/', ' ', $lower);
    $lower = trim($lower);
    return TEAM_ALIASES[$lower] ?? $lower;
}

/**
 * Replica de src/lib/stores.svelte.js → findMatchForBet.
 * Busca el match por (teams + date). Si no lo encuentra devuelve null.
 * Acepta tanto el orden home/away como el invertido.
 * @param array $bet
 * @param array $matches
 * @return array|null
 */
function findMatchForBet(array $bet, array $matches) {
    if (($bet['type'] ?? '') !== 'score') return null;
    if (!isset($bet['prediction'])) return null;

    $homeNorm = normalizeTeamName($bet['prediction']['homeTeam'] ?? '');
    $awayNorm = normalizeTeamName($bet['prediction']['awayTeam'] ?? '');
    $betDay = substr($bet['timestamp'] ?? '', 0, 10); // YYYY-MM-DD

    foreach ($matches as $match) {
        $mHome = normalizeTeamName($match['homeTeam']);
        $mAway = normalizeTeamName($match['awayTeam']);

        $teamsMatch = false;
        if (($homeNorm === $mHome && $awayNorm === $mAway)
            || ($homeNorm === $mAway && $awayNorm === $mHome)) {
            $teamsMatch = true;
        }
        if (!$teamsMatch) continue;

        $matchDay = $match['date'] ?? '';
        if ($betDay && $matchDay && $betDay !== $matchDay) continue;

        return $match;
    }
    return null;
}

/**
 * Replica de src/lib/api.js → compareBetWithMatch.
 * Devuelve [status, points].
 * @param array $bet
 * @param array $match
 * @return array{status: string, points: int}
 */
function compareBetWithMatch(array $bet, array $match): array {
    if (($bet['type'] ?? '') !== 'score') return ['status' => 'pending', 'points' => 0];

    $realHome = (int)($match['homeScore'] ?? 0);
    $realAway = (int)($match['awayScore'] ?? 0);

    $betHomeNorm = normalizeTeamName($bet['prediction']['homeTeam'] ?? '');
    $betAwayNorm = normalizeTeamName($bet['prediction']['awayTeam'] ?? '');
    $matchHomeNorm = normalizeTeamName($match['homeTeam']);
    $matchAwayNorm = normalizeTeamName($match['awayTeam']);

    $betInverted = ($betHomeNorm === $matchAwayNorm && $betAwayNorm === $matchHomeNorm);

    $rawBetHome = (int)($bet['prediction']['homeScore'] ?? 0);
    $rawBetAway = (int)($bet['prediction']['awayScore'] ?? 0);
    $betHome = $betInverted ? $rawBetAway : $rawBetHome;
    $betAway = $betInverted ? $rawBetHome : $rawBetAway;

    if ($betHome === $realHome && $betAway === $realAway) {
        return ['status' => 'exact', 'points' => 5];
    }

    $betDiff = $betHome - $betAway;
    $realDiff = $realHome - $realAway;

    if (($betDiff === 0 && $realDiff === 0)
        || ($betDiff > 0 && $realDiff > 0)
        || ($betDiff < 0 && $realDiff < 0)) {
        return ['status' => 'correct', 'points' => 3];
    }
    return ['status' => 'incorrect', 'points' => 0];
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOADER DE GOOGLE SHEETS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @return Sheets
 */
function getSheetsService(): Sheets {
    $client = new Client();
    $client->setApplicationName('Polla Mundialista - Cron Report');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT)) {
        throw new Exception('Archivo de credenciales no encontrado: ' . SERVICE_ACCOUNT);
    }
    $client->setAuthConfig(SERVICE_ACCOUNT);
    return new Sheets($client);
}

/**
 * Lee la hoja `participantes` (columnas A:E).
 * @return Array<array{name:string, phone:string, email:string, passwordChanged:bool}>
 */
function loadParticipantes(): array {
    $service = getSheetsService();
    $resp = $service->spreadsheets_values->get(SPREADSHEET_ID, SHEET_PARTICIPANTES . '!A2:E1000');
    $rows = $resp->getValues() ?: [];
    $out = [];
    foreach ($rows as $row) {
        $name  = trim((string)($row[0] ?? ''));
        $phone = trim((string)($row[1] ?? ''));
        $email = trim((string)($row[4] ?? ''));
        if (!$name) continue;
        $out[] = [
            'name'  => $name,
            'phone' => $phone,
            'email' => $email,
        ];
    }
    return $out;
}

/**
 * Lee la hoja `apuestas` (A:J) y normaliza al PWA schema.
 * @return array
 */
function loadApuestas(): array {
    $service = getSheetsService();
    $resp = $service->spreadsheets_values->get(SPREADSHEET_ID, SHEET_APUESTAS . '!A1:J50000');
    $rows = $resp->getValues() ?: [];
    if (count($rows) === 0) return [];
    $headers = $rows[0];
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
    $bets = [];
    for ($i = 1; $i < count($rows); $i++) {
        $row = $rows[$i];
        $raw = [];
        foreach ($headers as $col => $h) $raw[$h] = $row[$col] ?? '';
        if (empty($raw['id'])) continue;
        $obj = ['id' => $raw['id'], 'type' => 'score'];
        foreach ($aliasMap as $canonical => $aliases) {
            $value = '';
            foreach ($aliases as $a) {
                if (isset($raw[$a]) && $raw[$a] !== '') { $value = $raw[$a]; break; }
            }
            $obj[$canonical] = $value;
        }
        $obj['prediction'] = [
            'homeTeam'  => $obj['homeTeam'],
            'awayTeam'  => $obj['awayTeam'],
            'homeScore' => (int)($obj['homeScore'] ?? 0),
            'awayScore' => (int)($obj['awayScore'] ?? 0),
        ];
        $obj['timestamp'] = $obj['matchDate'] . 'T12:00:00';
        $bets[] = $obj;
    }
    return $bets;
}

/**
 * Lee la hoja `alias` (A:B). participant -> alias.
 * @return array<string,string>
 */
function loadAliases(): array {
    try {
        $service = getSheetsService();
        $resp = $service->spreadsheets_values->get(SPREADSHEET_ID, SHEET_ALIAS . '!A2:B1000');
        $rows = $resp->getValues() ?: [];
        $out = [];
        foreach ($rows as $row) {
            $p = trim((string)($row[0] ?? ''));
            $a = trim((string)($row[1] ?? ''));
            if ($p && $a) $out[$p] = $a;
        }
        return $out;
    } catch (\Throwable $e) {
        // La hoja puede no existir todavía — no es crítico.
        // Usamos \Throwable (no Exception) porque Google\Service\Exception
        // no siempre es subclase de Exception y el catch original no lo
        // atrapaba, crasheando el script completo.
        log_msg("⚠️  Hoja 'alias' no disponible (se continúa sin aliases): " . $e->getMessage());
        return [];
    }
}

/**
 * Lee la hoja `mail_log` (A:F). Devuelve índice por participant → última entrada.
 * @return array<string, array{matchday_date:string, sent_at:string, body_hash:string, subject:string, success:string}>
 */
function loadMailLog(): array {
    $service = getSheetsService();
    $resp = $service->spreadsheets_values->get(SPREADSHEET_ID, SHEET_MAIL_LOG . '!A2:F50000');
    $rows = $resp->getValues() ?: [];
    $byParticipant = [];
    foreach ($rows as $row) {
        $participant    = trim((string)($row[0] ?? ''));
        $matchdayDate   = trim((string)($row[1] ?? ''));
        $sentAt         = trim((string)($row[2] ?? ''));
        $subject        = trim((string)($row[3] ?? ''));
        $success        = strtolower(trim((string)($row[4] ?? '')));
        $bodyHash       = trim((string)($row[5] ?? ''));
        if (!$participant) continue;
        // Conservar solo la última entrada (por si hay varias, la del final gana)
        $byParticipant[$participant] = [
            'matchday_date' => $matchdayDate,
            'sent_at'       => $sentAt,
            'subject'       => $subject,
            'success'       => $success,
            'body_hash'     => $bodyHash,
        ];
    }
    return $byParticipant;
}

/**
 * Append una fila a `mail_log`.
 * @return bool true si se insertó, false si falló
 */
function appendMailLog(string $participant, string $matchdayDate, string $subject, string $success, string $bodyHash): bool {
    try {
        $service = getSheetsService();
        $body = new Google\Service\Sheets\BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data' => [[
                'range'  => SHEET_MAIL_LOG . '!A:F',
                'values' => [[
                    $participant,
                    $matchdayDate,
                    date('Y-m-d H:i:s'),
                    $subject,
                    $success,
                    $bodyHash,
                ]],
            ]],
        ]);
        $service->spreadsheets_values->append(SPREADSHEET_ID, $body, ['valueInputOption' => 'RAW']);
        return true;
    } catch (\Throwable $e) {
        // \Throwable (no Exception) por la misma razón que en loadAliases:
        // Google\Service\Exception puede no extender Exception en
        // algunas versiones del SDK y el catch original no lo atrapaba.
        log_msg("❌ Error appendMailLog: " . $e->getMessage());
        return false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  OPENFOOTBALL
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch el JSON de openfootball sin cache.
 * @return array matches normalizados
 */
function loadMatches(): array {
    $ctx = stream_context_create(['http' => [
        'header' => "User-Agent: PollaMundialistaCron/1.0\r\n",
        'timeout' => 20,
    ]]);
    $json = @file_get_contents(OPENFOOTBALL_URL, false, $ctx);
    if ($json === false) {
        throw new Exception('No se pudo obtener ' . OPENFOOTBALL_URL);
    }
    $data = json_decode($json, true);
    if (!is_array($data) || !isset($data['matches'])) {
        throw new Exception('JSON de openfootball inválido');
    }
    $matches = [];
    foreach ($data['matches'] as $m) {
        $matches[] = [
            'round'     => $m['round'] ?? '',
            'date'      => $m['date'] ?? '',
            'time'      => $m['time'] ?? '',
            'team1'     => $m['team1'] ?? '',
            'team2'     => $m['team2'] ?? '',
            'group'     => $m['group'] ?? '',
            'ground'    => $m['ground'] ?? '',
            'homeTeam'  => $m['team1'] ?? '',  // alias para findMatchForBet
            'awayTeam'  => $m['team2'] ?? '',
            'homeScore' => $m['score']['ft'][0] ?? null,
            'awayScore' => $m['score']['ft'][1] ?? null,
            'hasScore'  => isset($m['score']['ft']),
        ];
    }
    return $matches;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCORING + RANKING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Calcula el ranking, las stats por participante y las últimas apuestas.
 * @return array{
 *   rank: int, points: int, exact: int, correct: int, incorrect: int, pending: int,
 *   lastBets: array, totalBets: int
 * }
 */
function computeParticipantStats(string $participant, array $allBets, array $matches): array {
    $stats = [
        'points' => 0, 'exact' => 0, 'correct' => 0, 'incorrect' => 0, 'pending' => 0,
    ];
    $scoredBets = [];   // para el ranking
    $lastBets   = [];   // últimas 5 finalizadas con detalle

    foreach ($allBets as $bet) {
        if (($bet['participant'] ?? '') !== $participant) continue;
        $match = findMatchForBet($bet, $matches);
        if ($match === null) {
            $stats['pending']++;
            $scoredBets[] = ['points' => 0, 'status' => 'pending', 'matchDate' => $bet['matchDate'] ?? ''];
            continue;
        }
        $cmp = compareBetWithMatch($bet, $match);
        $stats['points'] += $cmp['points'];
        $stats[$cmp['status']]++;
        $scoredBets[] = [
            'points'    => $cmp['points'],
            'status'    => $cmp['status'],
            'matchDate' => $match['date'] ?? '',
            'matchKey'  => $match['team1'] . ' vs ' . $match['team2'] . '|' . ($match['date'] ?? ''),
            'prediction'=> ((int)($bet['prediction']['homeScore'] ?? 0)) . '-' . ((int)($bet['prediction']['awayScore'] ?? 0)),
            'result'    => ((int)$match['homeScore']) . '-' . ((int)$match['awayScore']),
            'homeTeam'  => $match['team1'] ?? '',
            'awayTeam'  => $match['team2'] ?? '',
        ];
        if ($cmp['status'] !== 'pending') {
            $lastBets[] = $scoredBets[count($scoredBets) - 1];
        }
    }

    // Ordenar lastBets por fecha desc, top 5
    usort($lastBets, function ($a, $b) {
        return strcmp($b['matchDate'], $a['matchDate']);
    });
    $lastBets = array_slice($lastBets, 0, 5);

    return [
        'points'    => $stats['points'],
        'exact'     => $stats['exact'],
        'correct'   => $stats['correct'],
        'incorrect' => $stats['incorrect'],
        'pending'   => $stats['pending'],
        'lastBets'  => $lastBets,
        'scoredBets'=> $scoredBets,  // para el ranking global
    ];
}

/**
 * Calcula el ranking global ordenado por puntos desc.
 * Devuelve map participant => rank (1-based).
 * @return array<string,int>
 */
function computeRanking(array $allBets, array $matches): array {
    $byParticipant = [];
    foreach ($allBets as $bet) {
        $p = $bet['participant'] ?? '';
        if (!$p) continue;
        if (!isset($byParticipant[$p])) $byParticipant[$p] = ['points' => 0, 'count' => 0];
        $match = findMatchForBet($bet, $matches);
        if ($match === null) continue;
        $cmp = compareBetWithMatch($bet, $match);
        $byParticipant[$p]['points'] += $cmp['points'];
        $byParticipant[$p]['count']++;
    }
    // Ordenar por puntos desc; empate: más bets gana
    uasort($byParticipant, function ($a, $b) {
        if ($b['points'] !== $a['points']) return $b['points'] - $a['points'];
        return $b['count'] - $a['count'];
    });
    $rank = [];
    $i = 0;
    foreach ($byParticipant as $p => $v) {
        $i++;
        $rank[$p] = $i;
    }
    return $rank;
}

// ══════════════════════════════════════════════════════════════════════════════
//  HASH + RENDER
// ══════════════════════════════════════════════════════════════════════════════

function bodyHash(int $rank, int $points, int $exact, int $correct, int $incorrect, int $pending, array $lastBets, string $lastFinished): string {
    $parts = [
        'rank='      . $rank,
        'points='    . $points,
        'exact='     . $exact,
        'correct='   . $correct,
        'incorrect=' . $incorrect,
        'pending='   . $pending,
        'last='      . $lastFinished,
    ];
    foreach ($lastBets as $b) {
        $parts[] = $b['matchKey'] . '|' . $b['prediction'] . '|' . $b['result'] . '|' . $b['points'];
    }
    return md5(implode("\n", $parts));
}

/**
 * Renderiza el email HTML para un participante.
 */
function renderEmail(string $name, int $rank, int $points, int $exact, int $correct, int $incorrect, int $pending, array $lastBets, string $lastFinished): string {
    $lastFinishedFmt = '';
    if ($lastFinished) {
        [$y, $m, $d] = explode('-', $lastFinished);
        $lastFinishedFmt = "$d/$m/$y";
    }
    $total = $exact + $correct + $incorrect;
    $lastBetsHtml = '';
    if (count($lastBets) > 0) {
        $rows = '';
        foreach ($lastBets as $b) {
            $ptsStr = $b['points'] === 5 ? '5 pts · ✓ Exacto'
                    : ($b['points'] === 3 ? '3 pts · ✓ Acertó'
                    : '0 pts · ✗ Falló');
            $ptsColor = $b['points'] === 5 ? '#10b981' : ($b['points'] === 3 ? '#06b6d4' : '#ef4444');
            $matchTitle = htmlspecialchars($b['homeTeam'] . ' vs ' . $b['awayTeam']);
            $rows .= "<tr>
                <td style='padding:10px 0;border-bottom:1px solid #2a2a2a;'>
                    <div style='font-size:14px;font-weight:600;color:#fff;'>$matchTitle</div>
                    <div style='font-size:12px;color:#888;margin-top:2px;'>Apostaste: <strong style='color:#fbbf24;'>{$b['prediction']}</strong> · Real: <strong style='color:#06b6d4;'>{$b['result']}</strong></div>
                    <div style='font-size:11px;color:$ptsColor;margin-top:2px;font-weight:600;'>$ptsStr</div>
                </td>
            </tr>";
        }
        $lastBetsHtml = "<div style='background:#0a0a0a;border-radius:8px;padding:16px 20px;margin:20px 0;'>
            <div style='font-size:11px;text-transform:uppercase;color:#888;letter-spacing:1px;margin-bottom:10px;font-weight:600;'>Últimas apuestas finalizadas</div>
            <table style='width:100%;border-collapse:collapse;'>$rows</table>
        </div>";
    } else {
        $lastBetsHtml = "<div style='background:#0a0a0a;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;color:#888;font-size:13px;'>Aún no tienes apuestas finalizadas.</div>";
    }

    $greetName = htmlspecialchars($name);
    $exactStr = $exact > 0 ? "🎯 $exact exactas" : '';
    $correctStr = $correct > 0 ? "✅ $correct correctas" : '';
    $incorrectStr = $incorrect > 0 ? "❌ $incorrect erradas" : '';
    $pendingStr = $pending > 0 ? "⏳ $pending pendientes" : '';
    $breakdown = trim(implode(' · ', array_filter([$exactStr, $correctStr, $incorrectStr, $pendingStr])));

    return "
    <!DOCTYPE html>
    <html lang='es'>
    <head>
        <meta charset='UTF-8'>
        <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    </head>
    <body style='font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#e5e5e5;background:#0a0a0a;margin:0;padding:0;'>
        <div style='max-width:600px;margin:20px auto;background:#111;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);overflow:hidden;'>
            <div style='background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);color:#fff;padding:24px;text-align:center;'>
                <div style='font-size:20px;font-weight:800;letter-spacing:.5px;'>⚽ POLLA MUNDIALISTA 2026</div>
                <div style='font-size:13px;margin-top:4px;opacity:.9;'>Resumen de tu posición</div>
            </div>
            <div style='padding:24px;'>
                <p style='font-size:16px;margin:0 0 20px;color:#fff;'>¡Hola, <strong style='color:#10b981;'>$greetName</strong>!</p>
                <table style='width:100%;border-collapse:collapse;margin:16px 0;'>
                    <tr>
                        <td style='width:50%;padding:0 4px;'>
                            <div style='background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);border-radius:10px;padding:18px;text-align:center;'>
                                <div style='font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.9;'>Tu puesto</div>
                                <div style='font-size:36px;font-weight:800;line-height:1.1;margin-top:6px;'>#$rank</div>
                            </div>
                        </td>
                        <td style='width:50%;padding:0 4px;'>
                            <div style='background:linear-gradient(135deg,#06b6d4 0%,#3b82f6 100%);border-radius:10px;padding:18px;text-align:center;'>
                                <div style='font-size:10px;text-transform:uppercase;letter-spacing:1px;opacity:.9;'>Puntos</div>
                                <div style='font-size:36px;font-weight:800;line-height:1.1;margin-top:6px;'>$points</div>
                            </div>
                        </td>
                    </tr>
                </table>
                <div style='background:#0a0a0a;border-radius:8px;padding:16px 20px;margin:20px 0;'>
                    <div style='font-size:11px;text-transform:uppercase;color:#888;letter-spacing:1px;margin-bottom:8px;font-weight:600;'>Detalle de tus apuestas</div>
                    <div style='font-size:14px;color:#fff;'>$breakdown</div>
                </div>
                $lastBetsHtml
                <div style='text-align:center;margin:24px 0 8px;'>
                    <a href='" . PWA_URL . "' style='display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;'>Ver la PWA completa</a>
                </div>
                <div style='text-align:center;font-size:11px;color:#666;margin-top:12px;'>Última fecha finalizada: <strong style='color:#888;'>$lastFinishedFmt</strong></div>
            </div>
            <div style='background:#0a0a0a;padding:16px 24px;font-size:11px;color:#666;text-align:center;border-top:1px solid #1a1a1a;'>
                <div>Polla Mundialista 2026 · Reporte automático</div>
                <div style='margin-top:4px;'>Si no quieres recibir estos emails, avisa al admin.</div>
            </div>
        </div>
    </body>
    </html>";
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIL
// ══════════════════════════════════════════════════════════════════════════════

function sendEmail(string $toEmail, string $toName, string $subject, string $html): array {
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->SMTPDebug   = 0;
        $mail->Debugoutput = 'echo';
        $mail->Host        = 'smtp.gmail.com';
        $mail->Port        = 465;
        $mail->SMTPSecure  = 'ssl';
        $mail->SMTPAuth    = true;
        $mail->SMTPAutoTLS = false;
        $mail->Timeout     = 30;
        $mail->ConnectTimeout = 30;
        $mail->Username    = GMAIL_USER;
        $mail->Password    = GMAIL_PASS;
        $mail->setFrom(GMAIL_USER, 'Polla Mundialista 2026');
        $mail->addReplyTo(GMAIL_USER, 'Polla Mundialista 2026');
        $mail->addAddress($toEmail, $toName);
        $mail->addCC(ROOT_EMAIL, ROOT_NAME);  // copia al admin
        $mail->isHTML(true);
        $mail->CharSet = 'UTF-8';
        $mail->Subject = $subject;
        $mail->Body    = $html;
        $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $html));
        $mail->send();
        return ['success' => true, 'error' => null];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function log_msg(string $msg): void {
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n";
}

function getLastFinishedDate(array $matches): ?string {
    $dates = [];
    foreach ($matches as $m) {
        if (!empty($m['hasScore']) && !empty($m['date'])) {
            $dates[] = $m['date'];
        }
    }
    if (count($dates) === 0) return null;
    rsort($dates);
    return $dates[0];
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

log_msg('=== cron_ranking_report START ===');

try {
    $participantes = loadParticipantes();
    log_msg('Participantes cargados: ' . count($participantes));

    $apuestas = loadApuestas();
    log_msg('Apuestas cargadas: ' . count($apuestas));

    $aliases = loadAliases();
    log_msg('Aliases cargados: ' . count($aliases));

    $mailLog = loadMailLog();
    log_msg('mail_log entries: ' . count($mailLog));

    $matches = loadMatches();
    log_msg('Matches cargados: ' . count($matches));

    $lastFinished = getLastFinishedDate($matches);
    if (!$lastFinished) {
        log_msg('⚠️  No hay partidos finalizados aún. Abortando.');
        exit(0);
    }
    log_msg("Última fecha finalizada: $lastFinished");

    $ranking = computeRanking($apuestas, $matches);
    log_msg('Participantes con ranking: ' . count($ranking));

    $sent = 0;
    $skippedNoEmail = 0;
    $skippedNoChange = 0;
    $errors = 0;

    foreach ($participantes as $p) {
        $name  = $p['name'];
        $phone = $p['phone'];
        $email = $p['email'];

        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $skippedNoEmail++;
            continue;
        }

        if (!isset($ranking[$name])) {
            // El participante existe pero no tiene bets → skip silencioso
            $skippedNoChange++;
            continue;
        }

        $rank = $ranking[$name];
        $stats = computeParticipantStats($name, $apuestas, $matches);
        $hash = bodyHash(
            $rank,
            $stats['points'],
            $stats['exact'],
            $stats['correct'],
            $stats['incorrect'],
            $stats['pending'],
            $stats['lastBets'],
            $lastFinished
        );

        // Anti-duplicado: si ya se envió este mismo mensaje para esta matchday, skip
        if (isset($mailLog[$name])
            && $mailLog[$name]['matchday_date'] === $lastFinished
            && $mailLog[$name]['body_hash'] === $hash
            && $mailLog[$name]['success'] === 'true') {
            $skippedNoChange++;
            continue;
        }

        // Nombre a usar: alias si existe, si no el nombre de la hoja
        $displayName = $aliases[$name] ?? $name;

        $subject = sprintf('🏆 Tu puesto #%d en la Polla 2026 (%d pts)', $rank, $stats['points']);
        $html = renderEmail(
            $displayName,
            $rank,
            $stats['points'],
            $stats['exact'],
            $stats['correct'],
            $stats['incorrect'],
            $stats['pending'],
            $stats['lastBets'],
            $lastFinished
        );

        $result = sendEmail($email, $displayName, $subject, $html);
        $successFlag = $result['success'] ? 'true' : 'false';

        if ($result['success']) {
            $sent++;
            log_msg("✉️  Enviado a $displayName <$email> (rank #$rank, {$stats['points']} pts)");
        } else {
            $errors++;
            log_msg("❌ Error enviando a $displayName <$email>: {$result['error']}");
        }

        // Registrar en mail_log (incluso si falló, para no reintentar idéntico)
        appendMailLog($name, $lastFinished, $subject, $successFlag, $hash);
    }

    log_msg("=== RESUMEN ===");
    log_msg("Enviados:    $sent");
    log_msg("Sin email:   $skippedNoEmail");
    log_msg("Sin cambios: $skippedNoChange");
    log_msg("Errores:     $errors");

} catch (Exception $e) {
    log_msg('❌ ERROR FATAL: ' . $e->getMessage());
    log_msg($e->getTraceAsString());
    exit(1);
}

log_msg('=== cron_ranking_report END ===');
