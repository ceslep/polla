<?php
/**
 * list_participants.php - Listar participantes (root auth required)
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/list_participants.php
 *
 * Devuelve la lista completa de participantes de la hoja `participantes` con
 * los campos públicos: name, phone, passwordChanged, email, isRoot.
 *
 * Auth: {username, password} validados contra la hoja "participantes".
 * El authed user DEBE tener isRoot=TRUE en columna F; si no, devuelve 403.
 *
 * Pensado para alimentar el dropdown del panel root (PwaRootPanel.svelte).
 * NO expone la contraseña (col C): el frontend root no necesita conocer el
 * last 4 de cada participante porque save_pwa_bet.php en rootMode acepta
 * targetPhone directamente.
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "username": "...", "password": "...", "dev": false }
 *
 * Respuestas:
 *   200 { success: true, participants: [ {name, phone, passwordChanged, email, isRoot}, ... ] }
 *   401 { success: false, error: "Credenciales inválidas" }
 *   403 { success: false, error: "Se requieren permisos de root." }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

// PHPMailer: el `vendor/` del host solo tiene el Google client (Composer no
// instaló PHPMailer). Lo cargamos igual que `solicitarCodigo2.php` desde la
// carpeta `phpmailer/src/` que ya vive en el host. `require_once` es
// idempotente, así que si en el futuro se añade por Composer no duplica.
require_once __DIR__ . '/phpmailer/src/Exception.php';
require_once __DIR__ . '/phpmailer/src/PHPMailer.php';
require_once __DIR__ . '/phpmailer/src/SMTP.php';

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const PARTICIPANTS_WORKSHEET = 'participantes';

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

    foreach (['spreadsheetId', 'username', 'password'] as $field) {
        if (!isset($data[$field])) {
            throw new Exception("Falta el campo requerido: $field");
        }
    }

    $spreadsheetId = $data['spreadsheetId'];
    $username = trim($data['username']);
    $password = trim($data['password']);
    $dev = ($data['dev'] ?? false) === true;

    if (!$dev) {
        if (!preg_match('/^\d{10}$/', $username)) {
            throw new Exception('El usuario debe tener exactamente 10 dígitos.');
        }
        if (!preg_match('/^\d{4}$/', $password)) {
            throw new Exception('La contraseña debe tener exactamente 4 dígitos.');
        }
    }

    $usernameClean = preg_replace('/\D+/', '', $username);
    $usernameLast10 = strlen($usernameClean) >= 10
        ? substr($usernameClean, -10)
        : $usernameClean;
    $passwordClean = preg_replace('/\D+/', '', $password);
    $passwordLast4 = strlen($passwordClean) >= 4
        ? substr($passwordClean, -4)
        : $passwordClean;

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA Root');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    $range = PARTICIPANTS_WORKSHEET . '!A2:F1000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues() ?: [];

    $callerIsRoot = false;
    $participants = [];

    foreach ($rows as $row) {
        $rowPhoneRaw = trim((string)($row[1] ?? ''));
        $rowPhoneClean = preg_replace('/\D+/', '', $rowPhoneRaw);
        $rowPhoneLast10 = strlen($rowPhoneClean) >= 10
            ? substr($rowPhoneClean, -10)
            : '';

        $rowPasswordRaw = trim((string)($row[2] ?? ''));
        $rowPasswordClean = preg_replace('/\D+/', '', $rowPasswordRaw);
        $rowPasswordLast4 = strlen($rowPasswordClean) >= 4
            ? substr($rowPasswordClean, -4)
            : '';

        $rowMustChangeRaw = strtolower(trim((string)($row[3] ?? '')));
        $rowPasswordChanged = in_array($rowMustChangeRaw, ['true', '1', 'yes', 'si'], true);

        $rowEmail = trim((string)($row[4] ?? ''));

        $rowIsRootRaw = strtolower(trim((string)($row[5] ?? '')));
        $rowIsRoot = in_array($rowIsRootRaw, ['true', '1', 'yes', 'si'], true);

        // Validar caller.
        if (!$callerIsRoot
            && $rowPhoneLast10 !== '' && $rowPhoneLast10 === $usernameLast10
            && $rowPasswordLast4 !== '' && $rowPasswordLast4 === $passwordLast4
            && $rowIsRoot) {
            $callerIsRoot = true;
        }

        // Saltar filas sin phone (vacías) o sin participant (filas placeholder).
        if ($rowPhoneLast10 === '' || trim((string)($row[0] ?? '')) === '') {
            continue;
        }

        $participants[] = [
            'name' => trim((string)($row[0] ?? '')),
            'phone' => $rowPhoneLast10,
            'passwordChanged' => $rowPasswordChanged,
            'email' => $rowEmail,
            'isRoot' => $rowIsRoot
        ];
    }

    if (!$callerIsRoot) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Se requieren permisos de root (isRoot=TRUE) para listar participantes.'
        ]);
        exit;
    }

    // Ordenar alfabéticamente por nombre (es-ES, case-insensitive).
    usort($participants, function ($a, $b) {
        return strcoll(
            mb_strtolower($a['name'], 'UTF-8'),
            mb_strtolower($b['name'], 'UTF-8')
        );
    });

    echo json_encode([
        'success' => true,
        'participants' => $participants,
        'total' => count($participants)
    ]);

} catch (Exception $e) {
    $code = ($e->getMessage() === 'Método no permitido. Use POST.') ? 405 : 500;
    if ($code === 500) {
        $code = http_response_code() ?: 500;
    }
    if ($code === 200 || !$code) {
        $code = 500;
    }
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
