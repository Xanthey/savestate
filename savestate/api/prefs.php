<?php
/**
 * api/prefs.php — SaveState v2 User Preferences
 * POST { key, value } → save pref
 * GET  ?key=KEY       → get pref
 */
require_once __DIR__ . '/../common.php';
if (empty($_SESSION['user_id']))
    jsonOut(['error' => 'Not authenticated'], 401);
$userId = (int) $_SESSION['user_id'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $key = trim($data['key'] ?? '');
    $value = trim($data['value'] ?? '');
    if (!$key)
        jsonOut(['error' => 'key required'], 400);
    // Allowlist of settable prefs
    $allowed = ['theme', 'mode', 'per_page', 'vault_sort', 'clock_timezones', 'clock_timeformat'];
    if (!in_array($key, $allowed))
        jsonOut(['error' => 'Unknown pref key'], 400);
    setUserPref($userId, $key, $value);
    jsonOut(['status' => 'ok']);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $key = trim($_GET['key'] ?? '');
    if (!$key) {
        // Return all prefs
        $rows = dbAll('SELECT pref_key, pref_val FROM user_prefs WHERE user_id=?', [$userId]);
        $out = [];
        foreach ($rows as $r)
            $out[$r['pref_key']] = $r['pref_val'];
        jsonOut($out);
    }
    $val = getUserPref($userId, $key);
    jsonOut(['key' => $key, 'value' => $val]);
}

jsonOut(['error' => 'Method not allowed'], 405);