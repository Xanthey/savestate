/**
 * entries-view.js — SaveState v2 Today's Entries Table
 * Handles: loading, sorting, filtering, inline delete, date navigation
 */

'use strict';

let allEntries = [];
let sortCol    = 'exported_at';
let sortDir    = 'desc';
let filterQ    = '';

async function loadEntries(date) {
    const tbody = document.getElementById('entriesBody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-faint)">Loading…</td></tr>';
    try {
        allEntries = await API.getEntries(date);
        renderTable();
    } catch(e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--danger)">${escHtml(e.message)}</td></tr>`;
    }
}

function getFilteredSorted() {
    let rows = [...allEntries];

    if (filterQ) {
        const q = filterQ.toLowerCase();
        rows = rows.filter(r =>
            Object.values(r).some(v => String(v).toLowerCase().includes(q))
        );
    }

    rows.sort((a, b) => {
        let va = a[sortCol] ?? '';
        let vb = b[sortCol] ?? '';
        if (typeof va === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
}

function renderTable() {
    const tbody = document.getElementById('entriesBody');
    if (!tbody) return;
    const rows = getFilteredSorted();

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__msg">No entries for this date</div></div></td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(e => `
      <tr data-id="${e.id}">
        <td style="font-family:var(--font-mono);color:var(--accent)">${escHtml(e.ticket_number || '—')}</td>
        <td>${escHtml(e.reason_for_contact || '—')}</td>
        <td>${escHtml(e.type_of_device || '—')}</td>
        <td><span class="badge badge-method">${escHtml(e.contact_method || '—')}</span></td>
        <td>${escHtml(e.plan_type || '—')}</td>
        <td>
          <span class="badge ${e.solved ? 'badge-solved' : 'badge-unsolved'}">${e.solved ? 'Solved' : 'Open'}</span>
          ${e.escalated ? '<span class="badge badge-escalated" title="Escalated">ESC</span>' : ''}
          ${(e.image_count > 0) ? `<span class="img-indicator" title="${e.image_count} image${e.image_count !== 1 ? 's' : ''} attached">📷</span>` : ''}
        </td>
        <td class="notes-cell" title="${escHtml(e.notes_preview || e.notes || '')}">
          ${escHtml((e.notes_preview || e.notes || '').slice(0, 80))}${(e.notes || '').length > 80 ? '…' : ''}
        </td>
        <td style="white-space:nowrap">
          <button class="btn btn-icon btn-sm" title="View" onclick="openTicket(${e.id})">👁</button>
          <button class="btn btn-icon btn-sm" title="Delete" onclick="deleteEntry(${e.id}, this)">🗑</button>
        </td>
      </tr>`).join('');

    // Update sort arrow indicators
    document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (th.dataset.sort === sortCol) {
            th.classList.add('sorted');
            if (arrow) arrow.textContent = sortDir === 'asc' ? '▲' : '▼';
        } else {
            th.classList.remove('sorted');
            if (arrow) arrow.textContent = '';
        }
    });
}

async function deleteEntry(id, btn) {
    if (!confirm('Delete this entry?')) return;
    try {
        btn.disabled = true;
        await API.deleteEntry(id);
        allEntries = allEntries.filter(e => e.id !== id);
        renderTable();
        Toast.ok('Entry deleted.');
    } catch(e) {
        Toast.err('Delete failed: ' + e.message);
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const date = window.SS_CONFIG?.date || new Date().toISOString().slice(0, 10);
    loadEntries(date);

    // Date picker
    document.getElementById('datePicker')?.addEventListener('change', (e) => {
        const d = e.target.value;
        if (d) {
            window.location.href = `entries.php?date=${d}`;
        }
    });

    // Search filter
    document.getElementById('searchInput')?.addEventListener('input', debounce(e => {
        filterQ = e.target.value.trim();
        renderTable();
    }, 200));

    // Column sort
    document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (sortCol === col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            else { sortCol = col; sortDir = 'asc'; }
            renderTable();
        });
    });

    // Export
    document.getElementById('btnExportJSON')?.addEventListener('click', () => {
        downloadJSON(getFilteredSorted(), `entries-${date}.json`);
    });
    document.getElementById('btnExportCSV')?.addEventListener('click', () => {
        downloadCSV(getFilteredSorted(), `entries-${date}.csv`);
    });
});