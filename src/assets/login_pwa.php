<?php
/**
 * login_pwa.php - Autenticación de participantes PWA contra la hoja `participantes`
 *
 * Destino en producción: https://app.iedeoccidente.com/gs/login_pwa.php
 *
 * Lee la hoja "participantes" (mismo spreadsheet ID) y valida que la fila
 * cuya columna B (phone) — limpiada a sólo dígitos — termine en los mismos
 * 10 dígitos del username enviado, y cuya columna C (password) — también
 * limpiada — termine en los mismos 4 dígitos de la contraseña enviada.
 *
 * Esquema de la hoja "participantes" (5 columnas A:E):
 *   A: participant (nombre a mostrar)
 *   B: phone (celular completo, puede incluir prefijo país y separadores:
 *      "+57 321 8552353", "0057 1 321 855 2353", "3218552353", etc.)
 *   C: password (contraseña; se toman los últimos 4 dígitos)
 *   D: passwordChanged ("TRUE"/"FALSE"): TRUE significa que el usuario YA
 *      cambió su contraseña; FALSE (o vacío) significa que aún no la cambió
 *      y el frontend debe obligarlo a hacerlo antes de poder apostar.
 *   E: email (opcional, para notificaciones; lo escribe save_pwa_email.php).
 *      Si está vacío, el frontend debe forzar al usuario a registrar uno.
 *
 * El username que el usuario digita en la PWA son los últimos 10 dígitos
 * del celular (sin prefijo país). La contraseña son los últimos 4 dígitos
 * del valor de la columna C.
 *
 * Petición (POST, JSON):
 *   { "spreadsheetId": "...", "username": "3218552353", "password": "2353", "dev": false }
 *
 * El flag `dev: true` salta la validación de formato de las credenciales
 * (10/4 dígitos) pero sigue haciendo el lookup real a la hoja
 * `participantes` para que el participant sea el nombre real del usuario.
 * El backend no debe aceptar `dev: true` si el request viene de otro origen
 * — en esta versión confiamos en que el frontend sólo lo envía cuando
 * hostname es localhost.
 *
 * Respuestas:
 *   200 { success: true, participant, phone, username, mustChangePassword, mustProvideEmail }
 *   401 { success: false, error: "Credenciales inválidas" }
 *   400 { success: false, error: "Faltan campos" }
 */

require __DIR__ . '/vendor/autoload.php';

use Google\Client;
use Google\Service\Sheets;

const SERVICE_ACCOUNT_KEY_FILE = __DIR__ . '/assets/serviceaccount.json';
const WORKSHEET = 'participantes';

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
    $dev = $data['dev'] === true;

    if (!$dev) {
        if (!preg_match('/^\d{10}$/', $username)) {
            throw new Exception('El usuario debe tener exactamente 10 dígitos.');
        }
        if (!preg_match('/^\d{4}$/', $password)) {
            throw new Exception('La contraseña debe tener exactamente 4 dígitos.');
        }
    }

    // Sanitizar input: quedarse con los últimos 10/4 dígitos (en dev puede
    // venir con espacios, guiones, prefijos).
    $usernameClean = preg_replace('/\D+/', '', $username);
    $usernameLast10 = strlen($usernameClean) >= 10
        ? substr($usernameClean, -10)
        : $usernameClean;
    $passwordClean = preg_replace('/\D+/', '', $password);
    $passwordLast4 = strlen($passwordClean) >= 4
        ? substr($passwordClean, -4)
        : $passwordClean;

    $client = new Client();
    $client->setApplicationName('Polla Mundialista PWA Auth');
    $client->setScopes([Sheets::SPREADSHEETS]);
    if (!file_exists(SERVICE_ACCOUNT_KEY_FILE)) {
        throw new Exception('Archivo de credenciales no encontrado.');
    }
    $client->setAuthConfig(SERVICE_ACCOUNT_KEY_FILE);
    $service = new Sheets($client);

    $range = WORKSHEET . '!A2:E1000';
    $response = $service->spreadsheets_values->get($spreadsheetId, $range);
    $rows = $response->getValues() ?: [];

    foreach ($rows as $row) {
        // Columna B puede venir con prefijo país, espacios u otros separadores
        // (ej. "+57 321 8552353", "0057 1 321 855 2353"). Limpiamos a sólo
        // dígitos y comparamos los últimos 10 contra el username ingresado.
        $rowPhoneRaw = trim((string)($row[1] ?? ''));
        $rowPhoneClean = preg_replace('/\D+/', '', $rowPhoneRaw);
        $rowPhoneLast10 = strlen($rowPhoneClean) >= 10
            ? substr($rowPhoneClean, -10)
            : '';

        // Columna C puede tener la contraseña completa o sólo los últimos 4
        // dígitos. Limpiamos y comparamos los últimos 4.
        $rowPasswordRaw = trim((string)($row[2] ?? ''));
        $rowPasswordClean = preg_replace('/\D+/', '', $rowPasswordRaw);
        $rowPasswordLast4 = strlen($rowPasswordClean) >= 4
            ? substr($rowPasswordClean, -4)
            : '';

        if ($rowPhoneLast10 !== '' && $rowPhoneLast10 === $usernameLast10
            && $rowPasswordLast4 !== '' && $rowPasswordLast4 === $passwordLast4) {
            // Columna D: TRUE/FALSE. Si está vacía o es FALSE (case-insensitive),
            // el frontend obliga a cambiar la contraseña.
            // Columna D: TRUE significa "el usuario YA cambió su contraseña".
            // Si está vacía o en FALSE, el frontend debe obligarlo a cambiarla.
            $rowMustChangeRaw = strtolower(trim((string)($row[3] ?? '')));
            $alreadyChanged = in_array($rowMustChangeRaw, ['true', '1', 'yes', 'si'], true);
            $mustChangePassword = !$alreadyChanged;

            // Columna E: email. Si está vacía, el frontend debe obligar al
            // usuario a registrar uno (independiente de D).
            $rowEmail = trim((string)($row[4] ?? ''));
            $mustProvideEmail = $rowEmail === '';

            echo json_encode([
                'success' => true,
                'participant' => trim((string)($row[0] ?? '')),
                'phone' => $rowPhoneLast10,
                'username' => $rowPhoneLast10,
                'mustChangePassword' => $mustChangePassword,
                'mustProvideEmail' => $mustProvideEmail
            ]);
            exit;
        }
    }

    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Credenciales inválidas. Verifica tu número y los últimos 4 dígitos.'
    ]);

} catch (Exception $e) {
    $code = ($e->getMessage() === 'Método no permitido. Use POST.') ? 405 : 500;
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
