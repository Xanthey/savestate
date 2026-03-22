<?php
/**
 * vault.php — SaveState v2 Historical Vault Browser
 */
require_once __DIR__ . '/common.php';
$user = requireLogin();
$conf = loadConf();

$vaultStats = dbOne(
  'SELECT COUNT(*) AS total, SUM(solved) AS solved, SUM(escalated) AS escalated
     FROM tickets WHERE user_id=?',
  [$user['id']]
);

pageHead('Vault');
appShellOpen($user, 'vault.php');
appSubheader($user, [
  'Total' => number_format($vaultStats['total'] ?? 0),
  'Solved' => number_format($vaultStats['solved'] ?? 0),
  'Escalated' => number_format($vaultStats['escalated'] ?? 0),
]);
?>

<div class="data-page">

  <!-- Toolbar -->
  <div class="data-toolbar">
    <div class="search-bar">
      <span class="search-bar__icon">🔍</span>
      <input type="search" id="vaultSearch" placeholder="Search all tickets…" autocomplete="off">
    </div>

    <!-- Filters -->
    <select id="filterSolved" class="select" title="Filter by solved status">
      <option value="">All Statuses</option>
      <option value="1">Solved</option>
      <option value="0">Unsolved</option>
    </select>

    <select id="filterMethod" class="select" title="Filter by contact method">
      <option value="">All Methods</option>
      <?php foreach ($conf['dropdowns']['contact_method']['options'] as $opt): ?>
        <option><?= htmlspecialchars($opt) ?></option>
      <?php endforeach; ?>
    </select>

    <select id="filterReason" class="select" title="Filter by reason">
      <option value="">All Reasons</option>
      <?php foreach ($conf['dropdowns']['reason_for_contact']['options'] as $opt): ?>
        <option><?= htmlspecialchars($opt) ?></option>
      <?php endforeach; ?>
    </select>

    <input type="date" id="filterFrom" class="input" title="From date" placeholder="From">
    <input type="date" id="filterTo" class="input" title="To date" placeholder="To">

    <select id="filterSort" class="select" title="Sort">
      <option value="date_desc">Newest First</option>
      <option value="date_asc">Oldest First</option>
      <option value="ticket_asc">Ticket # ↑</option>
      <option value="ticket_desc">Ticket # ↓</option>
      <option value="solved">Solved First</option>
    </select>

    <button class="btn" id="btnExportVault" title="Export current filtered results as CSV">Export CSV</button>
    <button class="btn" id="btnExportJSON" title="Export today's entries as JSON">Export Today JSON</button>
    <button class="btn" id="btnExportCSV" title="Export today's entries as CSV">Export Today CSV</button>
    <button class="btn" id="btnImportJSON" title="Import a JSON or CSV file">Import</button>
    <input id="fileInput" type="file" accept=".json,.csv" hidden>
  </div>

  <!-- Table -->
  <div class="data-table-wrap glass">
    <table class="data-table" id="vaultTable">
      <thead>
        <tr>
          <th>Ticket #</th>
          <th>Date</th>
          <th>Reason</th>
          <th>Device</th>
          <th>Method</th>
          <th>Status</th>
          <th class="notes-cell">Notes</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="vaultBody">
        <tr>
          <td colspan="8" style="text-align:center;padding:2rem;color:var(--text-faint)">Loading vault…</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  <div class="pagination" id="pagination"></div>

</div>

<script>
  window.SS_CONFIG = <?= json_encode(['userId' => $user['id']]) ?>;
</script>

<?php appShellClose(['assets/js/common.js', 'assets/js/themes.js', 'assets/js/modes.js', 'assets/js/vault.js']); ?>