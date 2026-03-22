<?php
/**
 * entries.php — SaveState v2 Today's Entries View
 */
require_once __DIR__ . '/common.php';
$user = requireLogin();
$conf = loadConf();

$date = $_GET['date'] ?? date('Y-m-d');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))
  $date = date('Y-m-d');

// Stats for this date
$total = dbOne('SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND session_date=?', [$user['id'], $date])['c'] ?? 0;
$solved = dbOne('SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND session_date=? AND solved=1', [$user['id'], $date])['c'] ?? 0;
$esc = dbOne('SELECT COUNT(*) AS c FROM tickets WHERE user_id=? AND session_date=? AND escalated=1', [$user['id'], $date])['c'] ?? 0;

// Recent session dates for date picker
$dates = dbAll(
  'SELECT DISTINCT session_date FROM tickets WHERE user_id=? ORDER BY session_date DESC LIMIT 30',
  [$user['id']]
);

pageHead('Today\'s Entries');
appShellOpen($user, 'entries.php');
appSubheader($user, [
  'Date' => $date,
  'Total' => $total,
  'Solved' => $solved,
  'Escalated' => $esc,
], '<input type="date" id="datePicker" value="' . htmlspecialchars($date) . '" class="input" style="color:var(--text);">');
?>

<div class="data-page">

  <!-- Toolbar -->
  <div class="data-toolbar">
    <div class="search-bar">
      <span class="search-bar__icon">🔍</span>
      <input type="search" id="searchInput" placeholder="Filter today's entries…" autocomplete="off">
    </div>
    <button class="btn" id="btnExportJSON">Export JSON</button>
    <button class="btn" id="btnExportCSV">Export CSV</button>
    <button class="btn btn-primary" onclick="window.location='app.php'">+ New Entry</button>
  </div>

  <!-- Table -->
  <div class="data-table-wrap glass">
    <table class="data-table" id="entriesTable">
      <thead>
        <tr>
          <th data-sort="ticket_number">Ticket # <span class="sort-arrow"></span></th>
          <th data-sort="reason_for_contact">Reason <span class="sort-arrow"></span></th>
          <th data-sort="type_of_device">Device <span class="sort-arrow"></span></th>
          <th data-sort="contact_method">Method <span class="sort-arrow"></span></th>
          <th data-sort="plan_type">Plan <span class="sort-arrow"></span></th>
          <th data-sort="solved">Status <span class="sort-arrow"></span></th>
          <th class="notes-cell">Notes Preview</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="entriesBody">
        <tr>
          <td colspan="8" style="text-align:center;padding:2rem;color:var(--text-faint)">Loading…</td>
        </tr>
      </tbody>
    </table>
  </div>

</div>

<script>
  window.SS_CONFIG = <?= json_encode(['userId' => $user['id'], 'date' => $date]) ?>;
</script>

<?php appShellClose(['assets/js/common.js', 'assets/js/themes.js', 'assets/js/modes.js', 'assets/js/entries-view.js']); ?>