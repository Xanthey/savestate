<?php
/**
 * api/import.php — SaveState v2 Vault Bulk Import
 *
 * POST  application/json  { "entries": [ {...}, ... ] }
 *
 * Maps the exported vault JSON schema to the tickets table.
 * Skips duplicates by ticket_number (per user).
 * Returns { inserted, skipped, errors, messages[] }
 */

require_once __DIR__ . '/../common.php';

if (empty($_SESSION['user_id'])) {
    jsonOut(['error' => 'Not authenticated'], 401);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonOut(['error' => 'POST required'], 405);
}

$userId = (int) $_SESSION['user_id'];

// ── Parse body ────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);
if (!isset($body['entries']) || !is_array($body['entries'])) {
    jsonOut(['error' => 'Expected JSON body with "entries" array'], 400);
}

$entries = $body['entries'];
if (count($entries) === 0) {
    jsonOut(['inserted' => 0, 'skipped' => 0, 'errors' => 0, 'messages' => []]);
}

// Hard cap: 10 000 records per request (safety valve)
if (count($entries) > 10000) {
    jsonOut(['error' => 'Too many entries in one request (max 10 000). Split the file and import in parts.'], 400);
}

// ── Field mapper (mirrors import_json.php) ────────────────────────
function mapEntry(array $e): array
{
    $ts = $e['exported_at'] ?? null;
    $date = $ts ? date('Y-m-d', strtotime($ts)) : date('Y-m-d');
    $exportedAt = $ts ? date('Y-m-d H:i:s', strtotime($ts)) : date('Y-m-d H:i:s');

    return [
        'ticket_number' => mb_substr(trim($e['ticket_number'] ?? ''), 0, 64),
        'reason_for_contact' => mb_substr(trim($e['reason_for_contact'] ?? ''), 0, 128),
        'type_of_device' => mb_substr(trim($e['type_of_device'] ?? ''), 0, 64),
        'browser' => mb_substr(trim($e['browser'] ?? ''), 0, 64),
        'location' => mb_substr(trim($e['location'] ?? ''), 0, 128),
        'obtained_info' => (int) (bool) ($e['obtained_info'] ?? false),
        'has_account' => (int) (bool) ($e['has_account'] ?? false),
        'escalated' => (int) (bool) ($e['escalated'] ?? false),
        'contact_method' => mb_substr(trim($e['contact_method'] ?? ''), 0, 64),
        'plan_type' => mb_substr(trim($e['plan_type'] ?? ''), 0, 64),
        'solved' => (int) (bool) ($e['solved'] ?? false),
        'notes' => trim($e['notes'] ?? ''),
        'session_date' => $date,
        'exported_at' => $exportedAt,
    ];
}

// ── Import in batches ─────────────────────────────────────────────
$inserted = 0;
$skipped = 0;
$errors = 0;
$messages = [];

$pdo = getPDO();
$batches = array_chunk($entries, 100);

// Pre-load existing ticket_numbers for this user to avoid N+1 existence checks
$existingNums = [];
$rows = dbAll(
    'SELECT ticket_number FROM tickets WHERE user_id=? AND ticket_number != \'\'',
    [$userId]
);
foreach ($rows as $r) {
    $existingNums[$r['ticket_number']] = true;
}

foreach ($batches as $batchIdx => $batch) {
    try {
        $pdo->beginTransaction();

        foreach ($batch as $entry) {
            $t = mapEntry($entry);

            // Skip duplicates
            if ($t['ticket_number'] !== '' && isset($existingNums[$t['ticket_number']])) {
                $skipped++;
                continue;
            }

            $cols = implode(',', array_keys($t));
            $ph = implode(',', array_fill(0, count($t), '?'));
            dbExec(
                "INSERT INTO tickets (user_id,$cols) VALUES (?,$ph)",
                array_merge([$userId], array_values($t))
            );

            // Track newly inserted ticket_number
            if ($t['ticket_number'] !== '') {
                $existingNums[$t['ticket_number']] = true;
            }
            $inserted++;
        }

        $pdo->commit();

    } catch (\Throwable $e) {
        $pdo->rollBack();
        $errors++;
        $messages[] = 'Batch ' . ($batchIdx + 1) . ' failed: ' . $e->getMessage();
    }
}

// ── Update arcade progress totals ────────────────────────────────
if ($inserted > 0) {
    try {
        $totalTickets = (int) (dbOne(
            'SELECT COUNT(*) AS c FROM tickets WHERE user_id=?',
            [$userId]
        )['c'] ?? 0);
        $totalSolved = (int) (dbOne(
            'SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND solved=1',
            [$userId]
        )['c'] ?? 0);
        dbExec(
            'INSERT INTO arcade_progress (user_id, total_tickets, total_solved)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE total_tickets=?, total_solved=?',
            [$userId, $totalTickets, $totalSolved, $totalTickets, $totalSolved]
        );
    } catch (\Throwable $e) {
        // Non-fatal — arcade stats can drift and be recalculated
        $messages[] = 'Arcade progress update skipped: ' . $e->getMessage();
    }
}

jsonOut([
    'inserted' => $inserted,
    'skipped' => $skipped,
    'errors' => $errors,
    'messages' => $messages,
]);