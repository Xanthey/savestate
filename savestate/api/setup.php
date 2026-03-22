<?php
/**
 * api_setup.php — SaveState v2 First-Run Setup API
 * POST { network_mode: "local"|"public" }
 * Saves network_mode and oobe_complete to system_settings.
 * Only usable before OOBE is complete; locked out afterwards.
 */
session_start();
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../common.php';

header('Content-Type: application/json');

// Ensure the system tables exist before we try to read/write them
ensureSystemTables();

// If OOBE already done, refuse
if (getSystemSetting('oobe_complete') === '1') {
    http_response_code(403);
    echo json_encode(['error' => 'Setup already complete']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$mode = trim($data['network_mode'] ?? '');

if (!in_array($mode, ['local', 'public'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid network_mode. Must be "local" or "public".']);
    exit;
}

try {
    // If public mode, ensure users table has password_hash column
    if ($mode === 'public') {
        ensurePasswordColumn();
    }

    setSystemSetting('network_mode', $mode);
    setSystemSetting('oobe_complete', '1');

    echo json_encode(['status' => 'ok', 'network_mode' => $mode]);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
exit;
