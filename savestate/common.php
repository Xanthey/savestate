<?php
/**
 * common.php — Shared includes for SaveState v2
 * Provides: session guard, config loader, page header/footer helpers,
 *           system settings (OOBE/network mode), password utilities
 */

// session_start() is called by each entry-point file before requiring this.
// Using session_status() here prevents the "already active" notice if
// something ever includes common.php without having started the session first.
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/db.php';

// ── Session Guard ────────────────────────────────────────────────
function requireLogin(): array
{
    if (empty($_SESSION['user_id'])) {
        header('Location: index.php');
        exit;
    }
    return [
        'id' => (int) $_SESSION['user_id'],
        'username' => $_SESSION['username'] ?? 'user',
        'display_name' => $_SESSION['display_name'] ?? 'User',
        'avatar_color' => $_SESSION['avatar_color'] ?? '#3a8dde',
    ];
}

// ── Config Loader ────────────────────────────────────────────────
function loadConf(): array
{
    static $conf = null;
    if ($conf)
        return $conf;
    $path = __DIR__ . '/company.conf';
    $conf = json_decode(file_get_contents($path), true) ?? [];
    return $conf;
}

// ── User Preferences ─────────────────────────────────────────────
function getUserPref(int $userId, string $key, string $default = ''): string
{
    $row = dbOne('SELECT pref_val FROM user_prefs WHERE user_id=? AND pref_key=?', [$userId, $key]);
    return $row['pref_val'] ?? $default;
}
function setUserPref(int $userId, string $key, string $value): void
{
    dbExec(
        'INSERT INTO user_prefs (user_id, pref_key, pref_val) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE pref_val=VALUES(pref_val)',
        [$userId, $key, $value]
    );
}

// ── System Settings (persistent key/value, server-wide) ──────────
/**
 * Creates the system_settings table if it does not exist.
 * Safe to call on every request — uses CREATE TABLE IF NOT EXISTS.
 */
function ensureSystemTables(): void
{
    getPDO()->exec("
        CREATE TABLE IF NOT EXISTS system_settings (
            setting_key   VARCHAR(64)   NOT NULL PRIMARY KEY,
            setting_val   TEXT          NOT NULL,
            updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

/**
 * Reads a system-wide setting. Returns null if not set.
 */
function getSystemSetting(string $key): ?string
{
    try {
        $row = dbOne('SELECT setting_val FROM system_settings WHERE setting_key=?', [$key]);
        return $row['setting_val'] ?? null;
    } catch (\Throwable $e) {
        // Table might not exist yet on very first call before ensureSystemTables()
        return null;
    }
}

/**
 * Writes (upserts) a system-wide setting.
 */
function setSystemSetting(string $key, string $value): void
{
    dbExec(
        'INSERT INTO system_settings (setting_key, setting_val) VALUES (?,?)
         ON DUPLICATE KEY UPDATE setting_val=VALUES(setting_val)',
        [$key, $value]
    );
}

/**
 * Returns the current network mode ("local" or "public").
 * Defaults to "local" if not yet set.
 */
function getNetworkMode(): string
{
    return getSystemSetting('network_mode') ?? 'local';
}

/**
 * Returns true if password authentication is required (public mode).
 */
function isPublicMode(): bool
{
    return getNetworkMode() === 'public';
}

// ── Password Column Migration ─────────────────────────────────────
/**
 * Adds password_hash column to users table if it doesn't exist.
 * Called when switching to public mode during OOBE.
 */
function ensurePasswordColumn(): void
{
    $pdo = getPDO();
    // Check if column already exists
    $stmt = $pdo->prepare("
        SELECT COUNT(*) AS cnt
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'users'
          AND COLUMN_NAME  = 'password_hash'
    ");
    $stmt->execute();
    $row = $stmt->fetch();
    if ((int) ($row['cnt'] ?? 0) === 0) {
        $pdo->exec("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER avatar_color");
    }
}

// ── Page HTML Header ─────────────────────────────────────────────
function pageHead(string $title, array $extraCss = []): void
{
    $conf = loadConf();
    $appTitle = htmlspecialchars($conf['app_title'] ?? 'SaveState');
    $fullTitle = htmlspecialchars($title . ' — ' . ($conf['app_title'] ?? 'SaveState'));
    $cssFiles = array_merge([
        'assets/css/core.css',
        'assets/css/layout.css',
        'assets/css/components.css',
    ], $extraCss);
    echo "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n";
    echo "  <meta charset=\"UTF-8\">\n";
    echo "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n";
    echo "  <title>$fullTitle</title>\n";
    echo "  <link rel=\"icon\" type=\"image/svg+xml\" href=\"assets/img/beaker.svg\">\n";
    foreach ($cssFiles as $css) {
        echo "  <link rel=\"stylesheet\" href=\"$css\">\n";
    }
    echo "</head>\n";
}

// ── App Shell Open (body, bg, titlebar, subheader) ───────────────
function appShellOpen(array $user, string $activePage = ''): void
{
    $conf = loadConf();
    $appTitle = htmlspecialchars($conf['app_title'] ?? 'SaveState');
    $theme = getUserPref($user['id'], 'theme', $conf['themes']['default'] ?? 'dark');
    $mode = getUserPref($user['id'], 'mode', 'lab');
    $initials = strtoupper(substr($user['display_name'], 0, 2));
    $avatarColor = htmlspecialchars($user['avatar_color']);

    // Build nav items
    $nav = [
        'app.php' => 'Entry',
        'entries.php' => 'Today',
        'vault.php' => 'Vault',
        'tools.php' => 'Tools',
        'about.php' => 'About',
    ];

    echo "<body class=\"theme-{$theme}\" data-mode=\"{$mode}\" data-user=\"{$user['id']}\">\n";
    echo "<div class=\"bg-scene\" aria-hidden=\"true\"><div class=\"orb orb-1\"></div><div class=\"orb orb-2\"></div><div class=\"orb orb-3\"></div></div>\n";
    echo "<div class=\"app\">\n";

    // Titlebar
    echo "<header class=\"titlebar\">\n";
    echo "  <div class=\"titlebar__brand\">\n";
    echo "    <img src=\"assets/img/beaker.svg\" alt=\"\" aria-hidden=\"true\">\n";
    echo "    <span>{$appTitle}</span>\n";
    echo "  </div>\n";
    echo "  <nav class=\"titlebar__nav\">\n";
    foreach ($nav as $href => $label) {
        $cls = ($href === $activePage) ? ' class="active"' : '';
        echo "    <a href=\"{$href}\"{$cls}>{$label}</a>\n";
    }
    echo "  </nav>\n";
    // Load saved clock timezone prefs so we can pass them to JS
    $clockTzRaw = getUserPref($user['id'], 'clock_timezones', '');
    $clockFmt = getUserPref($user['id'], 'clock_timeformat', '24');
    $clockTzJson = $clockTzRaw ? htmlspecialchars($clockTzRaw) : '';
    $clockFmt = in_array($clockFmt, ['12', '24']) ? $clockFmt : '24';

    echo "  <div class=\"titlebar__right\">\n";
    // Multi-clock widget
    echo "    <div class=\"clock-widget\" id=\"clockWidget\" data-tzpref=\"{$clockTzJson}\" data-fmtpref=\"{$clockFmt}\">\n";
    echo "      <button class=\"btn-icon clock-widget__btn\" id=\"clockBtn\" title=\"World Clocks\" aria-haspopup=\"dialog\">\n";
    echo "        <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"17\" height=\"17\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">";
    echo "          <circle cx=\"12\" cy=\"12\" r=\"10\"/><polyline points=\"12 6 12 12 16 14\"/>";
    echo "          <circle cx=\"6\" cy=\"20\" r=\"2\" stroke-width=\"1.5\"/><circle cx=\"12\" cy=\"20\" r=\"2\" stroke-width=\"1.5\"/><circle cx=\"18\" cy=\"20\" r=\"2\" stroke-width=\"1.5\"/>";
    echo "        </svg>\n";
    echo "      </button>\n";
    echo "      <div class=\"clock-tooltip\" id=\"clockTooltip\" role=\"tooltip\">\n";
    echo "        <div class=\"clock-tooltip__clocks\" id=\"clockTooltipClocks\"></div>\n";
    echo "      </div>\n";
    echo "    </div>\n";
    echo "    <select id=\"themeSelect\" title=\"Theme\">\n";
    foreach ($conf['themes']['available'] as $th) {
        $sel = ($th['value'] === $theme) ? ' selected' : '';
        echo "      <option value=\"{$th['value']}\"{$sel}>" . htmlspecialchars($th['label']) . "</option>\n";
    }
    echo "    </select>\n";
    // Mode switcher
    echo "    <div class=\"mode-switcher\" id=\"modeSwitcher\">\n";
    $modes = ['arcade' => '🎮', 'lab' => '🧪', 'business' => '📋'];
    foreach ($modes as $m => $icon) {
        $cls = ($m === $mode) ? ' active ' . $m : ' ' . $m;
        echo "      <button class=\"mode-switcher__btn{$cls}\" data-mode=\"{$m}\" title=\"" . ucfirst($m) . " Mode\">{$icon}</button>\n";
    }
    echo "    </div>\n";
    // User chip
    echo "    <div class=\"user-chip\" onclick=\"window.location='profile.php'\" title=\"Profile\">\n";
    echo "      <div class=\"user-chip__avatar\" style=\"background:{$avatarColor}\">{$initials}</div>\n";
    echo "      <span>" . htmlspecialchars($user['display_name']) . "</span>\n";
    echo "    </div>\n";
    echo "  </div>\n";
    echo "</header>\n";
}

// ── App Shell Close (close .app + scripts) ───────────────────────
function appShellClose(array $scripts = []): void
{
    $defaultScripts = [
        'assets/js/common.js',
        'assets/js/themes.js',
        'assets/js/modes.js',
    ];
    // Merge defaults + page scripts, preserving order and removing duplicates
    $seen = [];
    $allScripts = [];
    foreach (array_merge($defaultScripts, $scripts) as $s) {
        if (!isset($seen[$s])) {
            $seen[$s] = true;
            $allScripts[] = $s;
        }
    }
    echo "</div><!-- .app -->\n";
    echo "<div id=\"toastContainer\" class=\"toast-container\"></div>\n";
    echo "<div id=\"arcadeBanner\"></div>\n";
    echo "<div id=\"arcadeOverlay\" aria-hidden=\"true\"></div>\n";
    // Clock timezone configuration dialog
    echo "<div class=\"modal-overlay\" id=\"clockConfigModal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"clockConfigTitle\">\n";
    echo "  <div class=\"modal glass clock-config-modal\">\n";
    echo "    <div class=\"modal__header\">\n";
    echo "      <span id=\"clockConfigTitle\">🕐 World Clocks</span>\n";
    echo "      <button class=\"btn-icon\" onclick=\"Modal.close('clockConfigModal')\" title=\"Close\">✕</button>\n";
    echo "    </div>\n";
    echo "    <div class=\"modal__body\">\n";
    echo "      <p class=\"clock-config-modal__hint\">Choose a timezone for each of your three clocks.</p>\n";
    echo "      <div class=\"clock-config-modal__rows\" id=\"clockConfigRows\"></div>\n";
    echo "    </div>\n";
    echo "    <div class=\"modal__footer\">\n";
    echo "      <button class=\"btn btn-primary\" id=\"clockConfigSave\">Save</button>\n";
    echo "      <button class=\"btn\" onclick=\"Modal.close('clockConfigModal')\">Cancel</button>\n";
    echo "    </div>\n";
    echo "  </div>\n";
    echo "</div>\n";
    foreach ($allScripts as $s) {
        echo "<script src=\"{$s}\" defer></script>\n";
    }
    echo "</body>\n</html>\n";
}

// ── Subheader with stats ─────────────────────────────────────────
function appSubheader(array $user, array $stats = [], string $extraHtml = ''): void
{
    $mode = getUserPref($user['id'], 'mode', 'lab');
    $modeLabels = [
        'arcade' => ['label' => 'Arcade Mode', 'icon' => '🎮'],
        'lab' => ['label' => 'Laboratory Mode', 'icon' => '🧪'],
        'business' => ['label' => 'Business Mode', 'icon' => '📋'],
    ];
    $ml = $modeLabels[$mode] ?? $modeLabels['lab'];
    echo "<div class=\"subheader\">\n";
    echo "  <div class=\"subheader__stats\">\n";
    echo "    <span class=\"mode-badge {$mode}\">{$ml['icon']} {$ml['label']}</span>\n";
    foreach ($stats as $label => $value) {
        echo "    <span class=\"stat-chip\"><span>{$label}</span><span class=\"stat-chip__value\">{$value}</span></span>\n";
    }
    echo "  </div>\n";
    echo "  <div class=\"subheader__controls\">\n";
    if ($extraHtml)
        echo $extraHtml;
    echo "  </div>\n";
    echo "</div>\n";
}

// ── JSON helper ──────────────────────────────────────────────────
function jsonOut(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}