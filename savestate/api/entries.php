<?php
/**
 * api/entries.php — SaveState v2 Ticket CRUD API
 * Requires active session.
 *
 * GET    ?date=YYYY-MM-DD         → list tickets for date (default: today)
 * GET    ?id=N                    → single ticket
 * POST   (JSON body)              → create ticket
 * PUT    ?id=N (JSON body)        → update ticket
 * DELETE ?id=N                    → delete ticket
 */

require_once __DIR__ . '/../common.php';

// Must be logged in (API call — return JSON error if not)
if (empty($_SESSION['user_id'])) {
    jsonOut(['error' => 'Not authenticated'], 401);
}
$userId = (int) $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];

// ── Allowed ticket fields ────────────────────────────────────────
const TICKET_FIELDS = [
    'ticket_number',
    'reason_for_contact',
    'type_of_device',
    'browser',
    'location',
    'obtained_info',
    'has_account',
    'escalated',
    'contact_method',
    'plan_type',
    'solved',
    'notes',
];

function sanitizeTicket(array $data): array
{
    $out = [];
    foreach (TICKET_FIELDS as $f) {
        if (array_key_exists($f, $data)) {
            if (in_array($f, ['obtained_info', 'has_account', 'escalated', 'solved'])) {
                $out[$f] = (int) (bool) $data[$f];
            } else {
                $out[$f] = trim((string) $data[$f]);
            }
        }
    }
    return $out;
}

// ── GET ──────────────────────────────────────────────────────────
if ($method === 'GET') {
    // Single ticket by ID
    if (isset($_GET['id'])) {
        $id = (int) $_GET['id'];
        $row = dbOne('SELECT * FROM tickets WHERE id=? AND user_id=?', [$id, $userId]);
        if (!$row)
            jsonOut(['error' => 'Not found'], 404);
        try {
            $imgRow = dbOne('SELECT COUNT(*) AS cnt FROM ticket_images WHERE ticket_id=? AND user_id=?', [$id, $userId]);
            $row['image_count'] = (int) ($imgRow['cnt'] ?? 0);
        } catch (\Throwable $e) {
            $row['image_count'] = 0;
        }
        jsonOut($row);
    }

    // Lookup by ticket_number — returns most recent match
    if (isset($_GET['ticket_number'])) {
        $tn = trim($_GET['ticket_number']);
        if ($tn === '')
            jsonOut(['match' => false]);
        $row = dbOne(
            'SELECT * FROM tickets WHERE user_id=? AND ticket_number=? ORDER BY exported_at DESC LIMIT 1',
            [$userId, $tn]
        );
        if (!$row)
            jsonOut(['match' => false]);
        // Cast booleans
        foreach (['solved', 'escalated', 'has_account', 'obtained_info'] as $f)
            $row[$f] = (bool) $row[$f];
        jsonOut(['match' => true, 'ticket' => $row]);
    }

    // By date
    $date = $_GET['date'] ?? date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        jsonOut(['error' => 'Invalid date'], 400);
    }
    $rows = dbAll(
        'SELECT t.*,
                COALESCE((SELECT COUNT(*) FROM ticket_images ti WHERE ti.ticket_id=t.id AND ti.user_id=t.user_id),0) AS image_count
         FROM tickets t
         WHERE t.user_id=? AND t.session_date=?
         ORDER BY t.exported_at DESC',
        [$userId, $date]
    );
    jsonOut($rows);
}

// ── POST ─────────────────────────────────────────────────────────
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?? [];

    // Batch import
    if (isset($data['entries']) && is_array($data['entries'])) {
        $inserted = 0;
        $pdo = getPDO();
        $pdo->beginTransaction();
        try {
            foreach ($data['entries'] as $entry) {
                $t = sanitizeTicket($entry);
                $date = isset($entry['exported_at'])
                    ? date('Y-m-d', strtotime($entry['exported_at']))
                    : date('Y-m-d');
                $t['session_date'] = $date;

                // Skip if already exists (by ticket_number + user)
                if (!empty($t['ticket_number'])) {
                    $exists = dbOne(
                        'SELECT id FROM tickets WHERE user_id=? AND ticket_number=?',
                        [$userId, $t['ticket_number']]
                    );
                    if ($exists) {
                        $inserted++;
                        continue;
                    }
                }

                $cols = implode(',', array_keys($t));
                $placeholders = implode(',', array_fill(0, count($t), '?'));
                dbExec(
                    "INSERT INTO tickets (user_id,{$cols}) VALUES (?,$placeholders)",
                    array_merge([$userId], array_values($t))
                );
                $inserted++;
            }
            $pdo->commit();
            // Update arcade progress
            updateArcadeProgress($userId);
            jsonOut(['status' => 'ok', 'inserted' => $inserted]);
        } catch (\Throwable $e) {
            $pdo->rollBack();
            jsonOut(['error' => $e->getMessage()], 500);
        }
    }

    // Single entry
    $t = sanitizeTicket($data);
    if (empty($t))
        jsonOut(['error' => 'No data'], 400);
    $t['session_date'] = date('Y-m-d');

    // ── Returning customer: append notes to existing ticket ──────
    $appended = false;
    if (!empty($t['ticket_number'])) {
        $existing = dbOne(
            'SELECT * FROM tickets WHERE user_id=? AND ticket_number=? ORDER BY exported_at DESC LIMIT 1',
            [$userId, $t['ticket_number']]
        );
        if ($existing) {
            $existingId = (int) $existing['id'];

            // Build appended notes: separator + timestamp + new notes
            $newNotes = trim($t['notes'] ?? '');
            if ($newNotes !== '') {
                $sep = "\n\n--- " . date('Y-m-d H:i') . " ---\n";
                $combined = rtrim($existing['notes'] ?? '') . $sep . $newNotes;
            } else {
                $combined = $existing['notes'] ?? '';
            }

            // Merge scalar fields: only overwrite if the new value is non-empty
            $updateFields = ['notes' => $combined];
            $overwritable = ['reason_for_contact', 'type_of_device', 'browser', 'location', 'contact_method', 'plan_type'];
            foreach ($overwritable as $field) {
                if (!empty($t[$field]))
                    $updateFields[$field] = $t[$field];
            }
            // Boolean fields: take the new value if explicitly set
            foreach (['obtained_info', 'has_account', 'escalated', 'solved'] as $field) {
                if (array_key_exists($field, $t))
                    $updateFields[$field] = $t[$field];
            }

            $set = implode('=?,', array_keys($updateFields)) . '=?';
            $vals = array_merge(array_values($updateFields), [$existingId, $userId]);
            dbExec("UPDATE tickets SET {$set}, exported_at=NOW() WHERE id=? AND user_id=?", $vals);

            $xpAwarded = updateArcadeProgress($userId, !empty($t['solved']) ? 50 : 20);
            jsonOut(['status' => 'ok', 'id' => $existingId, 'xp' => $xpAwarded, 'appended' => true]);
        }
    }

    // ── Fresh insert ─────────────────────────────────────────────
    $cols = implode(',', array_keys($t));
    $placeholders = implode(',', array_fill(0, count($t), '?'));
    dbExec(
        "INSERT INTO tickets (user_id,{$cols},exported_at) VALUES (?,{$placeholders},NOW())",
        array_merge([$userId], array_values($t))
    );
    $newId = (int) dbLastId();

    // Award XP in arcade mode
    $xpAwarded = 0;
    if (!empty($t['solved']))
        $xpAwarded = updateArcadeProgress($userId, 50);
    else
        $xpAwarded = updateArcadeProgress($userId, 20);

    jsonOut(['status' => 'ok', 'id' => $newId, 'xp' => $xpAwarded]);
}

// ── PUT ──────────────────────────────────────────────────────────
if ($method === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id)
        jsonOut(['error' => 'Missing id'], 400);

    $existing = dbOne('SELECT id FROM tickets WHERE id=? AND user_id=?', [$id, $userId]);
    if (!$existing)
        jsonOut(['error' => 'Not found'], 404);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?? [];
    $t = sanitizeTicket($data);
    if (empty($t))
        jsonOut(['error' => 'No data'], 400);

    $set = implode('=?,', array_keys($t)) . '=?';
    $vals = array_values($t);
    $vals[] = $id;
    $vals[] = $userId;
    dbExec("UPDATE tickets SET {$set} WHERE id=? AND user_id=?", $vals);
    jsonOut(['status' => 'ok']);
}

// ── DELETE ────────────────────────────────────────────────────────
if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id)
        jsonOut(['error' => 'Missing id'], 400);

    $affected = dbExec('DELETE FROM tickets WHERE id=? AND user_id=?', [$id, $userId]);
    if (!$affected)
        jsonOut(['error' => 'Not found'], 404);
    jsonOut(['status' => 'ok']);
}

// ── XP / Arcade helper ──────────────────────────────────────────
function updateArcadeProgress(int $userId, int $xpGain = 0): int
{
    $prog = dbOne('SELECT * FROM arcade_progress WHERE user_id=?', [$userId]);
    if (!$prog) {
        dbExec('INSERT INTO arcade_progress (user_id) VALUES (?)', [$userId]);
        $prog = ['level' => 1, 'xp' => 0, 'total_tickets' => 0, 'total_solved' => 0];
    }

    $xp = (int) $prog['xp'] + $xpGain;
    $level = (int) $prog['level'];
    $xpToNext = $level * 100;

    while ($xp >= $xpToNext) {
        $xp -= $xpToNext;
        $level++;
        $xpToNext = $level * 100;
    }

    dbExec(
        'UPDATE arcade_progress SET xp=?,level=?,total_tickets=total_tickets+1,last_activity=CURDATE()
         WHERE user_id=?',
        [$xp, $level, $userId]
    );
    return $xpGain;
}

jsonOut(['error' => 'Method not allowed'], 405);