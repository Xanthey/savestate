<?php
/**
 * app.php — SaveState v2 Main Entry Form
 */
require_once __DIR__ . '/common.php';
$user = requireLogin();
$conf = loadConf();
$mode = getUserPref($user['id'], 'mode', 'lab');

// Count today's entries for this user
$todayCount = dbOne(
  'SELECT COUNT(*) AS cnt FROM tickets WHERE user_id=? AND session_date=CURDATE()',
  [$user['id']]
)['cnt'] ?? 0;
$totalSolved = dbOne(
  'SELECT COUNT(*) AS cnt FROM tickets WHERE user_id=? AND session_date=CURDATE() AND solved=1',
  [$user['id']]
)['cnt'] ?? 0;

// Arcade progress
$arcade = dbOne('SELECT * FROM arcade_progress WHERE user_id=?', [$user['id']]);

// Mode-specific labels
$modeText = [
  'arcade' => [
    'panel_contact' => '⚔ Contact Stats',
    'panel_notes' => '📜 Battle Notes',
    'btn_save' => '⚡ LOG CASE',
    'btn_reset' => '🔄 RESET FORM',
    'status_saved' => '🎮 CASE ACQUIRED! +XP',
  ],
  'lab' => [
    'panel_contact' => '🧪 Specimen Data',
    'panel_notes' => '📋 Observation Log',
    'btn_save' => 'Log Specimen',
    'btn_reset' => 'Clear Apparatus',
    'status_saved' => '✅ Specimen logged to the vault.',
  ],
  'business' => [
    'panel_contact' => 'Contact Details',
    'panel_notes' => 'Notes',
    'btn_save' => 'Save Record',
    'btn_reset' => 'Clear Form',
    'status_saved' => 'Record saved successfully.',
  ],
];
$ml = $modeText[$mode] ?? $modeText['lab'];

pageHead('Entry');
?>

<body class="theme-<?= getUserPref($user['id'], 'theme', $conf['themes']['default'] ?? 'dark') ?>"
  data-mode="<?= $mode ?>" data-user="<?= $user['id'] ?>">

  <div class="bg-scene" aria-hidden="true">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>

  <?php appShellOpen($user, 'app.php'); ?>

  <?php appSubheader($user, [
    'Today' => $todayCount,
    'Solved' => $totalSolved,
  ]); ?>

  <!-- Arcade HUD (only visible in arcade mode) -->
  <div class="arcade-hud <?= $mode !== 'arcade' ? 'hidden' : '' ?>" id="arcadeHud">
    <span class="arcade-hud__level" id="arcadeLevel">
      LV <?= (int) ($arcade['level'] ?? 1) ?>
    </span>
    <div class="arcade-hud__xp" title="Experience Points">
      <div class="arcade-hud__xp-fill" id="xpFill" style="width:0%"></div>
    </div>
    <span class="arcade-hud__combo" id="arcadeCombo">0× Combo</span>
  </div>

  <!-- Main Content -->
  <main class="main">

    <!-- Left column: Contact Details + Heads Up stacked -->
    <div class="left-col" id="leftCol">

      <!-- Left: Contact Details Panel -->
      <section class="panel glass" id="contactPanel">
        <div class="panel__header">
          <span><?= htmlspecialchars($ml['panel_contact']) ?></span>
          <span class="panel__header-icon">📝</span>
        </div>
        <div class="panel__body dense" id="contactFields">

          <!-- Ticket # -->
          <div class="field">
            <label for="ticket"><?= htmlspecialchars($conf['fields']['ticket_label'] ?? 'Ticket #') ?></label>
            <input type="text" id="ticket" name="ticket"
              placeholder="<?= htmlspecialchars($conf['fields']['ticket_placeholder'] ?? 'e.g., 123456') ?>"
              autocomplete="off">
          </div>

          <!-- Dynamic dropdowns from company.conf -->
          <?php foreach ($conf['dropdowns'] as $fieldId => $fieldDef): ?>
            <div class="field">
              <label for="<?= htmlspecialchars($fieldId) ?>"><?= htmlspecialchars($fieldDef['label']) ?></label>
              <select id="<?= htmlspecialchars($fieldId) ?>" name="<?= htmlspecialchars($fieldId) ?>">
                <?php foreach ($fieldDef['options'] as $opt): ?>
                  <option><?= htmlspecialchars($opt) ?></option>
                <?php endforeach; ?>
              </select>
            </div>
          <?php endforeach; ?>

          <!-- Location -->
          <div class="field">
            <label for="location"><?= htmlspecialchars($conf['fields']['location_label'] ?? 'Location') ?></label>
            <input type="text" id="location" name="location"
              placeholder="<?= htmlspecialchars($conf['fields']['location_placeholder'] ?? 'Country / Region') ?>"
              autocomplete="off">
          </div>

          <!-- Dynamic checkboxes from company.conf -->
          <div class="check-group" id="checkboxGroup">
            <?php foreach ($conf['checkboxes'] as $cb): ?>
              <label class="check-row">
                <input type="checkbox" id="<?= htmlspecialchars($cb['id']) ?>" name="<?= htmlspecialchars($cb['id']) ?>"
                  <?= $cb['default'] ? 'checked' : '' ?>>
                <span><?= htmlspecialchars($cb['label']) ?></span>
              </label>
            <?php endforeach; ?>
          </div>

          <!-- Solved -->
          <label class="check-row check-row--solved">
            <input type="checkbox" id="<?= htmlspecialchars($conf['solved_field']['id'] ?? 'solved') ?>" name="solved">
            <span><?= htmlspecialchars($conf['solved_field']['label'] ?? 'Solved') ?></span>
          </label>

        </div>
      </section>

      <!-- Heads Up Panel — hidden until issues are found -->
      <section class="panel glass panel--headsup" id="headsUpPanel" style="display:none">
        <div class="panel__header">
          <span>⚠ Heads Up</span>
          <span class="panel__header-icon" id="headsUpCount"></span>
        </div>
        <div class="panel__body" id="headsUpList" style="gap:0.5rem">
        </div>
      </section>

    </div><!-- /.left-col -->

    <!-- Right column: Notes on top, Today + Fuzzy below -->
    <div class="right-col" id="rightCol">

      <!-- Notes Panel -->
      <section class="panel glass panel--notes" id="notesPanel">
        <div class="panel__header">
          <span><?= htmlspecialchars($ml['panel_notes']) ?></span>
          <span class="panel__header-icon">📓</span>
        </div>
        <div class="panel__body">
          <div class="field quill-field">
            <!-- Toolbar must exist in HTML before Quill initialises -->
            <div id="quillToolbar">
              <span class="ql-formats">
                <button class="ql-bold" title="Bold (Ctrl+B)"></button>
                <button class="ql-italic" title="Italic (Ctrl+I)"></button>
                <button class="ql-underline" title="Underline (Ctrl+U)"></button>
                <button class="ql-strike" title="Strikethrough"></button>
              </span>
              <span class="ql-formats">
                <select class="ql-color" title="Text colour"></select>
                <select class="ql-background" title="Highlight colour"></select>
              </span>
              <span class="ql-formats">
                <button class="ql-list" value="ordered" title="Numbered list"></button>
                <button class="ql-list" value="bullet" title="Bullet list"></button>
                <button class="ql-indent" value="-1" title="Decrease indent"></button>
                <button class="ql-indent" value="+1" title="Increase indent"></button>
              </span>
              <span class="ql-formats">
                <button class="ql-link" title="Insert link"></button>
                <button class="ql-blockquote" title="Blockquote"></button>
                <button class="ql-code-block" title="Code block"></button>
              </span>
              <span class="ql-formats">
                <button class="ql-clean" title="Clear formatting"></button>
              </span>
            </div>
            <!-- Quill mounts here -->
            <div id="notesEditor"
              data-placeholder="<?= htmlspecialchars($conf['fields']['notes_placeholder'] ?? 'Enter case notes here...') ?>">
            </div>
            <!-- Hidden textarea — legacy fallback only -->
            <textarea id="notes" name="notes" style="display:none" aria-hidden="true"></textarea>
          </div>
        </div>
      </section>

      <!-- Lower row: Today's Entries + Fuzzy Panel (side by side) -->
      <div class="lower-panels" id="lowerPanels">

        <!-- Today's Entries -->
        <section class="panel glass panel--today" id="todayPanel">
          <div class="panel__header">
            <span>📋 Today's Entries</span>
            <span class="panel__header-icon" id="todayCountBadge"><?= (int) $todayCount ?></span>
          </div>
          <div class="panel__body" id="todayList" style="gap:0">
            <div class="empty-state">
              <div class="empty-state__icon">📭</div>
              <div class="empty-state__msg">No entries yet today</div>
            </div>
          </div>
        </section>

        <!-- Fuzzy / Similar Tickets — hidden until a match fires -->
        <section class="panel glass panel--fuzzy" id="fuzzyPanel" style="display:none">
          <div class="panel__header">
            <span>🔍 Similar Tickets</span>
            <button class="btn-icon" onclick="closeFuzzyPanel()" title="Close">✕</button>
          </div>
          <div class="panel__body" id="fuzzyResults" style="gap:0.5rem">
            <div class="empty-state">
              <div class="empty-state__msg">Searching…</div>
            </div>
          </div>
        </section>

      </div><!-- /.lower-panels -->

    </div><!-- /.right-col -->

  </main>

  <!-- Footer / Action Bar -->
  <footer class="footer">
    <div class="footer__status" id="statusMsg"></div>

    <div class="footer__actions">
      <button id="btnSave" class="btn btn-primary">
        <?= htmlspecialchars($ml['btn_save']) ?>
      </button>
    </div>

    <div class="footer__actions">
      <button id="btnReset" class="btn btn-danger" title="Clear the form">
        <?= htmlspecialchars($ml['btn_reset']) ?>
      </button>
    </div>
  </footer>

  <!-- Hidden config for JS -->
  <script>
    window.SS_CONFIG = <?= json_encode([
      'userId' => $user['id'],
      'mode' => $mode,
      'modeText' => $modeText,
      'conf' => $conf,
      'arcade' => $arcade,
      'todayCount' => (int) $todayCount,
      'totalSolved' => (int) $totalSolved,
    ]) ?>;
  </script>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.min.js"></script>
  <?php appShellClose(['assets/js/common.js', 'assets/js/themes.js', 'assets/js/modes.js', 'assets/js/rpg.js', 'assets/js/search-filter.js', 'assets/js/entries.js']); ?>