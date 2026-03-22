<?php
/**
 * db.php — PDO MySQL connection helper for SaveState v2
 * Configure via environment variables or edit $cfg directly.
 */

$cfg = [
    'host'   => getenv('SS_DB_HOST') ?: 'db',
    'port'   => getenv('SS_DB_PORT') ?: '3306',
    'name'   => getenv('SS_DB_NAME') ?: 'savestate',
    'user'   => getenv('SS_DB_USER') ?: 'savestate_user',
    'pass'   => getenv('SS_DB_PASS') ?: 'savestatepass',
    'charset'=> 'utf8mb4',
];

function getPDO(): PDO {
    global $cfg;
    static $pdo = null;
    if ($pdo) return $pdo;
    $dsn = "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['name']};charset={$cfg['charset']}";
    $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
    return $pdo;
}

/** Convenience: run a query with params, return all rows */
function dbAll(string $sql, array $params = []): array {
    $s = getPDO()->prepare($sql);
    $s->execute($params);
    return $s->fetchAll();
}

/** Convenience: run a query with params, return first row or null */
function dbOne(string $sql, array $params = []): ?array {
    $rows = dbAll($sql, $params);
    return $rows[0] ?? null;
}

/** Convenience: run INSERT/UPDATE/DELETE, return affected rows */
function dbExec(string $sql, array $params = []): int {
    $s = getPDO()->prepare($sql);
    $s->execute($params);
    return $s->rowCount();
}

/** Return last insert ID */
function dbLastId(): string {
    return getPDO()->lastInsertId();
}
