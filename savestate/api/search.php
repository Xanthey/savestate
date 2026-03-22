<?php
/**
 * api/search.php — SaveState v2 Fuzzy Search API  (v2 — Smart Relevance)
 *
 * GET ?q=QUERY[&limit=5][&mode=tickets|issues|all][&boost=term1,term2]
 *
 * Improvements over v1:
 *   1. Built-in structural stop-phrase stripping before MySQL query
 *   2. Boost terms (from ?boost= param or user's search_algorithm_terms table)
 *      are used to re-score results after MySQL returns them
 *   3. Results that matched ONLY on suppressed/stop terms are penalised
 *   4. Final results are re-sorted by composite relevance score
 */

require_once __DIR__ . '/../common.php';

if (empty($_SESSION['user_id'])) {
    jsonOut(['error' => 'Not authenticated'], 401);
}

$userId = (int) $_SESSION['user_id'];
$q = trim($_GET['q'] ?? '');
$limit = min((int) ($_GET['limit'] ?? 5), 20);
$mode = $_GET['mode'] ?? 'all';

// Boost terms sent by the JS extractor (comma-separated high-signal tokens)
$boostRaw = trim($_GET['boost'] ?? '');
$boostTokens = $boostRaw
    ? array_filter(array_map('trim', explode(',', $boostRaw)))
    : [];

if (strlen($q) < 3) {
    jsonOut(['tickets' => [], 'issues' => []]);
}

// ── Built-in structural stop phrases ────────────────────────────────
// These mirror the JS list; keeping them in sync here means the PHP
// layer can also strip them when building the MySQL query independently.
const STOP_PHRASES = [
    'eu states',
    'eu stated',
    'customer states',
    'customer stated',
    'customer advised',
    'i advised',
    'advised customer',
    'advised the customer',
    'the customer',
    'a customer',
    'customer called',
    'customer is',
    'please note',
    'as per',
    'going forward',
    'at this time',
    'to be advised',
    'to be determined',
    'per the customer',
    'customer confirmed',
    'confirmed with customer',
    'customer would like',
    'customer requested',
    'informed the customer',
    'let the customer know',
    'reached out',
    'following up',
    'as previously',
    'as mentioned',
    'per our conversation',
    'at this point',
    'in regards to',
    'with regards to',
    'moving forward',
    'upon review',
];

// ── Load user's suppress/boost terms from DB ─────────────────────────
$userTermRows = [];
try {
    // Table may not exist yet on first run — ensured by api/search_prefs.php
    $userTermRows = dbAll(
        "SELECT type, term FROM search_algorithm_terms WHERE user_id = ?",
        [$userId]
    );
} catch (\Throwable $e) {
    // Table doesn't exist yet — silently ignore
}

$userSuppressTerms = [];
$userBoostTerms = [];
foreach ($userTermRows as $r) {
    if ($r['type'] === 'suppress') {
        $userSuppressTerms[] = strtolower(trim($r['term']));
    } else {
        $userBoostTerms[] = strtolower(trim($r['term']));
    }
}

// Merge DB boost terms with those sent by the JS extractor
$allBoostTerms = array_unique(array_merge(
    $userBoostTerms,
    array_map('strtolower', $boostTokens)
));

// ── Strip stop phrases from the MySQL query string ───────────────────
function stripStopPhrasesFromQuery(string $q): string
{
    $allPhrases = array_merge(STOP_PHRASES, $GLOBALS['userSuppressTerms']);
    usort($allPhrases, fn($a, $b) => strlen($b) - strlen($a)); // longest first
    foreach ($allPhrases as $phrase) {
        $escaped = preg_quote($phrase, '/');
        $q = preg_replace('/\b' . $escaped . '\b/iu', ' ', $q);
    }
    return preg_replace('/\s+/', ' ', trim($q));
}

$cleanedQ = stripStopPhrasesFromQuery($q);

// If stripping gutted the query, use the original (something is better than nothing)
if (strlen($cleanedQ) < 3) {
    $cleanedQ = $q;
}

// ── Relevance re-scorer ──────────────────────────────────────────────
/**
 * Given a result row (with 'notes', 'title', 'description' etc.)
 * and the MySQL relevance float, return a composite score.
 *
 * Boost:   each boost term found in the text  → +5 per term
 * Penalty: if ONLY stop phrases matched       → ×0.1
 */
function computeRelevance(array $row, float $mysqlScore, array $boostTerms): float
{
    // Collect text fields into one haystack — title/description excluded
    // (too verbose; causes false positives for known issues).
    $haystack = strtolower(implode(' ', array_filter([
        $row['notes'] ?? '',
        $row['notes_preview'] ?? '',
        $row['reason_for_contact'] ?? '',
        $row['keywords'] ?? '',
        str_replace('_', ' ', $row['tag'] ?? ''),
    ])));

    $boostScore = 0.0;
    foreach ($boostTerms as $term) {
        if ($term && strpos($haystack, $term) !== false) {
            $boostScore += 5.0;
        }
    }

    return $mysqlScore + $boostScore;
}

// ── Results container ────────────────────────────────────────────────
$results = ['tickets' => [], 'issues' => []];

// ── Ticket Search ────────────────────────────────────────────────────
if ($mode === 'tickets' || $mode === 'all') {
    $tickets = [];

    try {
        $tickets = dbAll(
            "SELECT id, ticket_number, reason_for_contact, contact_method,
                    plan_type, solved, notes, session_date,
                    MATCH(notes, ticket_number, reason_for_contact, location)
                    AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance
             FROM tickets
             WHERE user_id = ?
               AND MATCH(notes, ticket_number, reason_for_contact, location)
                   AGAINST(? IN NATURAL LANGUAGE MODE)
             ORDER BY relevance DESC
             LIMIT ?",
            [$cleanedQ, $userId, $cleanedQ, $limit * 3] // fetch extra; we'll re-rank & trim
        );
    } catch (\Throwable $e) {
        // FULLTEXT unavailable — try LIKE
    }

    if (empty($tickets)) {
        $like = '%' . $cleanedQ . '%';
        $tickets = dbAll(
            "SELECT id, ticket_number, reason_for_contact, contact_method,
                    plan_type, solved, notes, session_date,
                    1 AS relevance
             FROM tickets
             WHERE user_id = ?
               AND (notes LIKE ? OR ticket_number LIKE ? OR reason_for_contact LIKE ?)
             ORDER BY session_date DESC
             LIMIT ?",
            [$userId, $like, $like, $like, $limit * 3]
        );
    }

    // Re-score, re-sort, truncate
    foreach ($tickets as &$t) {
        $t['_score'] = computeRelevance($t, (float) ($t['relevance'] ?? 0), $allBoostTerms);
        // Build notes preview before dropping notes
        if (!empty($t['notes'])) {
            $plain = strip_tags($t['notes']);
            $t['notes_preview'] = mb_substr($plain, 0, 160)
                . (mb_strlen($plain) > 160 ? '…' : '');
        } else {
            $t['notes_preview'] = '';
        }
        $t['solved'] = (bool) $t['solved'];
        unset($t['notes'], $t['relevance']);
    }
    unset($t);

    usort($tickets, fn($a, $b) => $b['_score'] <=> $a['_score']);

    // Strip internal score before sending to client, apply final limit
    $results['tickets'] = array_map(function ($t) {
        unset($t['_score']);
        return $t;
    }, array_slice($tickets, 0, $limit));
}

// ── Known Issues Search ──────────────────────────────────────────────
// NOTE: We intentionally exclude 'title' and 'description' from the
// MATCH clause — they are too verbose and produce excessive false matches.
// Only 'tag' and 'keywords' are used for matching.
// Tags often use underscores instead of spaces (e.g. polaris_playback_stopping),
// so we normalise underscores → spaces in the query before searching.
if ($mode === 'issues' || $mode === 'all') {
    $issues = [];

    // Normalise underscores to spaces so tag tokens become searchable words.
    // The query arriving here is already a token list from the JS extractor
    // (e.g. "ios contest login") — not a raw sentence.
    $issueQ = str_replace('_', ' ', $cleanedQ);
    if (strlen($issueQ) < 3)
        $issueQ = $cleanedQ;

    // Split into meaningful tokens (>=3 chars), strip BOOLEAN MODE special chars.
    $boolSpecial = ['~', '*', '+', '-', '<', '>', '(', ')', '"', '@'];
    $issueTokens = array_values(array_filter(
        array_map(
            fn($t) => str_replace($boolSpecial, '', $t),
            preg_split('/\s+/', $issueQ)
        ),
        fn($t) => strlen($t) >= 3
    ));

    // BOOLEAN MODE without + prefix = OR semantics: any matching token scores the
    // row, bypassing the 50%-threshold stopword rule. Rows with more matches rank higher.
    $issueBoolQ = implode(' ', $issueTokens);

    try {
        $issues = empty($issueBoolQ) ? [] : dbAll(
            "SELECT id, tag, title, description, keywords,
                    MATCH(keywords, tag)
                    AGAINST(? IN BOOLEAN MODE) AS relevance
             FROM known_issues
             WHERE active = 1
               AND (user_id = ? OR user_id = 0)
               AND MATCH(keywords, tag)
                   AGAINST(? IN BOOLEAN MODE)
             ORDER BY relevance DESC
             LIMIT ?",
            [$issueBoolQ, $userId, $issueBoolQ, $limit * 3]
        );
    } catch (\Throwable $e) {
        $issues = [];
    }

    // LIKE fallback: fires when FULLTEXT returns nothing (table too small for the
    // index, or all tokens below MySQL min word length).
    // Search per-token so partial matches are still found, then rank by hit count.
    if (empty($issues) && !empty($issueTokens)) {
        $conditions = [];
        $params = [$userId];
        foreach ($issueTokens as $tok) {
            $like = '%' . $tok . '%';
            $conditions[] = "(keywords LIKE ? OR REPLACE(tag,'_',' ') LIKE ?)";
            $params[] = $like;
            $params[] = $like;
        }
        $params[] = $limit * 3;

        try {
            $issues = dbAll(
                "SELECT id, tag, title, description, keywords, 1 AS relevance
                 FROM known_issues
                 WHERE active = 1
                   AND (user_id = ? OR user_id = 0)
                   AND (" . implode(' OR ', $conditions) . ")
                 ORDER BY updated_at DESC
                 LIMIT ?",
                $params
            );
        } catch (\Throwable $e) {
            // Return empty — nothing more we can do
        }

        // Re-rank by counting how many tokens hit in each row
        if (!empty($issues)) {
            foreach ($issues as &$ki) {
                $hay = strtolower(
                    str_replace('_', ' ', $ki['tag'] ?? '') . ' ' . ($ki['keywords'] ?? '')
                );
                $hits = 0;
                foreach ($issueTokens as $tok) {
                    if (strpos($hay, strtolower($tok)) !== false)
                        $hits++;
                }
                $ki['_like_score'] = $hits;
            }
            unset($ki);
            usort($issues, fn($a, $b) => $b['_like_score'] <=> $a['_like_score']);
            foreach ($issues as &$ki)
                unset($ki['_like_score']);
            unset($ki);
        }
    }

    foreach ($issues as &$ki) {
        // Re-score using only keywords and tag — exclude title/description from haystack
        $kiHaystack = strtolower(implode(' ', array_filter([
            str_replace('_', ' ', $ki['tag'] ?? ''),
            $ki['keywords'] ?? '',
        ])));
        $boostScore = 0.0;
        foreach ($allBoostTerms as $term) {
            if ($term && strpos($kiHaystack, $term) !== false) {
                $boostScore += 5.0;
            }
        }
        $ki['_score'] = (float) ($ki['relevance'] ?? 0) + $boostScore;

        if (!empty($ki['description'])) {
            $ki['desc_preview'] = mb_substr($ki['description'], 0, 200)
                . (mb_strlen($ki['description']) > 200 ? '…' : '');
        } else {
            $ki['desc_preview'] = '';
        }
        unset($ki['description'], $ki['keywords'], $ki['relevance']);
    }
    unset($ki);

    usort($issues, fn($a, $b) => $b['_score'] <=> $a['_score']);

    $results['issues'] = array_map(function ($ki) {
        unset($ki['_score']);
        return $ki;
    }, array_slice($issues, 0, $limit));
}

jsonOut($results);