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
 *     "bets": [
 *       { "matchId": 42, "homeTeam": "Spain", "awayTeam": "Saudi Arabia",
 *         "homeScore": 3, "awayScore": 1 },
 *       ...
 *     ]
 *   }
 *
 * Respuestas:
 *   200 { success: true, saved: N, alreadyExists: M }
 *   200 { success: true, saved: 0, alreadyExists: N } (idempotente)
 *   400 { success: false, error: "..." } (credenciales inválidas, ventana cerrada, JSON inválido)
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
// CC opcional como respaldo/monitoreo. Distinto del ROOT_EMAIL del cron
// (admin@iedeoccidente.com) a propósito: el cron es admin-only, la
// confirmación de apuesta la recibe el dueño del repo.
const MAIL_ADMIN_CC   = 'ceslep@gmail.com';
const PWA_PUBLIC_URL  = 'https://app.iedeoccidente.com/polla/#/apostar';

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
 * @return array{participant: string, phone: string}
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

    $range = PARTICIPANTS_WORKSHEET . '!A2:E1000';
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

            return [
                'participant' => trim((string)($row[0] ?? '')),
                'phone' => $rowPhoneLast10,
                'passwordChanged' => $passwordChanged,
                'email' => $email
            ];
        }
    }

    http_response_code(401);
    throw new Exception('Credenciales inválidas.');
}

/**
 * Envía un correo de confirmación al participante después de un
 * save_pwa_bet exitoso. Fire-and-confirm: un fallo SMTP NO rompe la
 * respuesta del endpoint (la apuesta ya está en Sheets). El caller
 * loguea $result['error'] si !success. Nunca lanza excepciones.
 *
 * @param string $toEmail        columna E de la hoja `participantes`
 * @param string $toName         columna A (display name)
 * @param string $matchDate      'YYYY-MM-DD' (fecha COT de los partidos)
 * @param array<int,array{id:string,row:array}> $newRows  filas ya validadas
 * @param string $firstMatchTime 'HH:MM' hora COT de cierre de ventana
 * @return array{success:bool, error:?string}
 */
function sendBetConfirmationEmail(
    string $toEmail,
    string $toName,
    string $matchDate,
    array $newRows,
    string $firstMatchTime
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
        $mail->setFrom(MAIL_GMAIL_USER, 'Polla Mundialista 2026');
        $mail->addReplyTo(MAIL_GMAIL_USER, 'Polla Mundialista 2026');
        $mail->addAddress($toEmail, $toName);
        $mail->addCC(MAIL_ADMIN_CC); // respaldo/monitoreo
        $mail->isHTML(true);
        $mail->CharSet = 'UTF-8';
        $mail->Subject = "✅ Apuestas del {$matchDate} guardadas — Polla 2026";

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
                . "<td style='padding:10px 14px;color:#fff;font-weight:600;border-bottom:1px solid rgba(255,255,255,.06);'>{$home}</td>"
                . "<td style='padding:10px 6px;color:#9ca3af;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);'>vs</td>"
                . "<td style='padding:10px 14px;color:#fff;font-weight:600;border-bottom:1px solid rgba(255,255,255,.06);'>{$away}</td>"
                . "<td style='padding:10px 14px;text-align:center;font-family:\"Courier New\",monospace;font-size:18px;font-weight:700;color:#10b981;border-bottom:1px solid rgba(255,255,255,.06);'>{$hs} - {$as}</td>"
                . "</tr>";
            $altLines[] = "{$row[6]} vs {$row[7]}: {$hs} - {$as}";
        }
        $altBody = "Apuestas del {$matchDate} guardadas en la Polla Mundialista 2026.\n\n"
            . "Pron\u00f3sticos:\n  - " . implode("\n  - ", $altLines) . "\n\n"
            . "Cierre de la ventana: {$firstMatchTime} (hora Colombia).\n"
            . "Ver detalles: " . PWA_PUBLIC_URL . "\n";

        $nameEsc = htmlspecialchars($toName,     ENT_QUOTES, 'UTF-8');
        $dateEsc = htmlspecialchars($matchDate,  ENT_QUOTES, 'UTF-8');
        $timeEsc = htmlspecialchars($firstMatchTime, ENT_QUOTES, 'UTF-8');
        $urlEsc  = htmlspecialchars(PWA_PUBLIC_URL, ENT_QUOTES, 'UTF-8');

        $html = <<<HTML
<!DOCTYPE html>
<html lang='es'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width,initial-scale=1.0'>
</head>
<body style='margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#e5e7eb;'>
    <div style='max-width:600px;margin:0 auto;background:#111;border-radius:12px;overflow:hidden;'>
        <div style='background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);padding:32px 28px;text-align:center;'>
            <div style='font-size:28px;font-weight:800;color:#fff;letter-spacing:.5px;'>\u26bd\ufe0f POLLA 2026</div>
            <div style='margin-top:6px;font-size:14px;color:rgba(255,255,255,.85);'>Apuestas guardadas</div>
        </div>
        <div style='padding:28px 24px;'>
            <p style='margin:0 0 6px;font-size:14px;color:#9ca3af;'>Hola,</p>
            <p style='margin:0 0 18px;font-size:18px;font-weight:700;color:#fff;'>{$nameEsc}</p>
            <p style='margin:0 0 18px;font-size:15px;line-height:1.55;color:#d1d5db;'>
                Tus apuestas del <strong style='color:#10b981;'>{$dateEsc}</strong> se guardaron correctamente. La ventana cierra a las <strong style='color:#06b6d4;'>{$timeEsc}</strong> (hora Colombia).
            </p>
            <table cellpadding='0' cellspacing='0' style='width:100%;border-collapse:collapse;background:rgba(255,255,255,.03);border-radius:8px;overflow:hidden;'>
                <thead>
                    <tr style='background:rgba(255,255,255,.04);'>
                        <th style='padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;'>Local</th>
                        <th style='padding:10px 6px;font-size:11px;color:#9ca3af;'></th>
                        <th style='padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;'>Visitante</th>
                        <th style='padding:10px 14px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:600;'>Tu apuesta</th>
                    </tr>
                </thead>
                <tbody>
                    {$rowsHtml}
                </tbody>
            </table>
            <div style='text-align:center;margin:28px 0 8px;'>
                <a href='{$urlEsc}' style='display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);color:#fff;text-decoration:none;border-radius:9999px;font-weight:700;font-size:15px;box-shadow:0 4px 14px rgba(16,185,129,.4);'>Ver en la PWA \u2192</a>
            </div>
            <p style='margin:18px 0 0;font-size:12px;color:#6b7280;line-height:1.5;'>
                Esta ventana de apuestas se cierra a las {$timeEsc} (hora Colombia). Si necesit\u00e1s cambiar alg\u00fan pron\u00f3stico antes del cierre, vuelve a abrir la PWA.
            </p>
        </div>
        <div style='background:#0a0a0a;padding:18px 24px;font-size:11px;color:#6b7280;text-align:center;border-top:1px solid rgba(255,255,255,.05);'>
            <div>Polla Mundialista 2026 \u2014 Notificaci\u00f3n autom\u00e1tica</div>
            <div style='margin-top:4px;'>Por favor no respondas a este correo.</div>
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

    // 1b. Gates de cumplimiento: D = passwordChanged, E = email.
    // Defense-in-depth — el frontend ya enruta, pero un POST directo a este
    // endpoint NO debe poder apostar sin haber pasado por el flujo de
    // change-password y email-prompt.
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

    // 9. Email de confirmación al participante (CC al admin). Fire-and-confirm:
    //    un fallo SMTP NO rompe la respuesta del endpoint (la apuesta ya
    //    está en Sheets). Se loguea a error_log para diagnóstico.
    //    - No envía en dev (incluso si el caller pasó $dev=true).
    //    - No envía si la columna E está vacía (defensa redundante — el gate
    //      anterior a este punto ya impide llegar aquí sin email registrado).
    //    - Envía tanto en inserts nuevos como en all-duplicate submits.
    if (!$dev && !empty($auth['email']) && !empty($newRows)) {
        $mailResult = sendBetConfirmationEmail(
            $auth['email'],
            $participant,
            $date,
            $newRows,
            $firstMatchTime
        );
        if (!$mailResult['success']) {
            error_log('save_pwa_bet: confirmation email failed for '
                . $auth['email'] . ': ' . $mailResult['error']);
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
