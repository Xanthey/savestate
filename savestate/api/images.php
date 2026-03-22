<?php
/**
 * api_images.php — SaveState v2 Ticket Image Attachments
 * Requires active session.
 *
 * GET    ?ticket_id=N         → list images for a ticket
 * GET    ?serve=N             → stream image file (authenticated)
 * POST   (multipart)          → upload image; expects ticket_id field + file field "image"
 * DELETE ?id=N                → delete image record + file
 */

require_once __DIR__ . '/../common.php';

if (empty($_SESSION['user_id'])) {
    jsonOut(['error' => 'Not authenticated'], 401);
}
$userId = (int) $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];

// ── Storage path ─────────────────────────────────────────────────
// Store uploads outside webroot if possible; adjust this path as needed.
// Falls back to a local uploads/ folder beside the app.
define('IMAGE_UPLOAD_DIR', __DIR__ . '/../uploads/ticket_images/');
define('MAX_FILE_BYTES', 8 * 1024 * 1024); // 8 MB
define('ALLOWED_MIME', ['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Ensure the table and upload directory exist
ensureImageTable();
if (!is_dir(IMAGE_UPLOAD_DIR)) {
    mkdir(IMAGE_UPLOAD_DIR, 0755, true);
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Verify ticket belongs to the current user; return ticket row or abort.
 */
function requireTicketOwnership(int $ticketId, int $userId): array
{
    $row = dbOne('SELECT id FROM tickets WHERE id=? AND user_id=?', [$ticketId, $userId]);
    if (!$row) {
        jsonOut(['error' => 'Ticket not found or access denied'], 403);
    }
    return $row;
}

/**
 * Create ticket_images table if it does not already exist.
 */
function ensureImageTable(): void
{
    getPDO()->exec("
        CREATE TABLE IF NOT EXISTS ticket_images (
            id           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
            ticket_id    INT UNSIGNED  NOT NULL,
            user_id      INT UNSIGNED  NOT NULL,
            filename     VARCHAR(255)  NOT NULL,
            orig_name    VARCHAR(255)  NOT NULL,
            mime_type    VARCHAR(64)   NOT NULL,
            file_size    INT UNSIGNED  NOT NULL,
            uploaded_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_ticket (ticket_id),
            INDEX idx_user   (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

// ── GET: serve image ─────────────────────────────────────────────
if ($method === 'GET' && isset($_GET['serve'])) {
    $id = (int) $_GET['serve'];
    $row = dbOne(
        'SELECT * FROM ticket_images WHERE id=? AND user_id=?',
        [$id, $userId]
    );
    if (!$row) {
        http_response_code(404);
        exit('Not found');
    }

    $path = IMAGE_UPLOAD_DIR . $row['filename'];
    if (!file_exists($path)) {
        http_response_code(404);
        exit('File missing');
    }

    // Cache-friendly but session-protected
    header('Content-Type: ' . $row['mime_type']);
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: private, max-age=3600');
    header('Content-Disposition: inline; filename="' . addslashes($row['orig_name']) . '"');
    readfile($path);
    exit;
}

// ── GET: list images for a ticket ────────────────────────────────
if ($method === 'GET' && isset($_GET['ticket_id'])) {
    $ticketId = (int) $_GET['ticket_id'];
    requireTicketOwnership($ticketId, $userId);

    $rows = dbAll(
        'SELECT id, orig_name, mime_type, file_size, uploaded_at
         FROM ticket_images WHERE ticket_id=? AND user_id=? ORDER BY uploaded_at ASC',
        [$ticketId, $userId]
    );

    // Attach a serve URL to each row
    foreach ($rows as &$r) {
        $r['url'] = 'api/images.php?serve=' . $r['id'];
    }
    unset($r);

    jsonOut($rows);
}

// ── POST: upload image ────────────────────────────────────────────
if ($method === 'POST') {
    $ticketId = (int) ($_POST['ticket_id'] ?? 0);
    if (!$ticketId) {
        jsonOut(['error' => 'Missing ticket_id'], 400);
    }
    requireTicketOwnership($ticketId, $userId);

    if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        $errCode = $_FILES['image']['error'] ?? -1;
        $errMsg = match ($errCode) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'File too large.',
            UPLOAD_ERR_NO_FILE => 'No file received.',
            default => 'Upload error (code ' . $errCode . ').',
        };
        jsonOut(['error' => $errMsg], 400);
    }

    $file = $_FILES['image'];
    $origName = basename($file['name']);
    $tmpPath = $file['tmp_name'];
    $fileSize = (int) $file['size'];

    // Size check
    if ($fileSize > MAX_FILE_BYTES) {
        jsonOut(['error' => 'File exceeds 8 MB limit.'], 400);
    }

    // MIME check — use finfo for reliability, not the browser-supplied type
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($tmpPath);
    if (!in_array($mimeType, ALLOWED_MIME, true)) {
        jsonOut(['error' => 'Only JPEG, PNG, GIF, and WebP images are allowed.'], 415);
    }

    // Generate safe stored filename: {uuid}.{ext}
    $extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
    $ext = $extMap[$mimeType];
    $stored = bin2hex(random_bytes(16)) . '.' . $ext;
    $destPath = IMAGE_UPLOAD_DIR . $stored;

    if (!move_uploaded_file($tmpPath, $destPath)) {
        jsonOut(['error' => 'Failed to save file on server.'], 500);
    }

    dbExec(
        'INSERT INTO ticket_images (ticket_id, user_id, filename, orig_name, mime_type, file_size)
         VALUES (?,?,?,?,?,?)',
        [$ticketId, $userId, $stored, $origName, $mimeType, $fileSize]
    );
    $newId = (int) dbLastId();

    jsonOut([
        'status' => 'ok',
        'id' => $newId,
        'url' => 'api/images.php?serve=' . $newId,
        'orig_name' => $origName,
        'mime_type' => $mimeType,
        'file_size' => $fileSize,
        'uploaded_at' => date('Y-m-d H:i:s'),
    ]);
}

// ── DELETE: remove image ──────────────────────────────────────────
if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) {
        jsonOut(['error' => 'Missing id'], 400);
    }

    $row = dbOne(
        'SELECT * FROM ticket_images WHERE id=? AND user_id=?',
        [$id, $userId]
    );
    if (!$row) {
        jsonOut(['error' => 'Not found'], 404);
    }

    // Delete physical file
    $path = IMAGE_UPLOAD_DIR . $row['filename'];
    if (file_exists($path)) {
        @unlink($path);
    }

    dbExec('DELETE FROM ticket_images WHERE id=? AND user_id=?', [$id, $userId]);
    jsonOut(['status' => 'ok']);
}

jsonOut(['error' => 'Method not allowed'], 405);