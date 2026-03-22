<?php
/**
 * setup.php — SaveState v2 First-Run Setup (OOBE)
 * Only accessible before oobe_complete is set in system_settings.
 * Admin chooses Local Network (no passwords) or Public Network (passwords required).
 */
session_start();
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/common.php';

// Ensure system_settings table exists
ensureSystemTables();

// If OOBE already done, send to login
if (getSystemSetting('oobe_complete') === '1') {
    header('Location: index.php');
    exit;
}

$conf = json_decode(file_get_contents(__DIR__ . '/company.conf'), true);
$appTitle = $conf['app_title'] ?? 'SaveState';
$appSub   = $conf['app_subtitle'] ?? 'Contact Intelligence System';
?>
<!DOCTYPE html>
<html lang="en" class="theme-iheart-dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= htmlspecialchars($appTitle) ?> — First-Time Setup</title>
  <link rel="icon" type="image/svg+xml" href="assets/img/beaker.svg">
  <link rel="stylesheet" href="assets/css/core.css">
  <link rel="stylesheet" href="assets/css/layout.css">
  <link rel="stylesheet" href="assets/css/components.css">
  <style>
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .setup-scene {
      position: relative;
      z-index: 1;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .setup-card {
      width: 100%;
      max-width: 640px;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 2.5rem;
      border-radius: var(--radius-lg, 1rem);
    }
    .setup-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      text-align: center;
    }
    .setup-step__logo img {
      width: 64px;
      height: 64px;
    }
    .setup-step__title {
      font-size: 1.6rem;
      font-weight: 700;
      font-family: var(--font-display);
      color: var(--text);
    }
    .setup-step__subtitle {
      font-size: 0.9rem;
      color: var(--text-muted);
    }
    .setup-divider {
      border: none;
      border-top: 1px solid var(--border);
      margin: 0;
    }
    .setup-welcome {
      font-size: 0.88rem;
      color: var(--text-muted);
      line-height: 1.7;
      text-align: center;
    }
    .setup-welcome strong {
      color: var(--text);
    }

    /* Mode cards */
    .mode-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 480px) {
      .mode-cards { grid-template-columns: 1fr; }
    }
    .mode-card {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 1.25rem;
      border-radius: var(--radius, 0.5rem);
      border: 2px solid var(--border);
      background: var(--surface-subtle, rgba(255,255,255,0.04));
      cursor: pointer;
      transition: border-color 0.18s, background 0.18s, transform 0.15s;
      text-align: left;
      position: relative;
    }
    .mode-card:hover {
      border-color: var(--accent, #3a8dde);
      background: var(--surface-hover, rgba(58,141,222,0.08));
      transform: translateY(-2px);
    }
    .mode-card.selected {
      border-color: var(--accent, #3a8dde);
      background: var(--surface-hover, rgba(58,141,222,0.1));
    }
    .mode-card.selected::after {
      content: '✓';
      position: absolute;
      top: 0.7rem;
      right: 0.9rem;
      font-size: 0.85rem;
      color: var(--accent, #3a8dde);
      font-weight: 700;
    }
    .mode-card__icon {
      font-size: 2rem;
      line-height: 1;
    }
    .mode-card__title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text);
      font-family: var(--font-display);
    }
    .mode-card__desc {
      font-size: 0.78rem;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .mode-card__badge {
      display: inline-block;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      padding: 0.2em 0.55em;
      border-radius: 999px;
      margin-top: 0.2rem;
      font-family: var(--font-mono);
    }
    .badge-green  { background: rgba(0,200,74,0.15);  color: #00c84a; }
    .badge-yellow { background: rgba(255,179,0,0.15); color: #ffb300; }

    .setup-actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    #confirmBtn {
      width: 100%;
      justify-content: center;
      font-size: 1rem;
      padding: 0.8rem 1.5rem;
    }
    #confirmBtn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .setup-notice {
      font-size: 0.72rem;
      color: var(--text-faint);
      text-align: center;
      font-family: var(--font-mono);
    }
    .spinner {
      display: none;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-left: 0.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="bg-scene" aria-hidden="true">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>

  <div class="setup-scene">
    <div class="setup-card glass">

      <!-- Header -->
      <div class="setup-step">
        <div class="setup-step__logo">
          <img src="assets/img/beaker-animated.svg" alt="SaveState logo">
        </div>
        <div class="setup-step__title">Welcome to <?= htmlspecialchars($appTitle) ?></div>
        <div class="setup-step__subtitle">First-Time Setup</div>
      </div>

      <hr class="setup-divider">

      <!-- Welcome blurb -->
      <p class="setup-welcome">
        <?= htmlspecialchars($appTitle) ?> is a <strong>contact &amp; support intelligence system</strong>
        that lets your team track tickets, manage a vault of contacts, and stay on top of
        known issues — all in one place.<br><br>
        Before you begin, choose how this installation will be accessed.
        <strong>This setting is permanent</strong> and determines whether user accounts
        require passwords to log in.
      </p>

      <hr class="setup-divider">

      <!-- Mode selection -->
      <div class="mode-cards" id="modeCards">

        <div class="mode-card" data-mode="local" onclick="selectMode('local')">
          <div class="mode-card__icon">🏠</div>
          <div class="mode-card__title">Local Network</div>
          <div class="mode-card__desc">
            Best for home labs, internal offices, or trusted private networks.
            Users log in by selecting their profile — <strong>no passwords required</strong>.
          </div>
          <span class="mode-card__badge badge-green">No Passwords</span>
        </div>

        <div class="mode-card" data-mode="public" onclick="selectMode('public')">
          <div class="mode-card__icon">🌐</div>
          <div class="mode-card__title">Public Network</div>
          <div class="mode-card__desc">
            Best for internet-facing or shared servers. Every user account
            requires a <strong>password</strong> to log in, protecting your data.
          </div>
          <span class="mode-card__badge badge-yellow">Passwords Required</span>
        </div>

      </div>

      <!-- Actions -->
      <div class="setup-actions">
        <button class="btn btn-primary" id="confirmBtn" disabled onclick="confirmSetup()">
          <span id="btnLabel">Choose a mode to continue</span>
          <div class="spinner" id="btnSpinner"></div>
        </button>
        <div class="setup-notice">
          ⚠ This choice cannot be changed after setup without a database reset.
        </div>
      </div>

    </div>
  </div>

  <script>
    const t = localStorage.getItem('ss_theme') || 'iheart-dark';
    document.documentElement.className = 'theme-' + t;

    let chosenMode = null;

    function selectMode(mode) {
      chosenMode = mode;
      document.querySelectorAll('.mode-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.mode === mode);
      });
      const btn = document.getElementById('confirmBtn');
      const label = document.getElementById('btnLabel');
      btn.disabled = false;
      label.textContent = mode === 'local'
        ? 'Continue with Local Network (no passwords)'
        : 'Continue with Public Network (passwords required)';
    }

    async function confirmSetup() {
      if (!chosenMode) return;
      const btn = document.getElementById('confirmBtn');
      const spinner = document.getElementById('btnSpinner');
      const label = document.getElementById('btnLabel');
      btn.disabled = true;
      spinner.style.display = 'inline-block';
      label.textContent = 'Saving…';

      try {
        const resp = await fetch('api/setup.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ network_mode: chosenMode })
        });
        const data = await resp.json();
        if (data.status === 'ok') {
          label.textContent = '✓ Setup complete! Redirecting…';
          spinner.style.display = 'none';
          setTimeout(() => { window.location.href = 'index.php'; }, 900);
        } else {
          label.textContent = 'Error: ' + (data.error ?? 'Unknown error');
          btn.disabled = false;
          spinner.style.display = 'none';
        }
      } catch (e) {
        label.textContent = 'Network error. Please try again.';
        btn.disabled = false;
        spinner.style.display = 'none';
      }
    }
  </script>
</body>
</html>
