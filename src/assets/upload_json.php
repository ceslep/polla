<?php
/**
 * upload_json.php - Guarda archivos JSON subidos por el frontend
 *
 * Destino: https://app.iedeoccidente.com/polla/upload_json.php
 *
 * Petición (POST, multipart/form-data):
 *   - file: archivo JSON
 *   - token: token de autenticación (password admin o session)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

const ADMIN_PASSWORD = 'polla2026';
const UPLOAD_DIR = __DIR__ . '/uploads/';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function error($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit();
}

try {
    // Validar método
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        error('Método no permitido. Use POST.');
    }

    // Validar token
    $token = $_POST['token'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $token = str_replace('Bearer ', '', $token);
    if ($token !== ADMIN_PASSWORD) {
        error('Acceso denegado.', 401);
    }

    // Validar archivo
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $errorMap = [
            UPLOAD_ERR_INI_SIZE => 'Archivo demasiado grande (max 10MB)',
            UPLOAD_ERR_FORM_SIZE => 'Archivo demasiado grande',
            UPLOAD_ERR_PARTIAL => 'Archivo subido parcialmente',
            UPLOAD_ERR_NO_FILE => 'No se envió ningún archivo',
        ];
        $errCode = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
        error($errorMap[$errCode] ?? 'Error al subir archivo', 400);
    }

    $file = $_FILES['file'];

    // Validar tipo
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    // Validar extensión y mime type
    $originalName = $file['name'];
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

    if ($ext !== 'json') {
        error('Solo se permiten archivos .json');
    }

    // Validar contenido JSON (parsear para verificar que es JSON válido)
    $content = file_get_contents($file['tmp_name']);
    json_decode($content);
    if (json_last_error() !== JSON_ERROR_NONE) {
        error('El archivo no es un JSON válido: ' . json_last_error_msg());
    }

    // Crear directorio de uploads si no existe
    if (!is_dir(UPLOAD_DIR)) {
        if (!mkdir(UPLOAD_DIR, 0755, true)) {
            error('Error al crear directorio de uploads', 500);
        }
    }

    // Generar nombre único con timestamp
    $timestamp = date('Y-m-d_H-i-s');
    $safeName = preg_replace('/[^a-zA-Z0-9_\-]/', '_', pathinfo($originalName, PATHINFO_FILENAME));
    $newFileName = sprintf('%s_%s_%d.json', $safeName, $timestamp, random_int(1000, 9999));
    $uploadPath = UPLOAD_DIR . $newFileName;

    // Mover archivo
    if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
        error('Error al mover archivo subido', 500);
    }

    // Construir URL pública (ajusta según tu configuración)
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
    $host = $_SERVER['HTTP_HOST'] ?? 'app.iedeoccidente.com';
    $baseDir = dirname($_SERVER['SCRIPT_NAME']);
    $fileUrl = $protocol . $host . $baseDir . '/uploads/' . $newFileName;

    echo json_encode([
        'success' => true,
        'message' => 'Archivo subido exitosamente',
        'filename' => $newFileName,
        'url' => $fileUrl,
        'size' => filesize($uploadPath)
    ]);

} catch (Exception $e) {
    error('Error interno: ' . $e->getMessage(), 500);
}
?>
