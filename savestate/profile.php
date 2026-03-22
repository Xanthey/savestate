<?php
/**
 * profile.php — SaveState v2 User Profile
 * Shows: Profile card, Arcade Progress, Session info.
 * Settings (Search Algorithm, Known Issues) live in settings.php.
 */
require_once __DIR__ . '/common.php';
$user = requireLogin();
$conf = loadConf();

$msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $display = trim($_POST['display_name'] ?? '');
  $color   = $_POST['avatar_color'] ?? '';
  if ($display) {
    dbExec(
      'UPDATE users SET display_name=?, avatar_color=? WHERE id=?',
      [$display, $color, $user['id']]
    );
    $_SESSION['display_name'] = $display;
    $_SESSION['avatar_color'] = $color;
    $user['display_name'] = $display;
    $user['avatar_color'] = $color;
    $msg = 'Profile updated.';
  }
}

$arcade = dbOne('SELECT * FROM arcade_progress WHERE user_id=?', [$user['id']]);

pageHead('Profile');
appShellOpen($user, 'profile.php');
appSubheader($user);
?>

<div class="data-page">

  <?php if ($msg): ?>
    <div class="toast ok" style="pointer-events:none;width:100%;max-width:none;margin-bottom:0">
      ✓ <?= htmlspecialchars($msg) ?>
    </div>
  <?php endif; ?>

  <!-- Settings link banner -->
  <div style="display:flex;align-items:center;justify-content:space-between;
              margin-bottom:0.25rem;padding:0.6rem 0.9rem;
              background:rgba(var(--accent-rgb,58,141,222),0.07);
              border:1px solid rgba(var(--accent-rgb,58,141,222),0.18);
              border-radius:var(--radius)">
    <span style="font-size:0.83rem;color:var(--text-muted)">
      Looking for Search Algorithm tuning or Known Issues?
    </span>
    <a href="settings.php" class="btn btn-sm btn-primary" style="white-space:nowrap">
      ⚙ Go to Settings
    </a>
  </div>

  <!-- Top row: Profile + Arcade side by side -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;align-items:start">

    <!-- Profile Card -->
    <section class="panel glass" style="margin:0">
      <div class="panel__header">
        <span>👤 <?= htmlspecialchars($conf['lab_specimen_label'] ?? 'Profile') ?></span>
      </div>
      <div class="panel__body">
        <form method="POST" style="display:flex;flex-direction:column;gap:0.75rem">

          <div style="display:flex;align-items:center;gap:1rem;margin-bottom:0.5rem">
            <div id="avatarPreview" class="user-chip__avatar"
                 style="width:60px;height:60px;font-size:1.4rem;
                        background:<?= htmlspecialchars($user['avatar_color']) ?>">
              <?= strtoupper(substr($user['display_name'], 0, 2)) ?>
            </div>
            <div>
              <div style="font-size:1rem;font-weight:600"><?= htmlspecialchars($user['display_name']) ?></div>
              <div style="font-size:0.8rem;color:var(--text-muted);font-family:var(--font-mono)">
                @<?= htmlspecialchars($user['username']) ?>
              </div>
            </div>
          </div>

          <div class="field">
            <label for="displayName">Display Name</label>
            <input type="text" id="displayName" name="display_name"
              value="<?= htmlspecialchars($user['display_name']) ?>">
          </div>

          <div class="field">
            <label>Avatar Color</label>
            <div class="color-row" style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <?php
              $colors = ['#3a8dde','#e4002b','#00c84a','#ff00cc','#ffb300','#a060ff','#00f0ff','#ff8040','#22d362','#e67e22','#7a8fa8'];
              foreach ($colors as $c):
              ?>
                <div onclick="selectColor('<?= $c ?>')"
                     data-color="<?= $c ?>"
                     style="width:28px;height:28px;border-radius:50%;background:<?= $c ?>;
                            cursor:pointer;border:2px solid <?= $c === $user['avatar_color'] ? '#fff' : 'transparent' ?>;
                            transition:transform 0.15s,border-color 0.15s"
                     id="swatch-<?= ltrim($c,'#') ?>" title="<?= $c ?>"></div>
              <?php endforeach; ?>
            </div>
            <input type="hidden" name="avatar_color" id="avatarColorInput"
              value="<?= htmlspecialchars($user['avatar_color']) ?>">
          </div>

          <button type="submit" class="btn btn-primary" style="align-self:flex-start">
            Update Profile
          </button>
        </form>
      </div>
    </section>

    <!-- Arcade Progress -->
    <?php if ($arcade): ?>
      <section class="panel glass" style="margin:0">
        <div class="panel__header"><span>🎮 Arcade Progress</span></div>
        <div class="panel__body"
             style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:0.85rem">
          <?php
          $sts = [
            ['Level',        $arcade['level'] ?? 1],
            ['XP',           ($arcade['xp'] ?? 0) . ' / ' . (($arcade['level'] ?? 1) * 100)],
            ['Total Tickets',number_format($arcade['total_tickets'] ?? 0)],
            ['Solved',       number_format($arcade['total_solved'] ?? 0)],
            ['Streak Days',  $arcade['streak_days'] ?? 0],
          ];
          foreach ($sts as [$label, $val]):
          ?>
            <div class="glass-subtle" style="border-radius:var(--radius);padding:0.75rem;text-align:center">
              <div style="font-size:1.4rem;font-weight:700;color:var(--mode-arcade);font-family:var(--font-display)">
                <?= htmlspecialchars($val) ?>
              </div>
              <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;
                          letter-spacing:0.06em;font-family:var(--font-display)"><?= $label ?></div>
            </div>
          <?php endforeach; ?>
        </div>
      </section>
    <?php else: ?>
      <div style="margin:0"></div>
    <?php endif; ?>

  </div><!-- top row grid -->

  <!-- Session -->
  <section class="panel glass">
    <div class="panel__header"><span>🔐 Session</span></div>
    <div class="panel__body">
      <p style="font-size:0.83rem;color:var(--text-muted)">
        Logged in as <strong><?= htmlspecialchars($user['username']) ?></strong>.
        Logging out will return you to the profile selector.
      </p>
      <a href="logout.php" class="btn btn-danger">Log Out</a>
    </div>
  </section>

</div>

<script>
  function selectColor(color) {
    document.getElementById('avatarColorInput').value = color;
    document.getElementById('avatarPreview').style.background = color;
    document.querySelectorAll('[id^="swatch-"]').forEach(el => {
      el.style.borderColor = 'transparent';
    });
    const el = document.getElementById('swatch-' + color.replace('#', ''));
    if (el) el.style.borderColor = '#fff';
  }
</script>

<?php appShellClose(['assets/js/common.js', 'assets/js/themes.js', 'assets/js/modes.js']); ?>
