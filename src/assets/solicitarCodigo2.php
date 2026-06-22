<?php
require_once "datos_conexion.php";
$datos  = json_decode(file_get_contents("php://input"));
$mysqli = new mysqli($host, $user, $pass, $database);

// ─── Validaciones de entrada ──────────────────────────────────────────────────
if (!isset($datos->docente) || empty($datos->docente)) {
    echo json_encode(["msg" => "Error: No se proporcionó el documento del docente"]);
    exit(0);
}

// ─── Consulta docente ─────────────────────────────────────────────────────────
$doc    = $mysqli->real_escape_string($datos->docente);
$sql    = "SELECT correo, nombres FROM docentes WHERE activo='S' AND identificacion='$doc'";
$result = $mysqli->query($sql);

if (!$result) {
    echo json_encode(["msg" => "Error en la consulta: " . $mysqli->error]);
    $mysqli->close();
    exit(0);
}
if ($result->num_rows == 0) {
    echo json_encode(["msg" => "No existe un docente activo con identificación $doc"]);
    $mysqli->close();
    exit(0);
}

$dato         = $result->fetch_assoc();
$destinatario = trim($dato['correo']);
$nombres      = $dato['nombres'];

if (empty($destinatario)) {
    echo json_encode(["msg" => "No existe un correo válido para el docente $doc"]);
    $mysqli->close();
    exit(0);
}
if (!filter_var($destinatario, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(["msg" => "El correo '$destinatario' tiene un formato inválido"]);
    $mysqli->close();
    exit(0);
}

// ─── Generar y guardar código temporal ───────────────────────────────────────
$random_number = rand(1000000, 9999999);
$sql_update    = "UPDATE docentes SET codigoTemporal='$random_number' WHERE identificacion='$doc'";
if (!$mysqli->query($sql_update)) {
    echo json_encode(["msg" => "Error al guardar el código: " . $mysqli->error]);
    $mysqli->close();
    exit(0);
}

// ─── Correo oculto para la respuesta ─────────────────────────────────────────
$posicion_arroba = strpos($destinatario, '@');
$correo_oculto   = substr($destinatario, 0, 1)
                 . str_repeat('*', $posicion_arroba - 1)
                 . substr($destinatario, $posicion_arroba);

// ─── PHPMailer ────────────────────────────────────────────────────────────────
require "phpmailer/src/PHPMailer.php";
require "phpmailer/src/SMTP.php";
require "phpmailer/src/Exception.php";

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$mail = new PHPMailer(true);

// ══════════════════════════════════════════════════════════════════════════════
//  🔧 CONFIGURACIÓN GMAIL SMTP
// ══════════════════════════════════════════════════════════════════════════════
$GMAIL_USER = "ingeleandro@gmail.com";
$GMAIL_PASS = "zqqqtaoakbavgkou";   // contraseña de aplicación (sin espacios)

try {
    $mail->isSMTP();
    $mail->SMTPDebug   = 0;          // 0=producción | 2=debug
    $mail->Debugoutput = 'echo';

    // ── Servidor Gmail ────────────────────────────────────────────────────────
    $mail->Host        = "smtp.gmail.com";
    $mail->Port        = 465;
    $mail->SMTPSecure  = 'ssl';
    $mail->SMTPAuth    = true;
    $mail->SMTPAutoTLS = false;
    $mail->Timeout     = 30;
    $mail->ConnectTimeout = 30;

    // ── Credenciales ──────────────────────────────────────────────────────────
    $mail->Username = $GMAIL_USER;
    $mail->Password = $GMAIL_PASS;

    // ── Remitente y destinatarios ─────────────────────────────────────────────
    $mail->setFrom($GMAIL_USER, "Institución Educativa de Occidente");
    $mail->addReplyTo($GMAIL_USER, $SMTP_FROM_NAME);
    $mail->addAddress($destinatario, $nombres);
    $mail->addCC($GMAIL_USER); // copia al remitente como respaldo

    // ── Contenido ─────────────────────────────────────────────────────────────
    $mail->isHTML(true);
    $mail->CharSet = 'UTF-8';
    $mail->Subject = "Tu código de acceso - Institución Educativa de Occidente";
    

    $imagen_cid = '';
    if (file_exists('esc.png')) {
        $mail->AddEmbeddedImage('esc.png', 'myimage', 'Escudo');
        $imagen_cid = "<img src='cid:myimage' alt='escudo' style='max-width:200px;'>";
    }

    $mail->Body = "
    <!DOCTYPE html>
    <html lang='es'>
    <head>
        <meta charset='UTF-8'>
        <meta name='viewport' content='width=device-width, initial-scale=1.0'>
        <style>
            body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#333;background:#f5f5f5;margin:0;padding:0}
            .container{max-width:600px;margin:20px auto;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);overflow:hidden}
            .header{background:linear-gradient(135deg,#1e3c72 0%,#2a5298 100%);color:#fff;padding:30px;text-align:center}
            .logo{font-size:24px;font-weight:700;margin-bottom:15px;letter-spacing:1px}
            .header img{max-width:150px;margin:15px 0}
            .content{padding:30px}
            .greeting{font-size:18px;margin-bottom:20px;color:#2a5298;font-weight:600}
            .code-section{background:linear-gradient(135deg,#f5f7fa 0%,#c3cfe2 100%);border-left:4px solid #2a5298;padding:20px;margin:25px 0;border-radius:5px}
            .code-label{font-size:12px;text-transform:uppercase;color:#666;letter-spacing:1px;margin-bottom:10px;font-weight:600}
            .code-box{background:#fff;border:2px solid #2a5298;border-radius:5px;padding:20px;text-align:center;margin:15px 0}
            .code-number{font-size:48px;font-weight:700;color:#2a5298;letter-spacing:2px;font-family:'Courier New',monospace}
            .warning{background:#fff3cd;border-left:4px solid #ff9800;padding:15px;margin:20px 0;border-radius:5px;color:#856404;font-size:14px}
            .info-box{background:#e3f2fd;border-left:4px solid #2196f3;padding:15px;margin:20px 0;border-radius:5px;color:#1565c0;font-size:14px}
            .student-info{background:#f3e5f5;border-left:4px solid #9c27b0;padding:15px;margin:20px 0;border-radius:5px;font-size:14px}
            .student-name{color:#6a1b9a;font-weight:600;font-size:16px}
            .footer{background:#f5f5f5;padding:25px 30px;font-size:12px;color:#666;border-top:1px solid #ddd}
            .footer h4{margin:10px 0 5px;color:#2a5298;font-size:14px}
            .footer p{margin:5px 0;line-height:1.5}
            .contact-link{color:#2a5298;text-decoration:none;font-weight:600}
            .divider{border-top:1px solid #ddd;margin:15px 0}
        </style>
    </head>
    <body>
        <div class='container'>
            <div class='header'>
                <div class='logo'>🎓 IEDEOCCIDENTE</div>
                $imagen_cid
                <p style='margin:10px 0 0;font-size:14px;'>Institución Educativa de Occidente</p>
            </div>
            <div class='content'>
                <p class='greeting'>¡Hola, <span class='student-name'>$nombres</span>!</p>
                <div class='student-info'>
                    <p><strong>Identificación:</strong> $doc</p>
                    <p><strong>Correo:</strong> $destinatario</p>
                </div>
                <p>A continuación se encuentra su <strong>código de acceso</strong> para ingresar a la plataforma <strong>app.iedeoccidente.com</strong>:</p>
                <div class='code-section'>
                    <div class='code-label'>Código de Ingreso</div>
                    <div class='code-box'>
                        <div class='code-number'>$random_number</div>
                    </div>
                    <p style='text-align:center;color:#666;font-size:12px;margin:10px 0 0;'>⏱️ Este código solo es válido para este acceso</p>
                </div>
                <div class='warning'>
                    <strong>⚠️ Importante:</strong><br/>
                    Este código es <strong>de un solo uso</strong>. Una vez que lo utilice para ingresar, será eliminado del sistema.
                </div>
                <div class='warning'>
                    <strong>💡 Recordatorio:</strong><br/>
                    Si desea volver a acceder posteriormente, deberá solicitar un nuevo código.
                </div>
                <div class='info-box'>
                    <strong>🔧 Si tiene problemas para ingresar:</strong><br/>
                    <ul style='margin:10px 0;padding-left:20px;'>
                        <li>Borre todos los correos con códigos anteriores</li>
                        <li>Espere 2 minutos</li>
                        <li>Solicite un nuevo envío de código</li>
                        <li>Use el código más reciente</li>
                    </ul>
                </div>
            </div>
            <div class='footer'>
                <h4>📍 Institución Educativa de Occidente</h4>
                <p>NIT: 890802641-2 &nbsp;|&nbsp; DANE: 117042000561</p>
                <div class='divider'></div>
                <p><strong>Dirección:</strong><br/>Carrera 5 # 11-19, Anserma, Caldas 177080, Colombia</p>
                <div class='divider'></div>
                <p><strong>Contacto:</strong><br/>
                📞 314 6610344<br/>
                📧 <a href='mailto:iedeoccidente@sedcaldas.gov.co' class='contact-link'>iedeoccidente@sedcaldas.gov.co</a></p>
                <div class='divider'></div>
                <p style='text-align:center;font-size:11px;color:#999;margin-top:15px;'>Este correo fue enviado de forma automática. Por favor, no responda.</p>
            </div>
        </div>
    </body>
    </html>";

    $mail->AltBody = "Su código de acceso es: $random_number";

    $mail->send();

    echo json_encode([
        "success" => true,
        "msg"     => "El código ha sido enviado correctamente a $correo_oculto"
    ]);

} catch (Exception $e) {
    echo json_encode([
        "success"   => false,
        "msg"       => "Error al enviar el correo: " . $e->getMessage(),
        "errorInfo" => $mail->ErrorInfo
    ]);
}

$mysqli->close();
?>