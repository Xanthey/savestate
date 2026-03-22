<?php
require_once __DIR__ . '/common.php';
$user = requireLogin();
$conf = loadConf();
$appTitle = $conf['app_title'] ?? 'SaveState';

pageHead('About');
appShellOpen($user, 'about.php');
appSubheader($user);
?>

<div class="data-page" style="max-width:700px">
  <section class="panel glass">
    <div class="panel__header"><span>🧪 About <?= htmlspecialchars($appTitle) ?></span></div>
    <div class="panel__body" style="gap:1rem">

      <div style="display:flex;align-items:center;gap:1rem">
        <img src="assets/img/beaker-animated.svg" style="width:64px;height:64px" alt="SaveState logo">
        <div>
          <div style="font-family:var(--font-display);font-size:1.6rem;font-weight:700;
                      color:var(--accent-2)"><?= htmlspecialchars($appTitle) ?> v2</div>
          <div style="color:var(--text-muted);font-size:0.85rem">
            <?= htmlspecialchars($conf['app_subtitle'] ?? 'Contact Intelligence System') ?>
          </div>
        </div>
      </div>

      <div style="color:var(--text-muted);font-size:0.86rem;line-height:1.7">
        <p><?= htmlspecialchars($appTitle) ?> is a modular, session-aware customer support CRM built for
           speed and adaptability. It runs on a PHP + MySQL backend with a glassmorphic frontend
           designed to be both fun and functional.</p>
        <p style="margin-top:0.75rem">Configuration for your company's specific fields and dropdowns
           lives entirely in <code style="font-family:var(--font-mono);color:var(--accent)">company.conf</code>,
           making it easy to repurpose for any support workflow.</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.82rem">
        <?php
        $features = [
            '🧪 Laboratory Mode'   => 'Belmont Labs mad-science verbiage',
            '🎮 Arcade Mode'       => 'RPG leveling, XP, combos, particles',
            '📋 Business Mode'     => 'Clean, no-nonsense, all signal',
            '🔍 Fuzzy Search'      => 'Live ticket + known issue matching',
            '⚠ Heads Up Alerts'   => 'Known issue overlay while you type',
            '🏛 Vault Browser'     => 'Full-text search across all history',
            '🔧 Tools'             => 'Mic, keyboard, mouse, system diagnostics',
            '👤 User Profiles'     => 'Separate vaults and preferences per user',
        ];
        foreach ($features as $name => $desc):
        ?>
          <div class="glass-subtle" style="border-radius:var(--radius-sm);padding:0.5rem 0.75rem">
            <div style="font-weight:600;font-size:0.84rem"><?= htmlspecialchars($name) ?></div>
            <div style="color:var(--text-muted);font-size:0.76rem"><?= htmlspecialchars($desc) ?></div>
          </div>
        <?php endforeach; ?>
      </div>

      <div style="font-size:0.75rem;color:var(--text-faint);border-top:1px solid var(--border);
                  padding-top:0.75rem;font-family:var(--font-mono)">
        Belmont Laboratories · Contact Intelligence Division ·
        Built for the grind, tuned for the arcade.
      </div>

    </div>
  </section>
</div>

<?php appShellClose(['assets/js/common.js','assets/js/themes.js','assets/js/modes.js']); ?>
