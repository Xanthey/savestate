<?php
/**
 * api/issues.php — SaveState v2 Known Issues CRUD
 *
 * GET    ?id=N        → single issue
 * GET    (no id)      → list all active issues for user + global
 * POST   (JSON)       → create issue
 * PUT    ?id=N (JSON) → update issue
 * DELETE ?id=N        → soft-delete (active=0)
 */

require_once __DIR__ . '/../common.php';

if (empty($_SESSION['user_id'])) {
    jsonOut(['error' => 'Not authenticated'], 401);
}

$userId = (int)$_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];

const ISSUE_FIELDS = ['tag','title','description','keywords','active'];

function sanitizeIssue(array $data): array {
    $out = [];
    foreach (ISSUE_FIELDS as $f) {
        if (array_key_exists($f, $data)) {
            $out[$f] = ($f === 'active') ? (int)(bool)$data[$f] : trim((string)$data[$f]);
        }
    }
    return $out;
}

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $row = dbOne(
            'SELECT * FROM known_issues WHERE id=? AND (user_id=? OR user_id=0)',
            [(int)$_GET['id'], $userId]
        );
        if (!$row) jsonOut(['error'=>'Not found'], 404);
        jsonOut($row);
    }
    $rows = dbAll(
        'SELECT * FROM known_issues WHERE active=1 AND (user_id=? OR user_id=0) ORDER BY updated_at DESC',
        [$userId]
    );
    jsonOut($rows);
}

if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $t = sanitizeIssue($data);
    if (empty($t['title'])) jsonOut(['error'=>'Title required'], 400);
    $t['user_id'] = $userId;
    $cols = implode(',', array_keys($t));
    $ph   = implode(',', array_fill(0, count($t), '?'));
    dbExec("INSERT INTO known_issues ($cols) VALUES ($ph)", array_values($t));
    jsonOut(['status'=>'ok','id'=>(int)dbLastId()]);
}

if ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) jsonOut(['error'=>'Missing id'], 400);
    $existing = dbOne('SELECT id FROM known_issues WHERE id=? AND user_id=?', [$id, $userId]);
    if (!$existing) jsonOut(['error'=>'Not found'], 404);
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $t = sanitizeIssue($data);
    if (empty($t)) jsonOut(['error'=>'No data'], 400);
    $set = implode('=?,', array_keys($t)) . '=?';
    dbExec("UPDATE known_issues SET $set WHERE id=?", [...array_values($t), $id]);
    jsonOut(['status'=>'ok']);
}

if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) jsonOut(['error'=>'Missing id'], 400);
    dbExec('UPDATE known_issues SET active=0 WHERE id=? AND user_id=?', [$id, $userId]);
    jsonOut(['status'=>'ok']);
}

jsonOut(['error'=>'Method not allowed'], 405);
