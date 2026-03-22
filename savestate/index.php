<?php
/**
 * index.php — SaveState v2 Login / Profile selector
 * local  — profile card grid, one-click login (no passwords)
 * public — standard username + password form; no profile list exposed
 */
session_start();

if (!empty($_SESSION['user_id'])) {
    header('Location: app.php');
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/common.php';

// ── OOBE Guard ───────────────────────────────────────────────────
ensureSystemTables();
if (getSystemSetting('oobe_complete') !== '1') {
    header('Location: setup.php');
    exit;
}

$publicMode = isPublicMode();
$error      = '';
$activeTab  = 'login'; // 'login' | 'register'

// ── Handle POST ──────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action   = $_POST['action']           ?? '';
    $username = trim($_POST['username']    ?? '');
    $display  = trim($_POST['display_name'] ?? $username);
    $color    = $_POST['avatar_color']     ?? '#3a8dde';
    $password = $_POST['password']         ?? '';
    $confirm  = $_POST['confirm']          ?? '';

    // ── Login ────────────────────────────────────────────────────
    if ($action === 'select' && $username) {
        $user = dbOne('SELECT * FROM users WHERE username = ?', [$username]);
        if ($user) {
            if ($publicMode) {
                $hash = $user['password_hash'] ?? '';
                if (!$hash || !password_verify($password, $hash)) {
                    $error     = 'Incorrect username or password.';
                    $activeTab = 'login';
                    goto render;
                }
            }
            $_SESSION['user_id']      = $user['id'];
            $_SESSION['username']     = $user['username'];
            $_SESSION['display_name'] = $user['display_name'] ?: $user['username'];
            $_SESSION['avatar_color'] = $user['avatar_color'];
            dbExec('UPDATE users SET last_login = NOW() WHERE id = ?', [$user['id']]);
            header('Location: app.php');
            exit;
        } else {
            $error     = $publicMode ? 'Incorrect username or password.' : 'Profile not found.';
            $activeTab = 'login';
            goto render;
        }
    }

    // ── Register / Create profile ────────────────────────────────
    if ($action === 'create' && $username) {
        $activeTab = 'register';
        if (!preg_match('/^[a-z0-9_\-]{2,32}$/i', $username)) {
            $error = 'Username: 2–32 characters, letters/numbers/dash/underscore only.';
        } elseif ($publicMode && strlen($password) < 6) {
            $error = 'Password must be at least 6 characters.';
        } elseif ($publicMode && $password !== $confirm) {
            $error = 'Passwords do not match.';
        } else {
            try {
                if ($publicMode) {
                    $hash = password_hash($password, PASSWORD_DEFAULT);
                    dbExec(
                        'INSERT INTO users (username, display_name, avatar_color, password_hash) VALUES (?,?,?,?)',
                        [$username, $display ?: $username, $color, $hash]
                    );
                } else {
                    dbExec(
                        'INSERT INTO users (username, display_name, avatar_color) VALUES (?,?,?)',
                        [$username, $display ?: $username, $color]
                    );
                }
                $newId = dbLastId();
                dbExec('INSERT INTO arcade_progress (user_id) VALUES (?)', [$newId]);
                $_SESSION['user_id']      = $newId;
                $_SESSION['username']     = $username;
                $_SESSION['display_name'] = $display ?: $username;
                $_SESSION['avatar_color'] = $color;
                header('Location: app.php');
                exit;
            } catch (\PDOException $e) {
                $error = 'That username is already taken.';
            }
        }
    }
}

render:
$profiles = dbAll('SELECT id, username, display_name, avatar_color, last_login FROM users ORDER BY last_login DESC, id ASC');
$conf     = json_decode(file_get_contents(__DIR__ . '/company.conf'), true);
$appTitle = $conf['app_title']    ?? 'SaveState';
$appSub   = $conf['app_subtitle'] ?? 'Contact Intelligence System';
$colors   = ['#3a8dde','#e4002b','#00c84a','#ff00cc','#ffb300','#a060ff','#00f0ff','#ff8040','#22d362'];
?>
<!DOCTYPE html>
<html lang="en" class="theme-iheart-dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= htmlspecialchars($appTitle) ?> — Login</title>
  <link rel="icon" type="image/svg+xml" href="assets/img/beaker.svg">
  <link rel="stylesheet" href="assets/css/core.css">
  <link rel="stylesheet" href="assets/css/layout.css">
  <link rel="stylesheet" href="assets/css/components.css">
  <style>
    body { display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .login-scene {
      position: relative; z-index: 1; width: 100%;
      display: flex; align-items: center; justify-content: center;
      padding: 2rem;
    }

    /* ── Network badge ── */
    .network-badge {
      display: inline-flex; align-items: center; gap: 0.35rem;
      font-size: 0.68rem; font-family: var(--font-mono);
      text-transform: uppercase; letter-spacing: 0.06em;
      padding: 0.2em 0.6em; border-radius: 999px;
    }
    .network-badge.local  { background: rgba(0,200,74,0.12);  color: #00c84a; }
    .network-badge.public { background: rgba(255,179,0,0.12); color: #ffb300; }

    /* ── Tab bar (public mode) ── */
    .login-tabs {
      display: flex; gap: 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1.25rem;
    }
    .login-tab {
      flex: 1; padding: 0.6rem 1rem;
      background: none; border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted); font-size: 0.88rem;
      font-family: var(--font-display); font-weight: 600;
      cursor: pointer; letter-spacing: 0.03em;
      transition: color 0.15s, border-color 0.15s;
    }
    .login-tab:hover { color: var(--text); }
    .login-tab.active {
      color: var(--accent, #3a8dde);
      border-bottom-color: var(--accent, #3a8dde);
    }

    /* ── Form panels ── */
    .login-panel { display: none; flex-direction: column; gap: 0.85rem; }
    .login-panel.active { display: flex; }

    /* ── Password field wrapper ── */
    .pw-field-wrap { position: relative; }
    .pw-field-wrap input { width: 100%; padding-right: 2.8rem; box-sizing: border-box; }
    .pw-toggle {
      position: absolute; right: 0.75rem; top: 50%;
      transform: translateY(-50%);
      background: none; border: none; cursor: pointer;
      color: var(--text-faint); padding: 0.2rem;
      font-size: 1rem; line-height: 1;
      transition: color 0.15s;
    }
    .pw-toggle:hover { color: var(--text-muted); }

    /* Strength bar */
    .pw-strength {
      height: 3px; border-radius: 2px;
      background: var(--border); overflow: hidden;
      margin-top: 0.35rem; display: none;
    }
    .pw-strength.visible { display: block; }
    .pw-strength__bar {
      height: 100%; border-radius: 2px; width: 0%;
      transition: width 0.3s, background 0.3s;
    }

    /* Match indicator */
    .pw-match {
      font-size: 0.72rem; font-family: var(--font-mono);
      margin-top: 0.3rem; display: none;
    }
    .pw-match.visible { display: block; }
    .pw-match.ok   { color: #00c84a; }
    .pw-match.fail { color: #e4002b; }

    /* ── Error banner ── */
    .login-error {
      display: flex; align-items: center; gap: 0.5rem;
      background: rgba(228,0,43,0.1);
      border: 1px solid rgba(228,0,43,0.28);
      border-radius: var(--radius, 0.5rem);
      color: #e4002b; font-size: 0.82rem;
      padding: 0.6rem 0.85rem;
    }

    /* ── Local mode profile list ── */
    .new-profile-form { display: none; flex-direction: column; gap: 0.75rem; }
    .new-profile-form.visible { display: flex; }
    .color-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .color-swatch {
      width: 28px; height: 28px; border-radius: 50%;
      border: 2px solid transparent; cursor: pointer;
      transition: transform 0.15s, border-color 0.15s;
    }
    .color-swatch:hover { transform: scale(1.15); }
    .color-swatch.selected { border-color: #fff; }
  </style>
</head>
<body>
  <div class="bg-scene" aria-hidden="true">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>

  <div class="login-scene">
    <div class="login-card glass">

      <!-- Logo + Title -->
      <div class="login-card__logo">
        <img src="assets/img/beaker-animated.svg" alt="SaveState logo">
      </div>
      <div class="login-card__title"><?= htmlspecialchars($appTitle) ?></div>
      <div class="login-card__subtitle"><?= htmlspecialchars($appSub) ?></div>

      <div style="text-align:center; margin-bottom:0.25rem;">
        <?php if ($publicMode): ?>
          <span class="network-badge public">🌐 Public Network</span>
        <?php else: ?>
          <span class="network-badge local">🏠 Local Network</span>
        <?php endif; ?>
      </div>

<?php if ($publicMode): ?>
      <!-- ════════════════════════════════════════════════
           PUBLIC MODE — tabbed sign-in / create account
           ════════════════════════════════════════════════ -->

      <div class="login-tabs" role="tablist">
        <button class="login-tab <?= $activeTab === 'login'    ? 'active' : '' ?>"
                id="tabLogin"    role="tab" onclick="switchTab('login')">Sign In</button>
        <button class="login-tab <?= $activeTab === 'register' ? 'active' : '' ?>"
                id="tabRegister" role="tab" onclick="switchTab('register')">Create Account</button>
      </div>

      <?php if ($error): ?>
        <div class="login-error">⚠ <?= htmlspecialchars($error) ?></div>
      <?php endif; ?>

      <!-- Sign In -->
      <div class="login-panel <?= $activeTab === 'login' ? 'active' : '' ?>" id="panelLogin">
        <form method="POST" autocomplete="on">
          <input type="hidden" name="action" value="select">
          <div style="display:flex; flex-direction:column; gap:0.85rem;">

            <div class="field">
              <label for="loginUsername">Username</label>
              <input type="text" id="loginUsername" name="username"
                     placeholder="your_username"
                     autocomplete="username" required
                     value="<?= $activeTab === 'login' ? htmlspecialchars($_POST['username'] ?? '') : '' ?>">
            </div>

            <div class="field">
              <label for="loginPassword">Password</label>
              <div class="pw-field-wrap">
                <input type="password" id="loginPassword" name="password"
                       placeholder="••••••••"
                       autocomplete="current-password" required>
                <button type="button" class="pw-toggle"
                        id="toggleLoginPw"
                        title="Show/hide password"
                        aria-label="Toggle password visibility">👁</button>
              </div>
            </div>

            <button type="submit" class="btn btn-primary"
                    style="width:100%; justify-content:center; margin-top:0.25rem;">
              Sign In →
            </button>
          </div>
        </form>
      </div>

      <!-- Create Account -->
      <div class="login-panel <?= $activeTab === 'register' ? 'active' : '' ?>" id="panelRegister">
        <form method="POST" autocomplete="off" id="registerForm">
          <input type="hidden" name="action" value="create">
          <div style="display:flex; flex-direction:column; gap:0.85rem;">

            <div class="field">
              <label for="regUsername">Username</label>
              <input type="text" id="regUsername" name="username"
                     placeholder="e.g., alex_j"
                     pattern="[a-zA-Z0-9_\-]{2,32}" required
                     value="<?= $activeTab === 'register' ? htmlspecialchars($_POST['username'] ?? '') : '' ?>">
              <span style="font-size:0.7rem; color:var(--text-faint); font-family:var(--font-mono);">
                2–32 chars · letters, numbers, - or _
              </span>
            </div>

            <div class="field">
              <label for="regDisplay">
                Display Name
                <span style="color:var(--text-faint); font-size:0.75rem;">(optional)</span>
              </label>
              <input type="text" id="regDisplay" name="display_name"
                     placeholder="Alex Johnson"
                     value="<?= $activeTab === 'register' ? htmlspecialchars($_POST['display_name'] ?? '') : '' ?>">
            </div>

            <div class="field">
              <label for="regPassword">Password</label>
              <div class="pw-field-wrap">
                <input type="password" id="regPassword" name="password"
                       placeholder="Min. 6 characters"
                       autocomplete="new-password"
                       minlength="6" required>
                <button type="button" class="pw-toggle"
                        id="toggleRegPw"
                        title="Show/hide password"
                        aria-label="Toggle password visibility">👁</button>
              </div>
              <div class="pw-strength" id="pwStrength">
                <div class="pw-strength__bar" id="pwStrengthBar"></div>
              </div>
            </div>

            <div class="field">
              <label for="regConfirm">Confirm Password</label>
              <div class="pw-field-wrap">
                <input type="password" id="regConfirm" name="confirm"
                       placeholder="Repeat password"
                       autocomplete="new-password"
                       minlength="6" required>
                <button type="button" class="pw-toggle"
                        id="toggleCfmPw"
                        title="Show/hide password"
                        aria-label="Toggle password visibility">👁</button>
              </div>
              <div class="pw-match" id="pwMatch"></div>
            </div>

            <div class="field">
              <label>Avatar Color</label>
              <div class="color-row">
                <?php foreach ($colors as $c): ?>
                  <div class="color-swatch <?= $c === '#3a8dde' ? 'selected' : '' ?>"
                       style="background:<?= $c ?>"
                       data-color="<?= $c ?>"
                       title="<?= $c ?>"></div>
                <?php endforeach; ?>
                <input type="hidden" name="avatar_color" id="regColorInput" value="#3a8dde">
              </div>
            </div>

            <button type="submit" class="btn btn-primary"
                    style="width:100%; justify-content:center; margin-top:0.25rem;">
              Create Account & Enter
            </button>

          </div>
        </form>
      </div>

<?php else: ?>
      <!-- ════════════════════════════════════════════════
           LOCAL MODE — profile cards + new profile form
           ════════════════════════════════════════════════ -->

      <?php if ($error): ?>
        <div class="login-error">⚠ <?= htmlspecialchars($error) ?></div>
      <?php endif; ?>

      <?php if (!empty($profiles)): ?>
        <div class="login-card__profiles">
          <?php foreach ($profiles as $p): ?>
            <form method="POST" style="margin:0">
              <input type="hidden" name="action"   value="select">
              <input type="hidden" name="username" value="<?= htmlspecialchars($p['username']) ?>">
              <button type="submit" class="profile-btn">
                <div class="profile-btn__avatar"
                     style="background:<?= htmlspecialchars($p['avatar_color']) ?>">
                  <?= strtoupper(substr($p['display_name'] ?: $p['username'], 0, 2)) ?>
                </div>
                <div class="profile-btn__info">
                  <div class="profile-btn__name">
                    <?= htmlspecialchars($p['display_name'] ?: $p['username']) ?>
                  </div>
                  <div class="profile-btn__meta">
                    @<?= htmlspecialchars($p['username']) ?>
                    <?php if ($p['last_login']): ?>
                      · <?= date('M j', strtotime($p['last_login'])) ?>
                    <?php endif; ?>
                  </div>
                </div>
                <span style="color:var(--text-faint); font-size:0.8rem;">→</span>
              </button>
            </form>
          <?php endforeach; ?>
        </div>
        <div class="login-divider">or</div>
      <?php endif; ?>

      <button class="btn btn-ghost" id="newProfileToggle"
              style="width:100%; justify-content:center; border:1px dashed var(--border);">
        + New Profile
      </button>

      <form method="POST" id="newProfileForm" class="new-profile-form">
        <input type="hidden" name="action" value="create">

        <div class="field">
          <label for="usernameInput">Username</label>
          <input type="text" id="usernameInput" name="username"
                 placeholder="e.g., alex_j" autocomplete="off"
                 required pattern="[a-zA-Z0-9_\-]{2,32}">
        </div>

        <div class="field">
          <label for="displayInput">Display Name</label>
          <input type="text" id="displayInput" name="display_name"
                 placeholder="Alex Johnson" autocomplete="off">
        </div>

        <div class="field">
          <label>Avatar Color</label>
          <div class="color-row">
            <?php foreach ($colors as $c): ?>
              <div class="color-swatch <?= $c === '#3a8dde' ? 'selected' : '' ?>"
                   style="background:<?= $c ?>"
                   data-color="<?= $c ?>"
                   title="<?= $c ?>"></div>
            <?php endforeach; ?>
            <input type="hidden" name="avatar_color" id="avatarColorInput" value="#3a8dde">
          </div>
        </div>

        <button type="submit" class="btn btn-primary"
                style="width:100%; justify-content:center;">
          Create Profile & Enter
        </button>
      </form>

<?php endif; ?>

    </div><!-- .login-card -->
  </div><!-- .login-scene -->

  <script>
    // Restore theme
    const t = localStorage.getItem('ss_theme') || 'iheart-dark';
    document.documentElement.className = 'theme-' + t;

<?php if ($publicMode): ?>
    // ── Tab switching ──────────────────────────────────────────────
    function switchTab(tab) {
      document.getElementById('tabLogin').classList.toggle('active',    tab === 'login');
      document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
      document.getElementById('panelLogin').classList.toggle('active',    tab === 'login');
      document.getElementById('panelRegister').classList.toggle('active', tab === 'register');
      const panel = tab === 'login'
        ? document.getElementById('panelLogin')
        : document.getElementById('panelRegister');
      const first = panel.querySelector('input:not([type=hidden])');
      if (first) setTimeout(() => first.focus(), 40);
    }

    // ── Show / hide password ───────────────────────────────────────
    function makePwToggle(inputId, btnId) {
      document.getElementById(btnId).addEventListener('click', function() {
        const inp = document.getElementById(inputId);
        const hidden = inp.type === 'password';
        inp.type = hidden ? 'text' : 'password';
        this.textContent = hidden ? '🙈' : '👁';
      });
    }
    makePwToggle('loginPassword', 'toggleLoginPw');
    makePwToggle('regPassword',   'toggleRegPw');
    makePwToggle('regConfirm',    'toggleCfmPw');

    // ── Password strength bar ──────────────────────────────────────
    document.getElementById('regPassword').addEventListener('input', function() {
      const val  = this.value;
      const bar  = document.getElementById('pwStrengthBar');
      const wrap = document.getElementById('pwStrength');
      if (!val) { wrap.classList.remove('visible'); updateMatch(); return; }
      wrap.classList.add('visible');
      let score = 0;
      if (val.length >= 6)            score++;
      if (val.length >= 10)           score++;
      if (/[A-Z]/.test(val))          score++;
      if (/[0-9]/.test(val))          score++;
      if (/[^a-zA-Z0-9]/.test(val))  score++;
      const pct    = Math.min(100, score * 20);
      const cols   = ['#e4002b','#e4002b','#ffb300','#ffb300','#00c84a','#00c84a'];
      bar.style.width      = pct + '%';
      bar.style.background = cols[score] || '#00c84a';
      updateMatch();
    });

    // ── Confirm match indicator ────────────────────────────────────
    document.getElementById('regConfirm').addEventListener('input', updateMatch);
    function updateMatch() {
      const pw  = document.getElementById('regPassword').value;
      const cfm = document.getElementById('regConfirm').value;
      const el  = document.getElementById('pwMatch');
      if (!cfm) { el.className = 'pw-match'; return; }
      if (pw === cfm) {
        el.className = 'pw-match visible ok';
        el.textContent = '✓ Passwords match';
      } else {
        el.className = 'pw-match visible fail';
        el.textContent = '✗ Passwords do not match';
      }
    }

    // ── Client-side submit guard ───────────────────────────────────
    document.getElementById('registerForm').addEventListener('submit', function(e) {
      const pw  = document.getElementById('regPassword').value;
      const cfm = document.getElementById('regConfirm').value;
      if (pw !== cfm) {
        e.preventDefault();
        document.getElementById('pwMatch').className = 'pw-match visible fail';
        document.getElementById('pwMatch').textContent = '✗ Passwords do not match';
        document.getElementById('regConfirm').focus();
      }
    });

    // ── Color swatches (register) ──────────────────────────────────
    document.querySelectorAll('.color-swatch').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        el.classList.add('selected');
        document.getElementById('regColorInput').value = el.dataset.color;
      });
    });

<?php else: ?>
    // ── Local mode: new profile toggle ────────────────────────────
    document.getElementById('newProfileToggle').addEventListener('click', () => {
      const form = document.getElementById('newProfileForm');
      form.classList.toggle('visible');
      if (form.classList.contains('visible')) {
        document.getElementById('usernameInput').focus();
      }
    });

    // Color swatches (local)
    document.querySelectorAll('.color-swatch').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        el.classList.add('selected');
        document.getElementById('avatarColorInput').value = el.dataset.color;
      });
    });
<?php endif; ?>
  </script>
</body>
</html>
