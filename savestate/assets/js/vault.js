/**
 * vault.js — SaveState v2 Vault Browser
 * Full-text search, pagination, filter controls, detail modal
 */

'use strict';

let vaultState = {
    q:      '',
    page:   1,
    per:    50,
    sort:   'date_desc',
    solved: '',
    method: '',
    reason: '',
    from:   '',
    to:     '',
    total:  0,
    pages:  1,
};

async function loadVault() {
    const tbody = document.getElementById('vaultBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-faint)">Loading…</td></tr>';

    const params = {
        page:   vaultState.page,
        per:    vaultState.per,
        sort:   vaultState.sort,
    };
    if (vaultState.q)      params.q      = vaultState.q;
    if (vaultState.solved !== '') params.solved = vaultState.solved;
    if (vaultState.method) params.method = vaultState.method;
    if (vaultState.reason) params.reason = vaultState.reason;
    if (vaultState.from)   params.from   = vaultState.from;
    if (vaultState.to)     params.to     = vaultState.to;

    try {
        const data = await API.vaultSearch(params);
        vaultState.total = data.total;
        vaultState.pages = data.pages;
        renderVaultTable(data.rows);
        renderPagination();
    } catch(e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--danger)">${escHtml(e.message)}</td></tr>`;
    }
}

function renderVaultTable(rows) {
    const tbody = document.getElementById('vaultBody');
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-state__icon">🏛</div><div class="empty-state__msg">No records found</div></div></td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(e => `
      <tr style="cursor:pointer" onclick="openTicket(${e.id})" title="View full details">
        <td style="font-family:var(--font-mono);color:var(--accent)">${escHtml(e.ticket_number || '—')}</td>
        <td style="font-family:var(--font-mono);font-size:0.78rem;white-space:nowrap">${fmtDate(e.session_date)}</td>
        <td style="max-width:180px">${escHtml(e.reason_for_contact || '—')}</td>
        <td>${escHtml(e.type_of_device || '—')}</td>
        <td><span class="badge badge-method">${escHtml(e.contact_method || '—')}</span></td>
        <td>
          <span class="badge ${e.solved ? 'badge-solved' : 'badge-unsolved'}">${e.solved ? 'Solved' : 'Open'}</span>
          ${e.escalated ? '<span class="badge badge-escalated">ESC</span>' : ''}
        </td>
        <td class="notes-cell" title="${escHtml(e.notes_preview || '')}">
          ${escHtml((e.notes_preview || '').slice(0, 80))}${(e.notes_preview || '').length >= 80 ? '…' : ''}
        </td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-icon btn-sm" title="Copy notes"
                  onclick="copyNotesFromVault(${e.id})">📋</button>
        </td>
      </tr>`).join('');
}

async function copyNotesFromVault(id) {
    try {
        const ticket = await API.vaultTicket(id);
        await copyText(ticket.notes || '', 'Notes');
    } catch(e) {
        Toast.err('Could not fetch notes: ' + e.message);
    }
}

function renderPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;
    const { page, pages, total, per } = vaultState;

    if (pages <= 1) { container.innerHTML = ''; return; }

    const start = (page - 1) * per + 1;
    const end   = Math.min(page * per, total);

    let html = `<span style="font-size:0.78rem;color:var(--text-muted);margin-right:0.5rem">
                  ${start}–${end} of ${total}
                </span>`;

    html += `<button class="btn btn-sm" ${page <= 1 ? 'disabled' : ''}
                     onclick="goPage(${page - 1})">‹ Prev</button>`;

    // Show limited page range
    const range = 5;
    let lo = Math.max(1, page - Math.floor(range / 2));
    let hi = Math.min(pages, lo + range - 1);
    lo = Math.max(1, hi - range + 1);

    if (lo > 1)     html += `<button class="btn btn-sm" onclick="goPage(1)">1</button><span style="color:var(--text-faint)">…</span>`;
    for (let i = lo; i <= hi; i++) {
        html += `<button class="btn btn-sm ${i === page ? 'current' : ''}" onclick="goPage(${i})">${i}</button>`;
    }
    if (hi < pages) html += `<span style="color:var(--text-faint)">…</span><button class="btn btn-sm" onclick="goPage(${pages})">${pages}</button>`;

    html += `<button class="btn btn-sm" ${page >= pages ? 'disabled' : ''}
                     onclick="goPage(${page + 1})">Next ›</button>`;

    container.innerHTML = html;
}

function goPage(p) {
    vaultState.page = p;
    loadVault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Event wiring ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadVault();

    // Search (debounced)
    document.getElementById('vaultSearch')?.addEventListener('input', debounce(e => {
        vaultState.q    = e.target.value.trim();
        vaultState.page = 1;
        loadVault();
    }, 400));

    // Filters
    const filters = {
        filterSolved: 'solved',
        filterMethod: 'method',
        filterReason: 'reason',
        filterFrom:   'from',
        filterTo:     'to',
        filterSort:   'sort',
    };
    Object.entries(filters).forEach(([elId, key]) => {
        document.getElementById(elId)?.addEventListener('change', (e) => {
            vaultState[key] = e.target.value;
            vaultState.page = 1;
            loadVault();
        });
    });

    // Export CSV — filtered vault results (existing)
    document.getElementById('btnExportVault')?.addEventListener('click', async () => {
        Toast.info('Preparing export…');
        try {
            const data = await API.vaultSearch({
                ...vaultState,
                page: 1,
                per: 5000,
            });
            downloadCSV(data.rows, `vault-export-${new Date().toISOString().slice(0,10)}.csv`);
        } catch(e) {
            Toast.err('Export failed: ' + e.message);
        }
    });

    // Export today's entries as JSON
    document.getElementById('btnExportJSON')?.addEventListener('click', async () => {
        try {
            const entries = await API.getEntries();
            downloadJSON(entries, `savestate-${new Date().toISOString().slice(0,10)}.json`);
        } catch(e) { Toast.err('Export failed: ' + e.message); }
    });

    // Export today's entries as CSV
    document.getElementById('btnExportCSV')?.addEventListener('click', async () => {
        try {
            const entries = await API.getEntries();
            downloadCSV(entries, `savestate-${new Date().toISOString().slice(0,10)}.csv`);
        } catch(e) { Toast.err('Export failed: ' + e.message); }
    });

    // Import JSON vault file
    document.getElementById('btnImportJSON')?.addEventListener('click', () => {
        document.getElementById('fileInput')?.click();
    });
    document.getElementById('fileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ''; // reset so same file can be re-selected

        let entries;
        try {
            entries = await parseImportFile(file);
        } catch (err) {
            Toast.err('Could not read file: ' + err.message);
            return;
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            Toast.warn('No entries found in file.');
            return;
        }

        // Show a persistent progress toast
        const progressToast = Toast.info(`Importing ${entries.length.toLocaleString()} entries…`);

        // Split into chunks of 500 so large vaults don't time out
        const CHUNK = 500;
        const chunks = [];
        for (let i = 0; i < entries.length; i += CHUNK) {
            chunks.push(entries.slice(i, i + CHUNK));
        }

        let totalInserted = 0, totalSkipped = 0, totalErrors = 0;

        try {
            for (let i = 0; i < chunks.length; i++) {
                if (progressToast) {
                    progressToast.querySelector('span:last-child').textContent =
                        `Importing… (${Math.min((i + 1) * CHUNK, entries.length).toLocaleString()} / ${entries.length.toLocaleString()})`;
                }
                const result = await API.importVault(chunks[i]);
                totalInserted += result.inserted ?? 0;
                totalSkipped  += result.skipped  ?? 0;
                totalErrors   += result.errors   ?? 0;
            }

            progressToast?.remove();

            const parts = [`✓ Imported ${totalInserted.toLocaleString()} entries`];
            if (totalSkipped > 0) parts.push(`${totalSkipped.toLocaleString()} skipped (already exist)`);
            if (totalErrors  > 0) parts.push(`${totalErrors} batch errors`);

            totalErrors > 0
                ? Toast.warn(parts.join(' · '))
                : Toast.ok(parts.join(' · '));

            loadVault();

        } catch (err) {
            progressToast?.remove();
            Toast.err('Import failed: ' + err.message);
        }
    });

    // Keyboard shortcut: Ctrl+F → focus search
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('vaultSearch')?.focus();
        }
    });
});