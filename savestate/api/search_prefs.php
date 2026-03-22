<?php
/**
 * api/search_prefs.php — SaveState v2 Search Algorithm Preferences
 *
 * Manages per-user boost terms and suppress terms for the smart
 * search relevance system.
 *
 * GET              → { boost: [...], suppress: [...] }
 * POST { action, term, type }
 *   action = "add"    → add a term
 *   action = "remove" → remove a term by id
 * type = "boost" | "suppress"
 *
 * Table (auto-created on first call):
 *   search_algorithm_terms (id, user_id, type ENUM('boost','suppress'), term, created_at)
 */

require_once __DIR__ . '/../common.php';

if (empty($_SESSION['user_id'])) {
    jsonOut(['error' => 'Not authenticated'], 401);
}

$userId = (int) $_SESSION['user_id'];

// ── Ensure table exists ──────────────────────────────────────────────
getPDO()->exec("
    CREATE TABLE IF NOT EXISTS search_algorithm_terms (
        id         INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id    INT UNSIGNED    NOT NULL,
        type       ENUM('boost','suppress') NOT NULL,
        term       VARCHAR(200)    NOT NULL,
        created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_type_term (user_id, type, term),
        INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

// ── GET: return current terms ────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = dbAll(
        "SELECT id, type, term FROM search_algorithm_terms
          WHERE user_id = ?
          ORDER BY type, term",
        [$userId]
    );

    $boost = [];
    $suppress = [];
    foreach ($rows as $r) {
        if ($r['type'] === 'boost') {
            $boost[] = ['id' => (int) $r['id'], 'term' => $r['term']];
        } else {
            $suppress[] = ['id' => (int) $r['id'], 'term' => $r['term']];
        }
    }

    // Also bundle active Known Issues tags + keywords so SearchFilter on the
    // entry form can treat them as high-signal tokens automatically.
    // Rules:
    //  - Tags: underscores → spaces so they become readable tokens
    //  - Keywords: split only on comma/semicolon — preserve multi-word phrases
    //    like "cant log in" intact so JS can match them as phrases, not broken words
    //  - Title is intentionally excluded (too verbose, causes false positives)
    $kiTerms = [];
    try {
        $kiRows = dbAll(
            "SELECT tag, keywords FROM known_issues
              WHERE active = 1 AND (user_id = ? OR user_id = 0)",
            [$userId]
        );
        foreach ($kiRows as $ki) {
            if (!empty($ki['tag'])) {
                // Store both raw and underscore-normalised so JS can match either
                $rawTag = trim($ki['tag']);
                $normTag = trim(str_replace('_', ' ', $rawTag));
                $kiTerms[] = $rawTag;
                if ($normTag !== $rawTag)
                    $kiTerms[] = $normTag;
            }
            if (!empty($ki['keywords'])) {
                // Split only on comma/semicolon — spaces are intentional in phrases
                foreach (preg_split('/[,;]+/', $ki['keywords']) as $kw) {
                    $kw = trim($kw);
                    if (strlen($kw) >= 2)
                        $kiTerms[] = $kw;
                }
            }
        }
        $kiTerms = array_values(array_unique(array_filter($kiTerms)));
    } catch (\Throwable $e) {
        $kiTerms = [];
    }

    jsonOut(['boost' => $boost, 'suppress' => $suppress, 'ki_terms' => $kiTerms]);
}

// ── POST: add or remove a term ───────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = trim($data['action'] ?? '');
    $type = trim($data['type'] ?? '');
    $term = trim($data['term'] ?? '');
    $id = (int) ($data['id'] ?? 0);

    if (!in_array($type, ['boost', 'suppress'], true) && $action !== 'remove') {
        jsonOut(['error' => 'type must be boost or suppress'], 400);
    }

    // ── Add ──────────────────────────────────────────────────────────
    if ($action === 'add') {
        if (!$term)
            jsonOut(['error' => 'term required'], 400);
        if (mb_strlen($term) > 200)
            jsonOut(['error' => 'term too long (max 200 chars)'], 400);

        // Enforce a reasonable per-user limit
        $count = (int) (dbOne(
            "SELECT COUNT(*) AS n FROM search_algorithm_terms WHERE user_id = ? AND type = ?",
            [$userId, $type]
        )['n'] ?? 0);

        if ($count >= 100) {
            jsonOut(['error' => "Maximum 100 {$type} terms reached"], 400);
        }

        try {
            dbExec(
                "INSERT IGNORE INTO search_algorithm_terms (user_id, type, term)
                 VALUES (?, ?, ?)",
                [$userId, $type, $term]
            );
            $newId = (int) dbLastId();

            // If INSERT IGNORE skipped due to duplicate, find the existing id
            if ($newId === 0) {
                $existing = dbOne(
                    "SELECT id FROM search_algorithm_terms WHERE user_id=? AND type=? AND term=?",
                    [$userId, $type, $term]
                );
                $newId = (int) ($existing['id'] ?? 0);
            }

            jsonOut(['status' => 'ok', 'id' => $newId, 'term' => $term, 'type' => $type]);
        } catch (\Throwable $e) {
            jsonOut(['error' => 'Database error'], 500);
        }
    }

    // ── Remove ───────────────────────────────────────────────────────
    if ($action === 'remove') {
        if (!$id)
            jsonOut(['error' => 'id required'], 400);
        dbExec(
            "DELETE FROM search_algorithm_terms WHERE id = ? AND user_id = ?",
            [$id, $userId]
        );
        jsonOut(['status' => 'ok']);
    }

    jsonOut(['error' => 'Unknown action'], 400);
}

jsonOut(['error' => 'Method not allowed'], 405);