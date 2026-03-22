<?php
/**
 * api/issues_import.php — SaveState v2 Known Issues Bulk Import
 *
 * POST  application/json  { "issues": [ {tag, title, description, keywords}, ... ] }
 *
 * Skips duplicates by tag (per user).
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

$body = json_decode(file_get_contents('php://input'), true);
if (!isset($body['issues']) || !is_array($body['issues'])) {
    jsonOut(['error' => 'Expected JSON body with "issues" array'], 400);
}

$issues = $body['issues'];
if (count($issues) === 0) {
    jsonOut(['inserted' => 0, 'skipped' => 0, 'errors' => 0, 'messages' => []]);
}

if (count($issues) > 5000) {
    jsonOut(['error' => 'Too many issues in one request (max 5000).'], 400);
}

// Pre-load existing tags for this user to detect duplicates
$existingTags = [];
$rows = dbAll(
    'SELECT LOWER(tag) AS tag FROM known_issues WHERE user_id=? AND active=1 AND tag != \'\'',
    [$userId]
);
foreach ($rows as $r) {
    $existingTags[$r['tag']] = true;
}

$inserted = 0;
$skipped = 0;
$errors = 0;
$messages = [];

$pdo = getPDO();
$batches = array_chunk($issues, 100);

foreach ($batches as $batchIdx => $batch) {
    try {
        $pdo->beginTransaction();

        foreach ($batch as $issue) {
            $tag = mb_substr(trim($issue['tag'] ?? ''), 0, 128);
            $title = mb_substr(trim($issue['title'] ?? ''), 0, 255);

            if ($title === '') {
                $skipped++;
                continue;
            }

            // Skip duplicate tags (case-insensitive)
            if ($tag !== '' && isset($existingTags[strtolower($tag)])) {
                $skipped++;
                continue;
            }

            $desc = mb_substr(trim($issue['description'] ?? ''), 0, 4000);
            $keywords = mb_substr(trim($issue['keywords'] ?? ''), 0, 512);

            dbExec(
                'INSERT INTO known_issues (user_id, tag, title, description, keywords, active)
                 VALUES (?, ?, ?, ?, ?, 1)',
                [$userId, $tag, $title, $desc, $keywords]
            );

            if ($tag !== '') {
                $existingTags[strtolower($tag)] = true;
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

jsonOut([
    'inserted' => $inserted,
    'skipped' => $skipped,
    'errors' => $errors,
    'messages' => $messages,
]);