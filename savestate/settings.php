<?php
/**
 * settings.php — SaveState v2 Application Settings
 * Contains: Search Algorithm tuning, Known Issues / Heads Up manager.
 * Profile, Arcade Progress and Session now live in profile.php.
 */
require_once __DIR__ . '/common.php';
$user = requireLogin();
$conf = loadConf();

// ── Fetch Known Issues tags + keywords for auto-detection seeding ──
$kiTerms = [];
try {
  $kiRows = dbAll(
    "SELECT tag, title, keywords FROM known_issues
      WHERE active = 1 AND (user_id = ? OR user_id = 0)",
    [$user['id']]
  );
  foreach ($kiRows as $ki) {
    if (!empty($ki['tag']))
      $kiTerms[] = trim($ki['tag']);
    if (!empty($ki['title']))
      $kiTerms[] = trim($ki['title']);
    if (!empty($ki['keywords'])) {
      foreach (preg_split('/[\s,;|]+/', $ki['keywords']) as $kw) {
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

pageHead('Settings');
appShellOpen($user, 'settings.php');
appSubheader($user);
?>

<div class="data-page">

  <!-- Profile link banner -->
  <div style="display:flex;align-items:center;justify-content:space-between;
              margin-bottom:0.25rem;padding:0.6rem 0.9rem;
              background:rgba(var(--accent-rgb,58,141,222),0.07);
              border:1px solid rgba(var(--accent-rgb,58,141,222),0.18);
              border-radius:var(--radius)">
    <span style="font-size:0.83rem;color:var(--text-muted)">
      Looking for your profile, avatar, or session options?
    </span>
    <a href="profile.php" class="btn btn-sm" style="white-space:nowrap">
      👤 Go to Profile
    </a>
  </div>

  <!-- ── Search Algorithm ─────────────────────────────────────────── -->
  <section class="panel glass" id="sectionSearchAlgo">
    <div class="panel__header collapsible-header" onclick="toggleSection('searchAlgo')"
      style="cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between">
      <span>🔍 Search Algorithm</span>
      <span class="collapse-chevron" id="chevronSearchAlgo"
        style="font-size:0.85rem;color:var(--text-muted);transition:transform 0.2s">▼</span>
    </div>
    <div class="collapsible-body" id="bodySearchAlgo">
      <div class="panel__body" style="display:flex;flex-direction:column;gap:1.25rem">

        <p style="font-size:0.83rem;color:var(--text-muted);line-height:1.6;margin:0">
          Control how the fuzzy search weights your notes. The system automatically
          detects high-signal patterns like radio call letters, frequencies, OS names,
          version numbers, and error codes — and also matches against your active
          Known Issues tags and keywords in real time.
        </p>

        <!-- Auto-detection badges -->
        <div style="display:flex;flex-direction:column;gap:0.65rem">

          <!-- Pattern detectors -->
          <div>
            <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.07em;
                        text-transform:uppercase;color:var(--text-muted);margin-bottom:0.45rem">
              ⚡ Pattern Detectors (always active)
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem">
              <?php
              $autoTags = [
                'Radio Call Letters' => 'WKRQ, KABC…',
                'Frequencies' => '101.9 FM, 1200 AM…',
                'OS Names' => 'Windows 11, macOS…',
                'Version Numbers' => 'v3.0.1, iOS 17…',
                'Error Codes' => '0x80004005, ERR_…',
                'CamelCase Apps' => 'QuickBooks, PowerShell…',
                'Acronyms' => 'VPN, DNS, SMTP…',
                'ID Tokens' => 'TKT-12345, REF#…',
              ];
              foreach ($autoTags as $tag => $example):
                ?>
                <span title="<?= htmlspecialchars($example) ?>" style="font-size:0.75rem;background:rgba(var(--accent-rgb,58,141,222),0.12);
                             color:var(--accent);border:1px solid rgba(var(--accent-rgb,58,141,222),0.25);
                             border-radius:20px;padding:0.2rem 0.65rem;cursor:default">
                  <?= htmlspecialchars($tag) ?>
                </span>
              <?php endforeach; ?>
            </div>
          </div>

          <!-- Known Issues seed terms -->
          <div>
            <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.07em;
                        text-transform:uppercase;color:var(--text-muted);margin-bottom:0.45rem">
              ⚠ Known Issues &amp; Heads Up Keywords
              <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:0.72rem;
                           color:var(--text-faint);margin-left:0.5rem">(auto-synced from your active issues)</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem" id="kiTermBadges">
              <?php if (empty($kiTerms)): ?>
                <span style="font-size:0.78rem;color:var(--text-faint)">
                  No active Known Issues found — add some below to populate this.
                </span>
              <?php else: ?>
                <?php foreach (array_slice($kiTerms, 0, 40) as $kt): ?>
                  <span style="font-size:0.75rem;background:rgba(245,166,35,0.10);
                               color:var(--warning);border:1px solid rgba(245,166,35,0.25);
                               border-radius:20px;padding:0.2rem 0.65rem;cursor:default" title="From Known Issues">
                    <?= htmlspecialchars($kt) ?>
                  </span>
                <?php endforeach; ?>
                <?php if (count($kiTerms) > 40): ?>
                  <span style="font-size:0.75rem;color:var(--text-faint);padding:0.2rem 0.4rem">
                    +<?= count($kiTerms) - 40 ?> more
                  </span>
                <?php endif; ?>
              <?php endif; ?>
            </div>
          </div>

        </div><!-- auto-detection rows -->

        <!-- Boost + Suppress side by side -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">

          <!-- Boost Terms -->
          <div>
            <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.07em;
                        text-transform:uppercase;color:var(--accent-2);margin-bottom:0.5rem">
              ▲ Boost Terms
            </div>
            <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 0.6rem">
              Words/phrases that always rank higher when found in notes.
              Good for product names, internal tools, known software titles.
            </p>
            <div id="boostList" style="display:flex;flex-wrap:wrap;gap:0.4rem;min-height:2rem;margin-bottom:0.6rem">
              <span style="font-size:0.78rem;color:var(--text-faint)">Loading…</span>
            </div>
            <div style="display:flex;gap:0.5rem">
              <input id="boostInput" type="text" class="input" placeholder="e.g. Salesforce"
                style="flex:1;font-size:0.82rem" maxlength="200">
              <button class="btn btn-sm" onclick="addAlgoTerm('boost')">Add</button>
            </div>
          </div>

          <!-- Suppress Terms -->
          <div>
            <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.07em;
                        text-transform:uppercase;color:var(--warning);margin-bottom:0.5rem">
              ▼ Suppress Terms
            </div>
            <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 0.6rem">
              Phrases that appear in nearly every note and cause noisy matches.
              These are stripped out before the search query is built.
            </p>
            <div id="suppressList" style="display:flex;flex-wrap:wrap;gap:0.4rem;min-height:2rem;margin-bottom:0.6rem">
              <span style="font-size:0.78rem;color:var(--text-faint)">Loading…</span>
            </div>
            <div style="display:flex;gap:0.5rem">
              <input id="suppressInput" type="text" class="input" placeholder="e.g. EU states"
                style="flex:1;font-size:0.82rem" maxlength="200">
              <button class="btn btn-sm" onclick="addAlgoTerm('suppress')">Add</button>
            </div>
          </div>

        </div><!-- boost/suppress grid -->

        <p style="font-size:0.75rem;color:var(--text-faint);margin:0">
          💡 Tip: Radio call letters and frequencies are auto-detected by pattern — no need
          to add individual stations. Suppress terms work best for your company's specific
          boilerplate phrases. Known Issues keywords are automatically included whenever
          those issues are active.
        </p>

      </div>
    </div>
  </section>

  <!-- ── Known Issues / Heads Up ──────────────────────────────────── -->
  <section class="panel glass" id="sectionKnownIssues">
    <div class="panel__header collapsible-header" onclick="toggleSection('knownIssues')"
      style="cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:space-between">
      <span>⚠ Known Issues &amp; Heads Up</span>
      <span class="collapse-chevron" id="chevronKnownIssues"
        style="font-size:0.85rem;color:var(--text-muted);transition:transform 0.2s">▼</span>
    </div>
    <div class="collapsible-body" id="bodyKnownIssues">
      <div class="panel__body" style="padding-top:0.5rem">

        <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 0.85rem">
          These will appear as live alerts when you type matching content in the Notes field during entry.
        </p>

        <!-- Toolbar -->
        <div class="data-toolbar" style="margin-bottom:0.75rem">
          <button class="btn btn-primary" id="btnNewIssue">+ New Issue</button>
          <button class="btn" id="btnImportIssues" title="Import issues from CSV or JSON">⬆ Import</button>
          <button class="btn" id="btnExportIssues" title="Export all issues to CSV">⬇ Export CSV</button>

          <!-- Multi-select delete controls — shown only when rows are checked -->
          <div id="bulkDeleteBar" style="display:none;align-items:center;gap:0.5rem;margin-left:auto">
            <span id="bulkCountLabel" style="font-size:0.8rem;color:var(--text-muted)">0 selected</span>
            <button class="btn btn-danger btn-sm" id="btnBulkDelete">🗑 Delete Selected</button>
            <button class="btn btn-sm" id="btnBulkClear">✕ Clear</button>
          </div>

          <input type="file" id="issueFileInput" accept=".csv,.json" style="display:none">
        </div>

        <!-- Table -->
        <div class="data-table-wrap glass">
          <table class="data-table" id="issuesTable">
            <thead>
              <tr>
                <th style="width:2rem;text-align:center">
                  <input type="checkbox" id="issueSelectAll" title="Select all" style="cursor:pointer">
                </th>
                <th>Tag</th>
                <th>Title</th>
                <th>Description</th>
                <th>Keywords</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="issuesBody">
              <tr>
                <td colspan="6" style="text-align:center;padding:2rem;color:var(--text-faint)">Loading…</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </section>

</div><!-- .data-page -->

<!-- Known Issue Edit Modal -->
<div id="issueModal" class="modal-overlay">
  <div class="modal glass">
    <div class="modal__header">
      <span id="issueModalTitle">New Known Issue</span>
      <button class="btn-icon" onclick="Modal.close('issueModal')">✕</button>
    </div>
    <div class="modal__body">
      <input type="hidden" id="issueId">
      <div class="field">
        <label for="issueTag">Tag (short code, e.g. PODCAST-NOPLAY)</label>
        <input type="text" id="issueTag" placeholder="PODCAST-NOPLAY" style="font-family:var(--font-mono)">
      </div>
      <div class="field">
        <label for="issueTitle">Title *</label>
        <input type="text" id="issueTitle" placeholder="Podcast not playing for some users" required>
      </div>
      <div class="field">
        <label for="issueDesc">Description / How to Handle</label>
        <textarea id="issueDesc" style="min-height:100px"
          placeholder="What to tell the customer, steps to take, tag to add to ticket…"></textarea>
      </div>
      <div class="field">
        <label for="issueKeywords">Keywords (comma-separated for fuzzy matching)</label>
        <input type="text" id="issueKeywords" placeholder="podcast, play, audio, stream, not loading">
      </div>
    </div>
    <div class="modal__footer">
      <button class="btn btn-primary" id="btnSaveIssue">Save</button>
      <button class="btn" onclick="Modal.close('issueModal')">Cancel</button>
    </div>
  </div>
</div>

<!-- Issues Import Preview Modal -->
<div id="issueImportModal" class="modal-overlay">
  <div class="modal glass" style="max-width:680px;width:95%">
    <div class="modal__header">
      <span>⬆ Import Known Issues</span>
      <button class="btn-icon" onclick="Modal.close('issueImportModal')">✕</button>
    </div>
    <div class="modal__body">
      <p style="font-size:0.83rem;color:var(--text-muted);margin-bottom:0.75rem">
        Preview below. Duplicate tags (exact match) will be skipped automatically.
      </p>
      <div id="importPreviewInfo" style="font-size:0.82rem;color:var(--accent-2);margin-bottom:0.5rem"></div>
      <div style="max-height:320px;overflow-y:auto;border-radius:var(--radius-sm);border:1px solid var(--border)">
        <table class="data-table" style="font-size:0.76rem">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Title</th>
              <th>Description (preview)</th>
              <th>Keywords</th>
            </tr>
          </thead>
          <tbody id="importPreviewBody"></tbody>
        </table>
      </div>
    </div>
    <div class="modal__footer">
      <button class="btn btn-primary" id="btnConfirmImport">Import All</button>
      <button class="btn" onclick="Modal.close('issueImportModal')">Cancel</button>
    </div>
  </div>
</div>

<!-- Bulk delete confirm modal -->
<div id="bulkDeleteModal" class="modal-overlay">
  <div class="modal glass" style="max-width:420px;width:95%">
    <div class="modal__header">
      <span>🗑 Confirm Delete</span>
      <button class="btn-icon" onclick="Modal.close('bulkDeleteModal')">✕</button>
    </div>
    <div class="modal__body">
      <p style="font-size:0.9rem;color:var(--text)" id="bulkDeleteConfirmMsg">
        Delete the selected issues? This cannot be undone.
      </p>
    </div>
    <div class="modal__footer">
      <button class="btn btn-danger" id="btnBulkDeleteConfirm">Delete</button>
      <button class="btn" onclick="Modal.close('bulkDeleteModal')">Cancel</button>
    </div>
  </div>
</div>

<script>
  // KI terms injected server-side for SearchFilter to consume
  window.SS_KI_TERMS = <?= json_encode($kiTerms, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
</script>

<?php appShellClose([
  'assets/js/common.js',
  'assets/js/themes.js',
  'assets/js/modes.js',
  'assets/js/settings.js',
]); ?>