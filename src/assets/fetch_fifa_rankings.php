<?php
/**
 * fetch_fifa_rankings.php - Sirve y actualiza el ranking FIFA masculino
 *
 * Peticiones:
 *   GET  Accept: text/html              -> formulario HTML para gestionar el cache
 *   GET  Accept: application/json       -> devuelve el cache como JSON (lo que consume la SPA)
 *   POST action=curl                    -> intenta curl a FIFA con 3 UAs y parsea el HTML
 *   POST action=paste (paste=<texto>)   -> parsea TSV/CSV/HTML pegado y guarda
 *   POST action=clear                   -> borra el cache
 *   OPTIONS                             -> CORS preflight
 *
 * El JSON generado sigue el shape que espera loadFifaRankings() en src/lib/fifa.js:
 *   { "updated": "YYYY-MM-DD", "source": "https://www.fifa.com/es/world-rankings",
 *     "rankings": [ { "rank": 1, "team": "Spain", "points": 1845.31, "change": 0 }, ... ] }
 *
 * Despliegue: este archivo vive en src/assets/ y se sube manualmente a
 *   https://app.iedeoccidente.com/gs/fetch_fifa_rankings.php
 * El cache se persiste en el mismo directorio: fifa_cache.json.
 */

declare(strict_types=1);

const CACHE_FILE = __DIR__ . '/fifa_cache.json';
const FIFA_URL = 'https://www.fifa.com/es/world-rankings';
const SOURCE_LABEL = 'https://www.fifa.com/es/world-rankings';
const JSON_HEADERS = ['Content-Type: application/json', 'Access-Control-Allow-Origin: *'];

/** @var array<string,string> $TEAM_ALIAS */
$TEAM_ALIAS = [
    'MEXICO' => 'Mexico', 'MÉXICO' => 'Mexico', 'MEXIQUE' => 'Mexico',
    'SOUTH AFRICA' => 'South Africa', 'SUDÁFRICA' => 'South Africa', 'SUDAFRICA' => 'South Africa',
    'AFRICA DEL SUR' => 'South Africa', 'AFRIQUE DU SUD' => 'South Africa',
    'SOUTH KOREA' => 'South Korea', 'COREA DEL SUR' => 'South Korea',
    'COREA' => 'South Korea', 'CORÉE DU SUD' => 'South Korea',
    'CZECH REPUBLIC' => 'Czech Republic', 'REPÚBLICA CHECA' => 'Czech Republic',
    'REP. CHECA' => 'Czech Republic', 'RÉPUBLIQUE TCHÈQUE' => 'Czech Republic',
    'CHECA' => 'Czech Republic', 'CHEC' => 'Czech Republic',
    'FRANCE' => 'France', 'FRANCIA' => 'France', 'FRANCE' => 'France',
    'SPAIN' => 'Spain', 'ESPAÑA' => 'Spain', 'ESPAGNE' => 'Spain',
    'ARGENTINA' => 'Argentina', 'ARGENTINE' => 'Argentina',
    'BRAZIL' => 'Brazil', 'BRASIL' => 'Brazil', 'BRÉSIL' => 'Brazil',
    'GERMANY' => 'Germany', 'ALEMANIA' => 'Germany', 'ALLEMAGNE' => 'Germany',
    'PORTUGAL' => 'Portugal', 'PORTUGAL' => 'Portugal',
    'NETHERLANDS' => 'Netherlands', 'PAÍSES BAJOS' => 'Netherlands', 'HOLANDA' => 'Netherlands',
    'PAYS-BAS' => 'Netherlands', 'HOLLANDE' => 'Netherlands',
    'BELGIUM' => 'Belgium', 'BÉLGICA' => 'Belgium', 'BELGIQUE' => 'Belgium',
    'ITALY' => 'Italy', 'ITALIA' => 'Italy', 'ITALIE' => 'Italy',
    'URUGUAY' => 'Uruguay', 'URUGUAY' => 'Uruguay',
    'COLOMBIA' => 'Colombia', 'COLOMBIE' => 'Colombia',
    'USA' => 'USA', 'UNITED STATES' => 'USA', 'ESTADOS UNIDOS' => 'USA',
    'EE.UU.' => 'USA', 'EEUU' => 'USA', 'ÉTATS-UNIS' => 'United States',
    'CANADA' => 'Canada', 'CANADÁ' => 'Canada',
    'JAPAN' => 'Japan', 'JAPÓN' => 'Japan', 'JAPON' => 'Japan',
    'AUSTRALIA' => 'Australia', 'AUSTRALIE' => 'Australia',
    'SAUDI ARABIA' => 'Saudi Arabia', 'ARABIA SAUDITA' => 'Saudi Arabia', 'ARABIE SAOUDITE' => 'Saudi Arabia',
    'QATAR' => 'Qatar', 'QATAR' => 'Qatar',
    'UNITED ARAB EMIRATES' => 'United Arab Emirates', 'EMIRATOS ÁRABES UNIDOS' => 'United Arab Emirates',
    'EAU' => 'United Arab Emirates', 'ÉMIRATS ARABES UNIS' => 'United Arab Emirates',
    'MOROCCO' => 'Morocco', 'MARRUECOS' => 'Morocco', 'MAROC' => 'Morocco',
    'SENEGAL' => 'Senegal', 'SÉNÉGAL' => 'Senegal',
    'GHANA' => 'Ghana', 'GHANA' => 'Ghana',
    'CAMEROON' => 'Cameroon', 'CAMERÚN' => 'Cameroon', 'CAMEROUN' => 'Cameroon',
    'BOSNIA & HERZEGOVINA' => 'Bosnia & Herzegovina', 'BOSNIA AND HERZEGOVINA' => 'Bosnia & Herzegovina',
    'BOSNIA' => 'Bosnia & Herzegovina', 'BOSNIA Y HERZEGOVINA' => 'Bosnia & Herzegovina',
    'BOSNIE-HERZÉGOVINE' => 'Bosnia & Herzegovina',
    'PARAGUAY' => 'Paraguay', 'PARAGUAY' => 'Paraguay',
    'HAITI' => 'Haiti', 'HAITÍ' => 'Haiti', 'HAÏTI' => 'Haiti',
    'SWITZERLAND' => 'Switzerland', 'SUIZA' => 'Switzerland', 'SUISSE' => 'Switzerland',
    'TURKEY' => 'Turkey', 'TURQUÍA' => 'Turkey', 'TURQUIE' => 'Turkey',
    'CURAÇAO' => 'Curaçao', 'CURACAO' => 'Curaçao', 'CURAÇAO' => 'Curaçao',
    'ECUADOR' => 'Ecuador', 'ÉQUATEUR' => 'Ecuador',
    'IVORY COAST' => 'Ivory Coast', 'COSTA DE MARFIL' => 'Ivory Coast',
    'CÔTE D’IVOIRE' => 'Ivory Coast', 'COTE D IVOIRE' => 'Ivory Coast',
    'SWEDEN' => 'Sweden', 'SUECIA' => 'Sweden', 'SUÈDE' => 'Sweden',
    'TUNISIA' => 'Tunisia', 'TÚNEZ' => 'Tunisia', 'TUNISIE' => 'Tunisia',
    'EGYPT' => 'Egypt', 'EGIPTO' => 'Egypt', 'ÉGYPTE' => 'Egypt',
    'IRAN' => 'Iran', 'IRÁN' => 'Iran', 'IRAN' => 'Iran',
    'NEW ZEALAND' => 'New Zealand', 'NUEVA ZELANDA' => 'New Zealand',
    'NOUVELLE-ZÉLANDE' => 'New Zealand',
    'CAPE VERDE' => 'Cape Verde', 'CABO VERDE' => 'Cape Verde', 'CAP-VERT' => 'Cape Verde',
    'IRAQ' => 'Iraq', 'IRAK' => 'Iraq', 'IRAK' => 'Iraq',
    'NORWAY' => 'Norway', 'NORUEGA' => 'Norway', 'NORVÈGE' => 'Norway',
    'ALGERIA' => 'Algeria', 'ARGELIA' => 'Algeria', 'ALGÉRIE' => 'Algeria',
    'AUSTRIA' => 'Austria', 'AUSTRIA' => 'Austria', 'AUTRICHE' => 'Austria',
    'JORDAN' => 'Jordan', 'JORDANIA' => 'Jordan', 'JORDANIE' => 'Jordan',
    'SCOTLAND' => 'Scotland', 'ESCOCIA' => 'Scotland', 'ÉCOSSE' => 'Scotland',
    'ENGLAND' => 'England', 'INGLATERRA' => 'England', 'ANGLETERRE' => 'England',
    'DR CONGO' => 'DR Congo', 'R.D. DEL CONGO' => 'DR Congo', 'RD CONGO' => 'DR Congo',
    'RÉPUBLIQUE DÉMOCRATIQUE DU CONGO' => 'DR Congo',
    'UZBEKISTAN' => 'Uzbekistan', 'UZBEKISTÁN' => 'Uzbekistan', 'OUZBÉKISTAN' => 'Uzbekistan',
    'CROATIA' => 'Croatia', 'CROACIA' => 'Croatia', 'CROATIE' => 'Croatia',
    'PANAMA' => 'Panama', 'PANAMÁ' => 'Panama', 'PANAMA' => 'Panama',
];

/**
 * @param string $name
 * @return string
 */
function normalizeTeam(string $name): string {
    global $TEAM_ALIAS;
    $key = trim($name);
    if (function_exists('mb_strtoupper')) {
        $key = mb_strtoupper($key, 'UTF-8');
    } else {
        $key = strtoupper($key);
    }
    if (isset($TEAM_ALIAS[$key])) {
        return $TEAM_ALIAS[$key];
    }
    $stripped = trim($name);
    if (function_exists('mb_convert_case')) {
        return mb_convert_case($stripped, MB_CASE_TITLE, 'UTF-8');
    }
    return ucwords(strtolower($stripped));
}

/**
 * @return array{updated: ?string, source: string, rankings: array<int, array{rank:int, team:string, points:float, change:int}>}
 */
function loadCache(): array {
    if (!is_readable(CACHE_FILE)) {
        return ['updated' => null, 'source' => SOURCE_LABEL, 'rankings' => []];
    }
    $raw = file_get_contents(CACHE_FILE);
    if ($raw === false || $raw === '') {
        return ['updated' => null, 'source' => SOURCE_LABEL, 'rankings' => []];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['updated' => null, 'source' => SOURCE_LABEL, 'rankings' => []];
    }
    return [
        'updated' => isset($data['updated']) ? (string)$data['updated'] : null,
        'source' => isset($data['source']) ? (string)$data['source'] : SOURCE_LABEL,
        'rankings' => isset($data['rankings']) && is_array($data['rankings']) ? array_values(array_filter($data['rankings'], 'is_array')) : [],
    ];
}

/**
 * @param array{updated: ?string, source: string, rankings: array} $data
 * @return bool
 */
function saveCache(array $data): bool {
    if (!is_writable(dirname(CACHE_FILE))) {
        return false;
    }
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        return false;
    }
    return file_put_contents(CACHE_FILE, $json, LOCK_EX) !== false;
}

/**
 * @param string $num
 * @return float
 */
function parseNumber(string $num): float {
    $clean = trim($num);
    if ($clean === '' || $clean === '-' || $clean === '—') {
        return 0.0;
    }
    $clean = str_replace([' ', ','], ['', '.'], $clean);
    $clean = preg_replace('/[^0-9.\-+eE]/', '', $clean) ?? '';
    return $clean === '' ? 0.0 : (float)$clean;
}

/**
 * Parsea texto pegado (TSV, CSV o HTML) en un array de filas.
 * Detecta automáticamente el formato.
 *
 * @param string $text
 * @return array{ok: bool, rows: array<int, array{rank:int, team:string, points:float, change:int}>, unrecognized: string[], errors: string[]}
 */
function parsePastedTable(string $text): array {
    $text = trim($text);
    if ($text === '') {
        return ['ok' => false, 'rows' => [], 'unrecognized' => [], 'errors' => ['Texto vacío']];
    }

    $looksHtml = str_starts_with($text, '<') || str_contains(substr($text, 0, 200), '<tr') || str_contains(substr($text, 0, 200), '<td');
    if ($looksHtml) {
        return parseHtmlTable($text);
    }

    $lines = preg_split('/\r\n|\r|\n/', $text) ?: [];
    if (count($lines) === 0) {
        return ['ok' => false, 'rows' => [], 'unrecognized' => [], 'errors' => ['Sin líneas']];
    }

    $delimiter = (str_contains($lines[0], "\t") && substr_count($lines[0], "\t") >= 2) ? "\t" : (substr_count($lines[0], ',') >= 2 ? ',' : null);
    $rows = [];
    foreach ($lines as $line) {
        if (trim($line) === '') continue;
        $cols = $delimiter ? explode($delimiter, $line) : preg_split('/\s{2,}/', $line);
        $cols = array_map('trim', $cols ?: []);
        $cols = array_filter($cols, fn($c) => $c !== '');
        $cols = array_values($cols);
        if (count($cols) < 2) continue;

        $rank = isset($cols[0]) ? (int)preg_replace('/[^0-9]/', '', $cols[0]) : 0;
        $team = $cols[1] ?? '';
        $points = isset($cols[2]) ? parseNumber($cols[2]) : 0.0;
        $change = isset($cols[3]) ? (int)parseNumber($cols[3]) : 0;

        if ($rank < 1 || $rank > 250) continue;
        if ($team === '') continue;
        if ($points <= 0) continue;

        $rows[] = ['rank' => $rank, 'team' => normalizeTeam($team), 'points' => round($points, 2), 'change' => $change];
    }

    usort($rows, fn($a, $b) => $a['rank'] <=> $b['rank']);
    return ['ok' => count($rows) > 0, 'rows' => $rows, 'unrecognized' => [], 'errors' => []];
}

/**
 * @param string $html
 * @return array{ok: bool, rows: array, unrecognized: string[], errors: string[]}
 */
function parseHtmlTable(string $html): array {
    if (!class_exists('DOMDocument')) {
        return ['ok' => false, 'rows' => [], 'unrecognized' => [], 'errors' => ['Extensión DOM no disponible']];
    }
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8">' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    $xpath = new DOMXPath($dom);
    $rows = [];
    foreach ($xpath->query('//tr') as $tr) {
        $cells = [];
        foreach ($xpath->query('.//td | .//th', $tr) as $cell) {
            $cells[] = trim($cell->textContent);
        }
        $cells = array_values(array_filter($cells, fn($c) => $c !== ''));
        if (count($cells) < 2) continue;
        $rank = (int)preg_replace('/[^0-9]/', '', $cells[0]);
        $team = $cells[1] ?? '';
        $points = isset($cells[2]) ? parseNumber($cells[2]) : 0.0;
        $change = isset($cells[3]) ? (int)parseNumber($cells[3]) : 0;
        if ($rank < 1 || $rank > 250) continue;
        if ($team === '' || $points <= 0) continue;
        $rows[] = ['rank' => $rank, 'team' => normalizeTeam($team), 'points' => round($points, 2), 'change' => $change];
    }
    usort($rows, fn($a, $b) => $a['rank'] <=> $b['rank']);
    return ['ok' => count($rows) > 0, 'rows' => $rows, 'unrecognized' => [], 'errors' => []];
}

/**
 * Intenta hacer curl a FIFA. Devuelve filas si encuentra tabla; si no, error.
 *
 * @return array{ok: bool, rows: array, error?: string, htmlBytes?: int}
 */
function tryCurlFifa(): array {
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'rows' => [], 'error' => 'Extensión curl no disponible en este host'];
    }
    $userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    ];
    $lastError = '';
    foreach ($userAgents as $ua) {
        $ch = curl_init(FIFA_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_USERAGENT => $ua,
            CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml', 'Accept-Language: es-ES,es;q=0.9,en;q=0.8'],
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false || $code !== 200) {
            $lastError = "UA $ua -> HTTP $code, $err";
            continue;
        }
        $len = strlen($body);
        if ($len < 5000) {
            $lastError = "UA $ua -> respuesta muy corta ($len bytes, probablemente bloqueada)";
            continue;
        }
        $parsed = parseHtmlTable($body);
        if ($parsed['ok'] && count($parsed['rows']) >= 10) {
            return ['ok' => true, 'rows' => $parsed['rows'], 'htmlBytes' => $len];
        }
        $lastError = "UA $ua -> HTML sin tabla scrapeable ($len bytes)";
    }
    return ['ok' => false, 'rows' => [], 'error' => $lastError];
}

/**
 * @return void
 */
function sendCorsHeaders(): void {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept');
    header('Access-Control-Max-Age: 86400');
}

sendCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accept = strtolower($_SERVER['HTTP_ACCEPT'] ?? '');
$wantsJson = $method === 'GET' && (
    str_contains($accept, 'application/json') ||
    (isset($_GET['format']) && $_GET['format'] === 'json')
);

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($method === 'GET' && $wantsJson) {
    header('Content-Type: application/json');
    $cache = loadCache();
    echo json_encode($cache, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    header('Content-Type: application/json');
    $action = $_POST['action'] ?? (function () {
        $body = json_decode(file_get_contents('php://input') ?: '', true);
        return is_array($body) && isset($body['action']) ? $body['action'] : '';
    })();

    if ($action === 'clear') {
        if (is_writable(CACHE_FILE)) {
            @unlink(CACHE_FILE);
        }
        echo json_encode(['ok' => true, 'cleared' => true]);
        exit;
    }

    if ($action === 'curl') {
        $result = tryCurlFifa();
        if ($result['ok']) {
            $data = [
                'updated' => date('Y-m-d'),
                'source' => SOURCE_LABEL,
                'rankings' => $result['rows'],
            ];
            $saved = saveCache($data);
            echo json_encode([
                'ok' => true,
                'saved' => $saved,
                'count' => count($result['rows']),
                'htmlBytes' => $result['htmlBytes'] ?? null,
                'data' => $data,
            ], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(['ok' => false, 'error' => $result['error'] ?? 'Sin datos scrapeables'], JSON_UNESCAPED_UNICODE);
        }
        exit;
    }

    if ($action === 'paste') {
        $raw = $_POST['paste'] ?? '';
        $parsed = parsePastedTable($raw);
        if ($parsed['ok']) {
            $data = [
                'updated' => date('Y-m-d'),
                'source' => SOURCE_LABEL,
                'rankings' => $parsed['rows'],
            ];
            $saved = saveCache($data);
            echo json_encode([
                'ok' => true,
                'saved' => $saved,
                'count' => count($parsed['rows']),
                'data' => $data,
            ], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(['ok' => false, 'error' => 'No se pudo parsear el contenido', 'detail' => $parsed['errors']], JSON_UNESCAPED_UNICODE);
        }
        exit;
    }

    echo json_encode(['ok' => false, 'error' => 'Acción no reconocida: ' . $action], JSON_UNESCAPED_UNICODE);
    exit;
}

$cache = loadCache();
$updated = $cache['updated'];
$count = count($cache['rankings']);
$ageDays = $updated ? (int)floor((time() - strtotime($updated)) / 86400) : null;
$hasCurl = function_exists('curl_init');
$hasMb = function_exists('mb_strtoupper');
$hasDom = class_exists('DOMDocument');
$lastPostStatus = $_GET['status'] ?? '';
$lastPostMessage = $_GET['msg'] ?? '';
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ranking FIFA — Polla</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; line-height: 1.5; }
.wrap { max-width: 960px; margin: 0 auto; }
h1 { margin: 0 0 8px; font-size: 24px; background: linear-gradient(90deg, #a78bfa, #22d3ee); -webkit-background-clip: text; background-clip: text; color: transparent; }
.subtitle { color: #94a3b8; margin-bottom: 24px; font-size: 14px; }
.card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.card h2 { margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #cbd5e1; }
.status { display: flex; gap: 24px; flex-wrap: wrap; }
.status .pill { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 8px 12px; }
.status .pill .label { font-size: 11px; text-transform: uppercase; color: #94a3b8; }
.status .pill .value { font-size: 18px; font-weight: 700; }
.fresh { color: #34d399; }
.stale { color: #fbbf24; }
.empty { color: #f87171; }
button { cursor: pointer; background: #7c3aed; color: white; border: 0; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 14px; transition: background 0.15s; }
button:hover { background: #6d28d9; }
button:disabled { background: #475569; cursor: not-allowed; }
button.secondary { background: #334155; }
button.secondary:hover { background: #475569; }
textarea { width: 100%; min-height: 200px; background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; resize: vertical; }
textarea:focus { outline: none; border-color: #7c3aed; }
.actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.jsonbox { background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; max-height: 400px; overflow: auto; white-space: pre; }
.flash { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
.flash.ok { background: #064e3b; color: #6ee7b7; border: 1px solid #065f46; }
.flash.err { background: #7f1d1d; color: #fca5a5; border: 1px solid #991b1b; }
details { margin-top: 12px; }
summary { cursor: pointer; color: #94a3b8; font-size: 13px; }
a { color: #22d3ee; }
.cap { color: #94a3b8; font-size: 12px; }
.abilities { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.abilities span { background: #0f172a; border: 1px solid #334155; border-radius: 4px; padding: 2px 8px; font-size: 11px; color: #cbd5e1; }
.abilities span.no { color: #f87171; }
</style>
</head>
<body>
<div class="wrap">
<h1>🌍 Ranking FIFA — Polla</h1>
<p class="subtitle">Sirve el JSON que consume el modal de Estadísticas. Actualiza el cache manualmente una vez al mes o usa el auto-fetch.</p>

<?php if ($lastPostStatus === 'ok'): ?>
<div class="flash ok">✅ <?= htmlspecialchars($lastPostMessage) ?></div>
<?php elseif ($lastPostStatus === 'err'): ?>
<div class="flash err">❌ <?= htmlspecialchars($lastPostMessage) ?></div>
<?php endif; ?>

<div class="card">
<h2>Estado del cache</h2>
<div class="status">
<div class="pill">
<div class="label">Última actualización</div>
<div class="value <?= $ageDays === null ? 'empty' : ($ageDays > 35 ? 'stale' : 'fresh') ?>">
<?= $updated ? htmlspecialchars($updated) : '—' ?>
<?php if ($ageDays !== null): ?><span class="cap">(hace <?= $ageDays ?> días)<?php endif; ?>
</div>
</div>
<div class="pill">
<div class="label">Equipos en cache</div>
<div class="value"><?= $count ?></div>
</div>
<div class="pill">
<div class="label">Endpoint JSON</div>
<div class="value" style="font-size:13px"><code><?= htmlspecialchars($_SERVER['REQUEST_URI'] ?? '') ?>?format=json</code></div>
</div>
</div>
<div class="abilities">
<span class="<?= $hasCurl ? '' : 'no' ?>">curl: <?= $hasCurl ? '✓' : '✗' ?></span>
<span class="<?= $hasMb ? '' : 'no' ?>">mbstring: <?= $hasMb ? '✓' : '✗' ?></span>
<span class="<?= $hasDom ? '' : 'no' ?>">dom: <?= $hasDom ? '✓' : '✗' ?></span>
</div>
</div>

<div class="card">
<h2>1. Auto-fetch desde FIFA</h2>
<p class="cap">Lanza curl con 3 UAs (Chrome, Googlebot, Linux). FIFA es un SPA y normalmente no devuelve tabla en el HTML estático; si funciona, igual puedes usar el paste como respaldo.</p>
<form method="POST" id="curlForm">
<input type="hidden" name="action" value="curl">
<button type="submit" <?= $hasCurl ? '' : 'disabled' ?>>🔄 Re-intentar desde FIFA</button>
</form>
<div id="curlResult"></div>
</div>

<div class="card">
<h2>2. Pegar tabla manualmente</h2>
<p class="cap">Abre <a href="https://www.fifa.com/es/world-rankings" target="_blank" rel="noreferrer">fifa.com/es/world-rankings</a>, selecciona la tabla, copia (Ctrl+C) y pega aquí. Se detecta TSV (Excel/Sheets) o HTML (copia de navegador) automáticamente.</p>
<form method="POST" id="pasteForm">
<input type="hidden" name="action" value="paste">
<textarea name="paste" placeholder="1&#9;Spain&#9;1845.31&#9;0&#10;2&#9;Argentina&#9;1839.42&#9;0&#10;..."></textarea>
<div class="actions">
<button type="submit">📋 Procesar paste</button>
<button type="button" class="secondary" onclick="document.querySelector('textarea[name=paste]').value=''">Limpiar</button>
</div>
</form>
<div id="pasteResult"></div>
</div>

<div class="card">
<h2>3. Resultado actual (lo que consume la SPA)</h2>
<div class="actions">
<button type="button" onclick="copyJson()">📑 Copiar JSON</button>
<a class="secondary" style="text-decoration:none;background:#334155;color:white;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px" href="?format=json" download="fifa_rankings.json">⬇️ Descargar fifa_rankings.json</a>
<form method="POST" style="display:inline" onsubmit="return confirm('¿Borrar el cache? La SPA quedará sin ranking hasta que actualices.')">
<input type="hidden" name="action" value="clear">
<button type="submit" class="secondary">🗑️ Borrar cache</button>
</form>
</div>
<div class="jsonbox" id="jsonbox"><?= htmlspecialchars(json_encode($cache, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) ?></div>
</div>

<div class="card">
<h2>Ayuda</h2>
<details><summary>¿Cómo pegar la tabla de FIFA?</summary>
<p class="cap">Si abres FIFA en Chrome y haces Ctrl+A en la tabla, se copia como HTML. Pégalo en cualquier editor de texto plano (Notepad, VS Code) y vuelve a copiar desde ahí para tener TSV. Más fácil: usa Excel/Sheets como intermediario (Ctrl+V los convierte a columnas, Ctrl+C te da TSV).</p></details>
<details><summary>¿Por qué la SPA pide un JSON que ya no vive en el repo?</summary>
<p class="cap">El frontend ahora hace fetch a este endpoint PHP. Si este host se cae, el frontend cae automáticamente al archivo <code>public/fifa_rankings.json</code> que esté commiteado en la SPA (fallback offline).</p></details>
</div>

</div>

<script>
const jsonbox = document.getElementById('jsonbox');
async function copyJson() {
    try {
        await navigator.clipboard.writeText(jsonbox.textContent);
        const old = event.target.textContent;
        event.target.textContent = '✅ Copiado';
        setTimeout(() => { event.target.textContent = old; }, 1500);
    } catch (e) { alert('Copia manualmente'); }
}

function attachAjax(formId, resultId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const result = document.getElementById(resultId);
        result.innerHTML = '<p class="cap">⏳ Procesando...</p>';
        const fd = new FormData(form);
        try {
            const res = await fetch(form.action || location.href, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.ok) {
                result.innerHTML = `<div class="flash ok">✅ ${data.count || 0} filas parseadas${data.saved ? ' y guardadas en cache' : ''}. Recargando...</div>`;
                setTimeout(() => location.reload(), 1200);
            } else {
                result.innerHTML = `<div class="flash err">❌ ${data.error || 'Error desconocido'}${data.detail ? ': ' + (Array.isArray(data.detail) ? data.detail.join(', ') : data.detail) : ''}</div>`;
            }
        } catch (err) {
            result.innerHTML = `<div class="flash err">❌ ${err.message}</div>`;
        }
    });
}
attachAjax('curlForm', 'curlResult');
attachAjax('pasteForm', 'pasteResult');
</script>
</body>
</html>
