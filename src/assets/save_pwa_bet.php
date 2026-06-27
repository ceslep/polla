<?php
/**
 * save_pwa_bet.php - Guardar apuestas del PWA en Google Sheets (INMUTABLE)
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/save_pwa_bet.php
 *
 * Cambios vs versión anterior:
 *   - Auth vía {username, password} (no más {phone, pin}). Valida contra
 *     la hoja "participantes" (columnas B+C).
 *   - El nombre y teléfono del bet se toman de la hoja "participantes"
 *     (NO del payload), evitando que el cliente suplante la identidad.
 *   - `dev: true` salta la validación de credenciales (uso exclusivo en
 *     localhost). El frontend sólo envía este flag cuando hostname es dev.
 *
 * Esquema de la hoja "apuestas" (11 columnas A:K, alineado con seed_apuestas_from_json.php):
 *   A:id, B:timestamp (COT, formato WhatsApp 'n/j/y H:i'),
 *   C:participant, D:phone, E:matchDate, F:(vacía),
 *   G:homeTeam, H:awayTeam, I:homeScore, J:awayScore, K:submittedAt (ISO)
 *
 * Petición (POST, JSON):
 *   {
 *     "spreadsheetId": "...",
 *     "date": "YYYY-MM-DD",                    // día de los partidos (en COT)
 *     "firstMatchTime": "HH:MM",               // hora COT del primer partido
 *     "username": "3117250869",                // last 10 digits del phone (col B)
 *     "password": "0869",                      // last 4 digits (col C)
 *     "dev": false,
 *     "rootMode": false,                       // (opcional) true = el authed user es root
 *     "targetPhone": "...",                    // (requerido si rootMode=true) phone del participante
 *                                             //   al que se le guardan las apuestas
 *     "bets": [
 *       { "matchId": 42, "homeTeam": "Spain", "awayTeam": "Saudi Arabia",
 *         "homeScore": 3, "awayScore": 1 },
 *       ...
 *     ]
 *   }
 *
 * Modo root (rootMode: true):
 *   - El authed user debe tener isRoot=TRUE en `participantes` col F.
 *   - targetPhone debe existir en `participantes` (10 dígitos).
 *   - Los bets se insertan con participant/phone DEL TARGET (no del root).
 *   - El email de confirmación se envía a MAIL_GMAIL_USER (root), NO al
 *     target, con subject prefijado "[ROOT → {targetName}]".
 *   - Los gates de passwordChanged/email NO se aplican al target (el root
 *     tiene autoridad para apostar por cualquier participante registrado,
 *     incluso gente sin onboarding completo).
 *
 * Respuestas:
 *   200 { success: true, saved: N, alreadyExists: M }
 *   200 { success: true, saved: 0, alreadyExists: N } (idempotente)
 *   400 { success: false, error: "..." } (credenciales inválidas, ventana cerrada, JSON inválido)
 *   403 { success: false, error: "..." } (rootMode sin permisos, target no existe)
 *   500 { success: false, error: "..." } (error de Sheets)
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;
use Google\Service\Sheets\ValueRange;
use Google\Service\Sheets\BatchUpdateValuesRequest;

// PHPMailer: el `vendor/` del host solo tiene el Google client (Composer no
// instaló PHPMailer). Lo cargamos igual que `solicitarCodigo2.php` desde la
// carpeta `phpmailer/src/` que ya vive en el host. `require_once` es
// idempotente, así que si en el futuro se añade por Composer no duplica.
require_once __DIR__ . '/phpmailer/src/Exception.php';
require_once __DIR__ . '/phpmailer/src/PHPMailer.php';
require_once __DIR__ . '/phpmailer/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'apuestas';
const PARTICIPANTS_WORKSHEET = 'participantes';
const TIMEZONE = 'America/Bogota';
const COT_OFFSET_HOURS = -5;

const HEADERS = [
    'id', 'timestamp', 'participant', 'phone', 'matchDate', '',
    'homeTeam', 'awayTeam', 'homeScore', 'awayScore', 'submittedAt'
];

// ─── Email de confirmación post-save ────────────────────────────────────────
// Mismas credenciales y endpoint SMTP que cron_ranking_report.php y
// solicitarCodigo2.php (Gmail + contraseña de aplicación). PHPMailer se
// carga vía vendor/autoload.php (línea 42), igual que en el cron.
const MAIL_GMAIL_USER = 'ingeleandro@gmail.com';
const MAIL_GMAIL_PASS = 'zqqqtaoakbavgkou';
const PWA_PUBLIC_URL  = 'https://ceslep.github.io/polla/#/apostar';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

/**
 * @return DateTimeZone
 */
function tz(): DateTimeZone {
    try {
        return new DateTimeZone(TIMEZONE);
    } catch (Exception $e) {
        return new DateTimeZone(sprintf('%+03d:00', COT_OFFSET_HOURS));
    }
}

/**
 * Valida la ventana: ahora en COT debe estar entre [date 00:00 COT, firstMatchTime - 1min COT].
 * @param string $date 'YYYY-MM-DD'
 * @param string $firstMatchTime 'HH:MM'
 * @return array{ok: bool, now: string, openAt: string, closeAt: string}
 */
function validateWindow(string $date, string $firstMatchTime): array {
    $timezone = tz();
    $openAt = new DateTime($date . ' 00:00:00', $timezone);
    $closeAt = new DateTime($date . ' ' . $firstMatchTime . ':00', $timezone);
    $closeAt->modify('-1 minute');
    $now = new DateTime('now', $timezone);

    return [
        'ok' => ($now >= $openAt && $now <= $closeAt),
        'now' => $now->format('Y-m-d H:i:s'),
        'openAt' => $openAt->format('Y-m-d H:i:s'),
        'closeAt' => $closeAt->format('Y-m-d H:i:s')
    ];
}

/**
 * Autentica al usuario contra la hoja `participantes`. Devuelve ['participant' => ..., 'phone' => ...]
 * o lanza excepción con código 401 si las credenciales no coinciden.
 *
 * En dev mode (`$dev === true`) se salta la validación de formato (10/4 dígitos)
 * pero se hace el lookup real en la hoja `participantes` para que el nombre
 * del participante quede correctamente escrito en la hoja `apuestas`.
 *
 * @return array{participant: string, phone: string, passwordChanged: bool, email: string, isRoot: bool}
 */
function authenticate(string $spreadsheetId, string $username, string $password, bool $dev, Sheets $service): array {
    if (!$dev) {
        if (!preg_match('/^\d{10}$/', $username)) {
            throw new Exception('El usuario debe tener exactamente 10 dígitos.');
        }
        if (!preg_match('/^\d{4}$/', $password)) {
            throw new Exception('La contraseña debe tener exactamente 4 dígitos.');
        }
    }

    // Sanitizar input: quedarse con los últimos 10/4 dígitos (en dev puede venir
    // con espacios, guiones, prefijos).
    $usernameClean = preg_replace('/\D+/', '', $username);
    $usernameLast10 = strlen($usernameClean) >= 10
        ? substr($usernameClean, -10)
        : $usernameClean;
    $passwordClean = preg_replace('/\D+/', '', $password);
    $passwordLast4 = strlen($passwordClean) >= 4
        ? substr($passwordClean, -4)
        : $passwordClean;

    $range = PARTICIPANTS_WORKSHEET . '!A2:F1000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues() ?: [];

    foreach ($rows as $row) {
        // Columna B puede traer prefijo país y separadores; limpiamos a
        // sólo dígitos y comparamos los últimos 10 contra el username.
        $rowPhoneRaw = trim((string)($row[1] ?? ''));
        $rowPhoneClean = preg_replace('/\D+/', '', $rowPhoneRaw);
        $rowPhoneLast10 = strlen($rowPhoneClean) >= 10
            ? substr($rowPhoneClean, -10)
            : '';

        // Columna C: limpiamos y comparamos los últimos 4 contra el password.
        $rowPasswordRaw = trim((string)($row[2] ?? ''));
        $rowPasswordClean = preg_replace('/\D+/', '', $rowPasswordRaw);
        $rowPasswordLast4 = strlen($rowPasswordClean) >= 4
            ? substr($rowPasswordClean, -4)
            : '';

        if ($rowPhoneLast10 !== '' && $rowPhoneLast10 === $usernameLast10
            && $rowPasswordLast4 !== '' && $rowPasswordLast4 === $passwordLast4) {
            // Columna D: TRUE/FALSE. TRUE = el usuario YA cambió su contraseña.
            $rowMustChangeRaw = strtolower(trim((string)($row[3] ?? '')));
            $passwordChanged = in_array($rowMustChangeRaw, ['true', '1', 'yes', 'si'], true);

            // Columna E: email (puede estar vacía si el usuario nunca lo registró).
            $email = trim((string)($row[4] ?? ''));

            // Columna F: isRoot. TRUE = el usuario puede apostar a nombre de otros.
            $rowIsRootRaw = strtolower(trim((string)($row[5] ?? '')));
            $isRoot = in_array($rowIsRootRaw, ['true', '1', 'yes', 'si'], true);

            return [
                'participant' => trim((string)($row[0] ?? '')),
                'phone' => $rowPhoneLast10,
                'passwordChanged' => $passwordChanged,
                'email' => $email,
                'isRoot' => $isRoot
            ];
        }
    }

    http_response_code(401);
    throw new Exception('Credenciales inválidas.');
}

/**
 * Lookup de un participante por phone (10 dígitos). Usado en root mode
 * para validar que el target existe y obtener su nombre para la fila de
 * apuestas. Devuelve null si no se encuentra.
 *
 * Solo lee las primeras 5 columnas (no necesitamos isRoot del target).
 *
 * @return array{participant: string, phone: string}|null
 */
function lookupParticipantByPhone(string $spreadsheetId, string $phone10, Sheets $service): ?array {
    $range = PARTICIPANTS_WORKSHEET . '!A2:E1000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues() ?: [];

    foreach ($rows as $row) {
        $rowPhoneRaw = trim((string)($row[1] ?? ''));
        $rowPhoneClean = preg_replace('/\D+/', '', $rowPhoneRaw);
        $rowPhoneLast10 = strlen($rowPhoneClean) >= 10
            ? substr($rowPhoneClean, -10)
            : '';
        if ($rowPhoneLast10 !== '' && $rowPhoneLast10 === $phone10) {
            return [
                'participant' => trim((string)($row[0] ?? '')),
                'phone' => $rowPhoneLast10
            ];
        }
    }
    return null;
}

/**
 * Envía un correo de confirmación al participante después de un
 * save_pwa_bet exitoso. Fire-and-confirm: un fallo SMTP NO rompe la
 * respuesta del endpoint (la apuesta ya está en Sheets). El caller
 * loguea $result['error'] si !success. Nunca lanza excepciones.
 *
 * Patrón basado en solicitarCodigo2.php (que funciona): self-CC (FROM
 * a sí mismo), HTML con <style> en <head>, subject plano sin emoji.
 * El self-CC evita que Gmail filtre el email por cross-account delivery.
 *
 * @param string $toEmail        columna E de la hoja `participantes` (o MAIL_GMAIL_USER en root mode)
 * @param string $toName         columna A (display name)
 * @param string $matchDate      'YYYY-MM-DD' (fecha COT de los partidos)
 * @param array<int,array{id:string,row:array}> $newRows  filas ya validadas
 * @param string $firstMatchTime 'HH:MM' hora COT de cierre de ventana
 * @param bool $rootMode         si true, prefijia el subject con "[ROOT] {name}"
 * @return array{success:bool, error:?string}
 */
function sendBetConfirmationEmail(
    string $toEmail,
    string $toName,
    string $matchDate,
    array $newRows,
    string $firstMatchTime,
    bool $rootMode = false
): array {
    try {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->SMTPDebug      = 0;
        $mail->Debugoutput    = 'echo';
        $mail->Host           = 'smtp.gmail.com';
        $mail->Port           = 465;
        $mail->SMTPSecure     = 'ssl';
        $mail->SMTPAuth       = true;
        $mail->SMTPAutoTLS    = false;
        $mail->Timeout        = 30;
        $mail->ConnectTimeout = 30;
        $mail->Username       = MAIL_GMAIL_USER;
        $mail->Password       = MAIL_GMAIL_PASS;
        $mail->setFrom(MAIL_GMAIL_USER, 'Polla Mundialista 2026 - IED Occidente');
        $mail->addReplyTo(MAIL_GMAIL_USER, 'Polla Mundialista 2026');
        $mail->addAddress($toEmail, $toName);
        $mail->addCC(MAIL_GMAIL_USER); // self-CC (FROM a sí mismo) como en solicitarCodigo2.php
        $mail->isHTML(true);
        $mail->CharSet = 'UTF-8';

        $mail->Subject = $rootMode
            ? "[ROOT] Apuestas del {$matchDate} guardadas - Polla 2026 ({$toName})"
            : "Apuestas del {$matchDate} guardadas - Polla 2026";

        // Orden estable por equipo local para que la tabla no salte
        // entre envíos. Mapeo: row[6] = team1, row[7] = team2,
        // row[8] = score1, row[9] = score2 (ver HEADERS arriba).
        $betsForEmail = $newRows;
        usort($betsForEmail, function ($a, $b) {
            return strcmp((string)$a['row'][6], (string)$b['row'][6]);
        });

        $rowsHtml = '';
        $altLines = [];
        foreach ($betsForEmail as $entry) {
            $row  = $entry['row'];
            $home = htmlspecialchars((string)$row[6], ENT_QUOTES, 'UTF-8');
            $away = htmlspecialchars((string)$row[7], ENT_QUOTES, 'UTF-8');
            $hs   = (int)$row[8];
            $as   = (int)$row[9];
            $rowsHtml .= "<tr>"
                . "<td>{$home}</td>"
                . "<td class='vs'>vs</td>"
                . "<td>{$away}</td>"
                . "<td class='score'>{$hs} - {$as}</td>"
                . "</tr>";
            $altLines[] = "{$row[6]} vs {$row[7]}: {$hs} - {$as}";
        }
        $altBody = "Apuestas del {$matchDate} guardadas en la Polla Mundialista 2026.\n\n"
            . "Pronosticos:\n  - " . implode("\n  - ", $altLines) . "\n\n"
            . "Cierre de la ventana: {$firstMatchTime} (hora Colombia).\n"
            . "Ver detalles: " . PWA_PUBLIC_URL . "\n";

        $nameEsc = htmlspecialchars($toName,     ENT_QUOTES, 'UTF-8');
        $dateEsc = htmlspecialchars($matchDate,  ENT_QUOTES, 'UTF-8');
        $timeEsc = htmlspecialchars($firstMatchTime, ENT_QUOTES, 'UTF-8');
        $urlEsc  = htmlspecialchars(PWA_PUBLIC_URL, ENT_QUOTES, 'UTF-8');

        // Layout email-safe inspirado en solicitarCodigo2.php:
        // <style> en <head>, sin inline styles, fondo claro, tabla
        // con <thead>/<tbody>, jerarquía clara. Los gradientes oscuros
        // y los inline styles del HTML original hacían que Gmail lo
        // marque como "promocional" y filtre el cross-account CC.
        $html = <<<HTML
<!DOCTYPE html>
<html lang='es'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width,initial-scale=1.0'>
    <style>
        body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;background:#f5f5f5;margin:0;padding:0}
        .container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);overflow:hidden}
        .header{background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);color:#fff;padding:30px;text-align:center}
        .logo{font-size:28px;font-weight:800;margin-bottom:8px;letter-spacing:.5px}
        .subtitle{margin:0;font-size:14px;opacity:.9}
        .content{padding:30px}
        .greeting{font-size:18px;margin-bottom:16px;color:#10b981;font-weight:600}
        .info-box{background:#e3f2fd;border-left:4px solid #2196f3;padding:14px 18px;margin:20px 0;border-radius:5px;color:#1565c0;font-size:14px}
        .info-box strong{color:#0d47a1}
        table{width:100%;border-collapse:collapse;margin:20px 0;background:#fafafa;border-radius:5px;overflow:hidden}
        thead{background:#eceff1}
        th{padding:12px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600;border-bottom:2px solid #cfd8dc}
        td{padding:12px 14px;border-bottom:1px solid #eceff1;color:#333}
        td.score{text-align:center;font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#10b981}
        td.vs{text-align:center;color:#999;font-weight:600}
        .cta-wrap{text-align:center;margin:24px 0 8px}
        .cta{display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);color:#fff;text-decoration:none;border-radius:9999px;font-weight:700;font-size:15px;box-shadow:0 2px 8px rgba(16,185,129,.3)}
        .footer{background:#f5f5f5;padding:20px 30px;font-size:12px;color:#666;text-align:center;border-top:1px solid #ddd}
        .footer p{margin:5px 0}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='logo'>&#x26bd;&#xFE0F; POLLA 2026</div>
            <p class='subtitle'>Apuestas guardadas</p>
        </div>
        <div class='content'>
            <p class='greeting'>Hola, {$nameEsc}!</p>
            <div class='info-box'>
                Tus apuestas del <strong>{$dateEsc}</strong> se guardaron correctamente.
                La ventana cierra a las <strong>{$timeEsc}</strong> (hora Colombia).
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Local</th>
                        <th></th>
                        <th>Visitante</th>
                        <th>Tu apuesta</th>
                    </tr>
                </thead>
                <tbody>
                    {$rowsHtml}
                </tbody>
            </table>
            <div class='cta-wrap'>
                <a href='{$urlEsc}' class='cta'>Ver en la PWA</a>
            </div>
        </div>
        <div class='footer'>
            <p>Polla Mundialista 2026 &middot; IED Occidente</p>
            <p>Este correo fue enviado de forma automatica. Por favor no respondas.</p>
        </div>
    </div>
</body>
</html>
HTML;

        $mail->Body    = $html;
        $mail->AltBody = $altBody;
        $mail->send();
        return ['success' => true, 'error' => null];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
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

    foreach (['spreadsheetId', 'date', 'firstMatchTime', 'username', 'password', 'bets'] as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    if (!is_array($data['bets']) || count($data['bets']) === 0) {
        throw new Exception('El campo "bets" debe ser un arreglo no vacío.');
    }

    $spreadsheetId = $data['spreadsheetId'];
    $date = trim($data['date']);
    $firstMatchTime = trim($data['firstMatchTime']);
    $username = trim($data['username']);
    $password = trim($data['password']);
    $dev = ($data['dev'] ?? false) === true;
    $rootMode = ($data['rootMode'] ?? false) === true;
    $targetPhoneRaw = isset($data['targetPhone']) ? trim((string)$data['targetPhone']) : '';

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        throw new Exception('date debe tener formato YYYY-MM-DD.');
    }
    if (!preg_match('/^\d{1,2}:\d{2}$/', $firstMatchTime)) {
        throw new Exception('firstMatchTime debe tener formato HH:MM.');
    }

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    // 1. Autenticar contra la hoja `participantes`
    $auth = authenticate($spreadsheetId, $username, $password, $dev, $service);
    $participant = $auth['participant'];
    $phone = $auth['phone'];
    /** @var array{participant:string, phone:string, passwordChanged:bool, email:string, isRoot:bool} $auth */

    // 1a. Modo root: el authed user debe tener isRoot=TRUE y el payload debe
    // traer un targetPhone válido (10 dígitos). En modo root, los bets se
    // insertan como el TARGET y el email va al root (no al target). Los
    // gates de passwordChanged/email se aplican AL ROOT (no al target —
    // el root tiene autoridad para apostar por cualquier participante
    // registrado, incluso gente sin onboarding completo).
    $targetAuth = null;
    if ($rootMode) {
        if (!$auth['isRoot']) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'No tienes permisos de root para apostar a nombre de otros.'
            ]);
            exit;
        }
        if ($targetPhoneRaw === '') {
            throw new Exception('rootMode=true requiere targetPhone.');
        }
        $targetPhoneClean = preg_replace('/\D+/', '', $targetPhoneRaw);
        $targetPhoneLast10 = strlen($targetPhoneClean) >= 10
            ? substr($targetPhoneClean, -10)
            : $targetPhoneClean;
        if (!preg_match('/^\d{10}$/', $targetPhoneLast10)) {
            throw new Exception('targetPhone debe tener exactamente 10 dígitos.');
        }
        $targetAuth = lookupParticipantByPhone($spreadsheetId, $targetPhoneLast10, $service);
        if ($targetAuth === null) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'error' => 'El participante destino (targetPhone) no existe en la hoja.'
            ]);
            exit;
        }
    }

    // 1b. Gates de cumplimiento: D = passwordChanged, E = email.
    // Defense-in-depth — el frontend ya enruta, pero un POST directo a este
    // endpoint NO debe poder apostar sin haber pasado por el flujo de
    // change-password y email-prompt. En root mode se aplican al ROOT, no
    // al target (el root ya completó su propio onboarding).
    if (empty($auth['passwordChanged'])) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Debes cambiar tu contraseña antes de apostar.'
        ]);
        exit;
    }
    if (empty($auth['email'])) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Debes registrar un correo electrónico antes de apostar.'
        ]);
        exit;
    }

    // 1c. En root mode, sobreescribimos participant/phone con los del TARGET
    // (y guardamos el targetAuth para usarlos al construir las filas y al
    // enviar el email). El email NO va al target — va al MAIL_GMAIL_USER.
    if ($rootMode) {
        $participant = $targetAuth['participant'];
        $phone = $targetAuth['phone'];
    }

    // 2. Validar ventana (server-side, hora COT)
    $window = validateWindow($date, $firstMatchTime);
    if (!$dev && !$window['ok']) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Ventana de apuestas cerrada.',
            'window' => $window
        ]);
        exit;
    }

    // 3. Generar ids determinísticos: pwa_<phone>_<date>_<matchId>
    $nowIso = (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    // Timestamp en formato WhatsApp-like (n/j/y H:i) en COT — coincide con
    // el formato de la columna B de los bets del seed.
    $cotTimestamp = (new DateTime('now', tz()))->format('n/j/y H:i');

    /** @var array<int, array{id: string, row: array}> */
    $newRows = [];
    foreach ($data['bets'] as $bet) {
        if (!isset($bet['matchId'], $bet['homeTeam'], $bet['awayTeam'], $bet['homeScore'], $bet['awayScore'])) {
            throw new Exception('Cada bet debe tener matchId, homeTeam, awayTeam, homeScore, awayScore.');
        }
        $homeScore = filter_var($bet['homeScore'], FILTER_VALIDATE_INT);
        $awayScore = filter_var($bet['awayScore'], FILTER_VALIDATE_INT);
        if ($homeScore === false || $homeScore < 0 || $homeScore > 9) {
            throw new Exception('homeScore debe ser entero entre 0 y 9.');
        }
        if ($awayScore === false || $awayScore < 0 || $awayScore > 9) {
            throw new Exception('awayScore debe ser entero entre 0 y 9.');
        }
        $id = sprintf('pwa_%s_%s_%s', $phone, $date, $bet['matchId']);
        $newRows[] = [
            'id' => $id,
            'row' => [
                $id,                          // A: id
                $cotTimestamp,                // B: timestamp (COT, formato seed)
                $participant,                 // C: participant
                $phone,                       // D: phone
                $date,                        // E: matchDate
                '',                           // F: vacía (alineada con seed)
                (string)$bet['homeTeam'],     // G
                (string)$bet['awayTeam'],     // H
                $homeScore,                   // I
                $awayScore,                   // J
                $nowIso                       // K: submittedAt (ISO)
            ]
        ];
    }

    // 4. Leer la hoja `apuestas` para detectar duplicados (idempotencia)
    /** @var array<string, int> $existingMap id => rowIndex (1-based) */
    $existingMap = [];
    /** @var array<int, array> $existingValues */
    $existingValues = [];
    $hasHeaders = false;

    try {
        $range = WORKSHEET . '!A1:K50000';
        $response = $service->spreadsheets_values->get($spreadsheetId, $range);
        $existingValues = $response->getValues() ?: [];
        $hasHeaders = count($existingValues) > 0 && strtolower($existingValues[0][0] ?? '') === 'id';
        $dataStartRow = $hasHeaders ? 2 : 1;
        for ($i = $dataStartRow; $i < count($existingValues); $i++) {
            $rowId = trim($existingValues[$i][0] ?? '');
            if ($rowId) {
                $existingMap[$rowId] = $i + 1;
            }
        }
    } catch (Exception $e) {
        error_log('save_pwa_bet: hoja apuestas no existe o error de lectura: ' . $e->getMessage());
    }

    // 5. Detectar duplicados y preparar inserts
    $inserts = [];
    $alreadyExists = [];
    $nextRow = count($existingValues) + 1;

    foreach ($newRows as $entry) {
        $id = $entry['id'];
        if (isset($existingMap[$id])) {
            $alreadyExists[] = $id;
            continue;
        }
        $inserts[] = [
            'id' => $id,
            'rowIndex' => $nextRow
        ];
        $existingMap[$id] = $nextRow;
        $nextRow++;
    }

    // 6. Headers si la hoja está vacía
    $batchOps = [];
    if (!$hasHeaders) {
        $batchOps[] = [
            'range' => WORKSHEET . '!A1:K1',
            'values' => [HEADERS]
        ];
    }

    // 7. Preparar batch update con los inserts
    foreach ($inserts as $ins) {
        $entry = null;
        foreach ($newRows as $nr) {
            if ($nr['id'] === $ins['id']) { $entry = $nr; break; }
        }
        if (!$entry) continue;
        $batchOps[] = [
            'range' => WORKSHEET . '!A' . $ins['rowIndex'] . ':K' . $ins['rowIndex'],
            'values' => [$entry['row']]
        ];
    }

    // 8. Ejecutar batch
    if (count($batchOps) > 0) {
        $body = new BatchUpdateValuesRequest([
            'valueInputOption' => 'RAW',
            'data' => $batchOps
        ]);
        $service->spreadsheets_values->batchUpdate($spreadsheetId, $body);
    }

    // 9. Email de confirmación. Fire-and-confirm: un fallo SMTP NO rompe
    //    la respuesta del endpoint (la apuesta ya está en Sheets). Se
    //    loguea a error_log para diagnóstico.
    //    - Caso normal: email al PARTICIPANTE (auth['email']).
    //    - Root mode: email al ROOT (MAIL_GMAIL_USER), con subject prefijado
    //      "[ROOT → {targetName}]" para que quede claro en la auditoría.
    //    - No envía en dev (incluso si el caller pasó $dev=true).
    //    - Envía tanto en inserts nuevos como en all-duplicate submits.
    if (!$dev && !empty($newRows)) {
        $mailTo = $rootMode ? MAIL_GMAIL_USER : $auth['email'];
        $mailToName = $rootMode ? ('Root → ' . $participant) : $participant;
        if (!empty($mailTo)) {
            $mailResult = sendBetConfirmationEmail(
                $mailTo,
                $mailToName,
                $date,
                $newRows,
                $firstMatchTime,
                $rootMode
            );
            if (!$mailResult['success']) {
                error_log('save_pwa_bet: confirmation email failed for '
                    . $mailTo . ': ' . $mailResult['error']);
            }
        }
    }

    echo json_encode([
        'success' => true,
        'message' => count($inserts) > 0
            ? 'Apuestas guardadas exitosamente.'
            : 'Todas las apuestas ya existían (idempotente).',
        'saved' => count($inserts),
        'alreadyExists' => count($alreadyExists),
        'window' => $window,
        'submittedAt' => $nowIso
    ]);

} catch (Exception $e) {
    $code = http_response_code();
    if ($code === 200 || !$code) {
        http_response_code(500);
    }
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
