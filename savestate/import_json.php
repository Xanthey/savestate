<?php
/**
 * import_json.php — SaveState v2 Legacy JSON → MySQL Importer
 *
 * USAGE (CLI):
 *   php import_json.php --file=vaultdb-myname.json --user=your_username [--dry-run]
 *
 * OPTIONS:
 *   --file=PATH      Path to the JSON vault file (required)
 *   --user=USERNAME  Target username in the users table (required)
 *   --dry-run        Parse and report without writing to DB
 *   --batch=N        Batch size for inserts (default 100)
 *   --skip-existing  Skip tickets with matching ticket_number (default: true)
 *
 * The script maps the old JSON keys to the new schema:
 *   ticket_number       → ticket_number
 *   reason_for_contact  → reason_for_contact
 *   type_of_device      → type_of_device
 *   browser             → browser
 *   location            → location
 *   obtained_info       → obtained_info
 *   has_account         → has_account
 *   escalated           → escalated
 *   contact_method      → contact_method
 *   plan_type           → plan_type
 *   solved              → solved
 *   notes               → notes
 *   exported_at         → exported_at + session_date
 */

if (php_sapi_name() !== 'cli') {
    die("This script must be run from the command line.\n");
}

// ── Parse CLI args ────────────────────────────────────────────────
$opts = getopt('', ['file:','user:','dry-run','batch:','skip-existing']);
$file        = $opts['file']   ?? null;
$username    = $opts['user']   ?? null;
$dryRun      = isset($opts['dry-run']);
$batchSize   = (int)($opts['batch'] ?? 100);

if (!$file || !$username) {
    echo "Usage: php import_json.php --file=PATH --user=USERNAME [--dry-run]\n";
    exit(1);
}

if (!file_exists($file)) {
    echo "Error: File not found: $file\n";
    exit(1);
}

require_once __DIR__ . '/db.php';

// ── Find user ─────────────────────────────────────────────────────
$user = dbOne('SELECT * FROM users WHERE username=?', [$username]);
if (!$user) {
    echo "Error: User '$username' not found. Create the user by logging in first.\n";
    exit(1);
}
$userId = (int)$user['id'];
echo "Target user: {$user['display_name']} (ID $userId)\n";

// ── Load JSON ─────────────────────────────────────────────────────
echo "Loading $file…\n";
$raw  = file_get_contents($file);
$data = json_decode($raw, true);
if (!is_array($data)) {
    echo "Error: Could not parse JSON. Is it a valid SaveState vault file?\n";
    exit(1);
}
echo "Found " . count($data) . " records.\n";
if ($dryRun) echo "[DRY RUN — no changes will be written]\n";

// ── Map fields ────────────────────────────────────────────────────
function mapEntry(array $entry): array {
    $ts = $entry['exported_at'] ?? null;
    $date = $ts ? date('Y-m-d', strtotime($ts)) : date('Y-m-d');
    $exportedAt = $ts ? date('Y-m-d H:i:s', strtotime($ts)) : date('Y-m-d H:i:s');

    return [
        'ticket_number'      => trim($entry['ticket_number']      ?? ''),
        'reason_for_contact' => trim($entry['reason_for_contact'] ?? ''),
        'type_of_device'     => trim($entry['type_of_device']     ?? ''),
        'browser'            => trim($entry['browser']            ?? ''),
        'location'           => trim($entry['location']           ?? ''),
        'obtained_info'      => (int)(bool)($entry['obtained_info'] ?? false),
        'has_account'        => (int)(bool)($entry['has_account']   ?? false),
        'escalated'          => (int)(bool)($entry['escalated']     ?? false),
        'contact_method'     => trim($entry['contact_method']     ?? ''),
        'plan_type'          => trim($entry['plan_type']           ?? ''),
        'solved'             => (int)(bool)($entry['solved']       ?? false),
        'notes'              => trim($entry['notes']               ?? ''),
        'session_date'       => $date,
        'exported_at'        => $exportedAt,
    ];
}

// ── Import ────────────────────────────────────────────────────────
$inserted = 0;
$skipped  = 0;
$errors   = 0;
$batches  = array_chunk($data, $batchSize);
$total    = count($data);

$pdo = getPDO();

foreach ($batches as $batchNum => $batch) {
    echo sprintf("  Batch %d/%d…", $batchNum + 1, count($batches));

    if (!$dryRun) $pdo->beginTransaction();
    $batchInserted = 0;

    try {
        foreach ($batch as $entry) {
            $t = mapEntry($entry);

            // Check for existing by ticket_number
            if (!empty($t['ticket_number'])) {
                $exists = dbOne(
                    'SELECT id FROM tickets WHERE user_id=? AND ticket_number=?',
                    [$userId, $t['ticket_number']]
                );
                if ($exists) { $skipped++; continue; }
            }

            if (!$dryRun) {
                $cols = implode(',', array_keys($t));
                $ph   = implode(',', array_fill(0, count($t), '?'));
                dbExec(
                    "INSERT INTO tickets (user_id,$cols) VALUES (?,$ph)",
                    array_merge([$userId], array_values($t))
                );
            }
            $inserted++;
            $batchInserted++;
        }

        if (!$dryRun) $pdo->commit();
        echo " ✓ {$batchInserted} inserted\n";

    } catch (\Throwable $e) {
        if (!$dryRun) $pdo->rollBack();
        echo " ✗ Error: " . $e->getMessage() . "\n";
        $errors++;
    }
}

// ── Update arcade progress ────────────────────────────────────────
if (!$dryRun && $inserted > 0) {
    $total_tickets = (int)(dbOne('SELECT COUNT(*) AS c FROM tickets WHERE user_id=?', [$userId])['c'] ?? 0);
    $total_solved  = (int)(dbOne('SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND solved=1', [$userId])['c'] ?? 0);
    dbExec(
        'UPDATE arcade_progress SET total_tickets=?, total_solved=? WHERE user_id=?',
        [$total_tickets, $total_solved, $userId]
    );
}

// ── Summary ───────────────────────────────────────────────────────
echo "\n=== Import Complete ===\n";
echo "  Inserted : $inserted\n";
echo "  Skipped  : $skipped (already exist)\n";
echo "  Errors   : $errors\n";
if ($dryRun) echo "  [DRY RUN — nothing was written to the database]\n";
echo "\n";
