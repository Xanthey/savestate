<?php
/**
 * api/vault.php — SaveState v2 Vault API
 *
 * GET ?q=QUERY&page=1&per=50&sort=date_desc&from=YYYY-MM-DD&to=YYYY-MM-DD
 *     &solved=0|1&method=Email|Chat|Voice&reason=...
 *
 * GET ?stats=1   → aggregate stats for the vault dashboard
 * GET ?id=N      → full single ticket (including complete notes)
 */

require_once __DIR__ . '/../common.php';

if (empty($_SESSION['user_id'])) {
    jsonOut(['error' => 'Not authenticated'], 401);
}

$userId = (int) $_SESSION['user_id'];

// ── Single ticket (full detail) ──────────────────────────────
if (isset($_GET['id'])) {
    $row = dbOne('SELECT * FROM tickets WHERE id=? AND user_id=?', [(int) $_GET['id'], $userId]);
    if (!$row)
        jsonOut(['error' => 'Not found'], 404);
    $row['solved'] = (bool) $row['solved'];
    $row['escalated'] = (bool) $row['escalated'];
    $row['has_account'] = (bool) $row['has_account'];
    $row['obtained_info'] = (bool) $row['obtained_info'];
    try {
        $imgRow = dbOne('SELECT COUNT(*) AS cnt FROM ticket_images WHERE ticket_id=? AND user_id=?', [(int) $_GET['id'], $userId]);
        $row['image_count'] = (int) ($imgRow['cnt'] ?? 0);
    } catch (\Throwable $e) {
        $row['image_count'] = 0;
    }
    jsonOut($row);
}

// ── Stats ─────────────────────────────────────────────────────
if (!empty($_GET['stats'])) {
    $stats = [];

    $stats['total'] = (int) (dbOne(
        'SELECT COUNT(*) AS c FROM tickets WHERE user_id=?',
        [$userId]
    )['c'] ?? 0);

    $stats['solved'] = (int) (dbOne(
        'SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND solved=1',
        [$userId]
    )['c'] ?? 0);

    $stats['escalated'] = (int) (dbOne(
        'SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND escalated=1',
        [$userId]
    )['c'] ?? 0);

    $stats['today'] = (int) (dbOne(
        'SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND session_date=CURDATE()',
        [$userId]
    )['c'] ?? 0);

    $stats['this_week'] = (int) (dbOne(
        'SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND session_date >= DATE_SUB(CURDATE(),INTERVAL 7 DAY)',
        [$userId]
    )['c'] ?? 0);

    // By reason
    $stats['by_reason'] = dbAll(
        'SELECT reason_for_contact AS label, COUNT(*) AS count
         FROM tickets WHERE user_id=? GROUP BY reason_for_contact ORDER BY count DESC LIMIT 10',
        [$userId]
    );

    // By device
    $stats['by_device'] = dbAll(
        'SELECT type_of_device AS label, COUNT(*) AS count
         FROM tickets WHERE user_id=? GROUP BY type_of_device ORDER BY count DESC LIMIT 8',
        [$userId]
    );

    // By contact method
    $stats['by_method'] = dbAll(
        'SELECT contact_method AS label, COUNT(*) AS count
         FROM tickets WHERE user_id=? GROUP BY contact_method ORDER BY count DESC',
        [$userId]
    );

    // Daily totals for the last 30 days
    $stats['daily'] = dbAll(
        'SELECT session_date AS date, COUNT(*) AS count, SUM(solved) AS solved
         FROM tickets WHERE user_id=? AND session_date >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)
         GROUP BY session_date ORDER BY session_date ASC',
        [$userId]
    );

    jsonOut($stats);
}

// ── Search / List ─────────────────────────────────────────────
$q = trim($_GET['q'] ?? '');
$page = max(1, (int) ($_GET['page'] ?? 1));
$per = min(200, max(10, (int) ($_GET['per'] ?? 50)));
$offset = ($page - 1) * $per;

// Sort
$sortMap = [
    'date_desc' => 't.session_date DESC, t.exported_at DESC',
    'date_asc' => 't.session_date ASC,  t.exported_at ASC',
    'ticket_asc' => 't.ticket_number ASC',
    'ticket_desc' => 't.ticket_number DESC',
    'solved' => 't.solved DESC, t.session_date DESC',
];
$sort = $sortMap[$_GET['sort'] ?? 'date_desc'] ?? $sortMap['date_desc'];

// Build WHERE conditions
$where = ['t.user_id = ?'];
$params = [$userId];

if ($q !== '') {
    // Try FULLTEXT
    $where[] = 'MATCH(t.notes, t.ticket_number, t.reason_for_contact, t.location) AGAINST(? IN BOOLEAN MODE)';
    $params[] = $q . '*'; // prefix match
}
if (isset($_GET['solved']) && $_GET['solved'] !== '') {
    $where[] = 't.solved = ?';
    $params[] = (int) (bool) $_GET['solved'];
}
if (!empty($_GET['method'])) {
    $where[] = 't.contact_method = ?';
    $params[] = $_GET['method'];
}
if (!empty($_GET['reason'])) {
    $where[] = 't.reason_for_contact = ?';
    $params[] = $_GET['reason'];
}
if (!empty($_GET['from'])) {
    $where[] = 't.session_date >= ?';
    $params[] = $_GET['from'];
}
if (!empty($_GET['to'])) {
    $where[] = 't.session_date <= ?';
    $params[] = $_GET['to'];
}

$whereSQL = implode(' AND ', $where);

// Count total
$countParams = $params;
try {
    $total = (int) (dbOne(
        "SELECT COUNT(*) AS c FROM tickets t WHERE $whereSQL",
        $countParams
    )['c'] ?? 0);
} catch (\Throwable $e) {
    // FULLTEXT failed — fall back to LIKE
    if ($q !== '') {
        // Remove FULLTEXT condition, replace with LIKE
        $where = array_filter($where, fn($w) => !str_contains($w, 'MATCH'));
        $params = array_filter($params, fn($p) => $p !== $q . '*');
        $params = array_values($params);
        $like = '%' . $q . '%';
        $where[] = '(t.notes LIKE ? OR t.ticket_number LIKE ? OR t.reason_for_contact LIKE ?)';
        $params = array_merge($params, [$like, $like, $like]);
        $whereSQL = implode(' AND ', $where);
        $countParams = $params;
    }
    $total = (int) (dbOne(
        "SELECT COUNT(*) AS c FROM tickets t WHERE $whereSQL",
        $countParams
    )['c'] ?? 0);
}

// Fetch page
$rows = [];
try {
    $rows = dbAll(
        "SELECT t.id, t.ticket_number, t.reason_for_contact, t.type_of_device,
                t.browser, t.location, t.obtained_info, t.has_account,
                t.escalated, t.contact_method, t.plan_type, t.solved,
                LEFT(t.notes,200) AS notes_preview, t.session_date, t.exported_at,
                COALESCE((SELECT COUNT(*) FROM ticket_images ti WHERE ti.ticket_id=t.id AND ti.user_id=t.user_id),0) AS image_count
         FROM tickets t
         WHERE $whereSQL
         ORDER BY $sort
         LIMIT ? OFFSET ?",
        array_merge($params, [$per, $offset])
    );
} catch (\Throwable $e) {
    jsonOut(['error' => $e->getMessage(), 'rows' => [], 'total' => 0, 'page' => $page, 'pages' => 0], 500);
}

foreach ($rows as &$r) {
    $r['solved'] = (bool) $r['solved'];
    $r['escalated'] = (bool) $r['escalated'];
    $r['has_account'] = (bool) $r['has_account'];
    $r['obtained_info'] = (bool) $r['obtained_info'];
    // Append ellipsis if notes were truncated
    // (we can't easily know without fetching full — use a workaround)
    if (isset($r['notes_preview']) && strlen($r['notes_preview']) === 200) {
        $r['notes_preview'] .= '…';
    }
    // Strip any HTML tags so previews are always plain text
    $r['notes_preview'] = strip_tags($r['notes_preview'] ?? '');
}
unset($r);

jsonOut([
    'rows' => $rows,
    'total' => $total,
    'page' => $page,
    'per' => $per,
    'pages' => max(1, (int) ceil($total / $per)),
]);