/**
 * settings.js — SaveState v2
 * Handles: collapsible sections, search algorithm terms, known issues manager
 * (Known Issues moved here from tools.js)
 */

'use strict';

// ── Collapsible Sections ──────────────────────────────────────────

/** Collapse state stored in sessionStorage so panels re-open on reload */
const COLLAPSE_KEY = 'ss_settings_collapsed';

function getCollapseState() {
    try { return JSON.parse(sessionStorage.getItem(COLLAPSE_KEY) || '{}'); }
    catch { return {}; }
}

function setCollapseState(state) {
    sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify(state));
}

/**
 * Toggle a collapsible section.
 * @param {string} key - 'searchAlgo' | 'knownIssues'
 */
function toggleSection(key) {
    const body    = document.getElementById('body'    + key.charAt(0).toUpperCase() + key.slice(1));
    const chevron = document.getElementById('chevron' + key.charAt(0).toUpperCase() + key.slice(1));
    if (!body) return;

    const isCollapsed = body.style.display === 'none';
    body.style.display = isCollapsed ? '' : 'none';
    if (chevron) chevron.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';

    const state = getCollapseState();
    if (isCollapsed) { delete state[key]; }
    else             { state[key] = true; }
    setCollapseState(state);
}

/** Apply persisted collapse state on load */
function applyCollapseState() {
    const state = getCollapseState();
    ['searchAlgo', 'knownIssues'].forEach(key => {
        if (state[key]) {
            const cap     = key.charAt(0).toUpperCase() + key.slice(1);
            const body    = document.getElementById('body'    + cap);
            const chevron = document.getElementById('chevron' + cap);
            if (body)    body.style.display = 'none';
            if (chevron) chevron.style.transform = 'rotate(-90deg)';
        }
    });
}

// ── Search Algorithm Terms ────────────────────────────────────────

let algoTerms = { boost: [], suppress: [] };

function renderAlgoTerms() {
    ['boost', 'suppress'].forEach(type => {
        const container = document.getElementById(type + 'List');
        if (!container) return;
        const items = algoTerms[type];
        if (!items.length) {
            container.innerHTML = '<span style="font-size:0.78rem;color:var(--text-faint)">None added yet.</span>';
            return;
        }
        const color = type === 'boost' ? 'var(--accent-2)' : 'var(--warning)';
        container.innerHTML = items.map(item => `
            <span style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.78rem;
                         background:rgba(128,128,128,0.1);border:1px solid rgba(128,128,128,0.2);
                         border-radius:20px;padding:0.2rem 0.5rem 0.2rem 0.65rem">
              <span style="color:${color}">${escHtml(item.term)}</span>
              <button onclick="removeAlgoTerm(${item.id}, '${type}')"
                      style="background:none;border:none;cursor:pointer;font-size:0.85rem;
                             color:var(--text-faint);padding:0;line-height:1" title="Remove">×</button>
            </span>`).join('');
    });
}

async function loadAlgoTerms() {
    try {
        const data = await API.getSearchPrefs();
        algoTerms.boost    = data.boost    || [];
        algoTerms.suppress = data.suppress || [];
        renderAlgoTerms();
    } catch {
        ['boostList', 'suppressList'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<span style="color:var(--danger);font-size:0.78rem">Failed to load.</span>';
        });
    }
}

async function addAlgoTerm(type) {
    const input = document.getElementById(type + 'Input');
    const term  = (input?.value || '').trim();
    if (!term) { Toast.warn('Enter a term first.'); return; }
    try {
        const result = await API.addSearchTerm(type, term);
        algoTerms[type].push({ id: result.id, term: result.term });
        renderAlgoTerms();
        input.value = '';
        Toast.ok(`Added to ${type} list.`);
    } catch(e) {
        Toast.err(e.message || 'Could not add term.');
    }
}

async function removeAlgoTerm(id, type) {
    try {
        await API.removeSearchTerm(id);
        algoTerms[type] = algoTerms[type].filter(t => t.id !== id);
        renderAlgoTerms();
        Toast.ok('Removed.');
    } catch {
        Toast.err('Could not remove term.');
    }
}

// ── Known Issues Manager ──────────────────────────────────────────

let knownIssues      = [];
let selectedIssueIds = new Set();

async function loadIssues() {
    const tbody = document.getElementById('issuesBody');
    if (!tbody) return;
    try {
        knownIssues = await API.getIssues();
        selectedIssueIds.clear();
        renderIssues();
        syncBulkBar();
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--danger)">${escHtml(e.message)}</td></tr>`;
    }
}

function renderIssues() {
    const tbody = document.getElementById('issuesBody');
    if (!tbody) return;

    if (!knownIssues.length) {
        tbody.innerHTML = `<tr><td colspan="6">
          <div class="empty-state">
            <div class="empty-state__icon">💡</div>
            <div class="empty-state__msg">No known issues yet. Add one to enable Heads Up alerts.</div>
          </div></td></tr>`;
        return;
    }

    tbody.innerHTML = knownIssues.map(ki => {
        const checked = selectedIssueIds.has(ki.id) ? ' checked' : '';
        return `
        <tr data-ki-id="${ki.id}">
          <td style="text-align:center;width:2rem">
            <input type="checkbox" class="issue-checkbox" data-id="${ki.id}"${checked}
                   style="cursor:pointer" onchange="toggleIssueSelect(${ki.id}, this.checked)">
          </td>
          <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--warning)">
            ${escHtml(ki.tag || '—')}
          </td>
          <td style="font-weight:600">${escHtml(ki.title)}</td>
          <td style="max-width:240px;font-size:0.78rem;color:var(--text-muted)">
            ${escHtml((ki.description || '').slice(0, 100))}${(ki.description || '').length > 100 ? '…' : ''}
          </td>
          <td style="font-size:0.75rem;color:var(--text-faint);font-family:var(--font-mono)">
            ${escHtml(ki.keywords || '—')}
          </td>
          <td style="white-space:nowrap">
            <button class="btn btn-icon btn-sm" title="Edit"
                    onclick='openIssueModal(${JSON.stringify(ki)})'>✏</button>
            <button class="btn btn-icon btn-sm" title="Delete"
                    onclick="deleteSingleIssue(${ki.id}, this)">🗑</button>
          </td>
        </tr>`;
    }).join('');

    // Sync select-all state
    syncSelectAll();
}

// ── Selection helpers ─────────────────────────────────────────────

function toggleIssueSelect(id, checked) {
    if (checked) { selectedIssueIds.add(id); }
    else         { selectedIssueIds.delete(id); }
    syncSelectAll();
    syncBulkBar();
}

function syncSelectAll() {
    const allBox = document.getElementById('issueSelectAll');
    if (!allBox || !knownIssues.length) return;
    const total   = knownIssues.length;
    const checked = selectedIssueIds.size;
    allBox.indeterminate = checked > 0 && checked < total;
    allBox.checked       = checked === total;
}

function syncBulkBar() {
    const bar   = document.getElementById('bulkDeleteBar');
    const label = document.getElementById('bulkCountLabel');
    const n     = selectedIssueIds.size;
    if (!bar) return;
    if (n > 0) {
        bar.style.display = 'flex';
        if (label) label.textContent = `${n} selected`;
    } else {
        bar.style.display = 'none';
    }
}

function clearSelection() {
    selectedIssueIds.clear();
    document.querySelectorAll('.issue-checkbox').forEach(cb => cb.checked = false);
    syncSelectAll();
    syncBulkBar();
}

// ── Issue CRUD ────────────────────────────────────────────────────

function openIssueModal(ki = null) {
    document.getElementById('issueId').value       = ki?.id          || '';
    document.getElementById('issueTag').value      = ki?.tag         || '';
    document.getElementById('issueTitle').value    = ki?.title       || '';
    document.getElementById('issueDesc').value     = ki?.description || '';
    document.getElementById('issueKeywords').value = ki?.keywords    || '';
    document.getElementById('issueModalTitle').textContent = ki ? 'Edit Known Issue' : 'New Known Issue';
    Modal.open('issueModal');
}

async function saveIssue() {
    const id      = document.getElementById('issueId').value;
    const payload = {
        tag:         document.getElementById('issueTag').value.trim(),
        title:       document.getElementById('issueTitle').value.trim(),
        description: document.getElementById('issueDesc').value.trim(),
        keywords:    document.getElementById('issueKeywords').value.trim(),
        active:      1,
    };
    if (!payload.title) { Toast.warn('Title is required.'); return; }
    try {
        if (id) { await API.updateIssue(parseInt(id), payload); }
        else    { await API.saveIssue(payload); }
        Modal.close('issueModal');
        Toast.ok('Known issue saved.');
        await loadIssues();
    } catch(e) {
        Toast.err('Save failed: ' + e.message);
    }
}

async function deleteSingleIssue(id, btn) {
    if (!confirm('Delete this known issue?')) return;
    btn.disabled = true;
    try {
        await API.deleteIssue(id);
        selectedIssueIds.delete(id);
        Toast.ok('Deleted.');
        await loadIssues();
    } catch(e) {
        Toast.err(e.message);
        btn.disabled = false;
    }
}

// ── Bulk Delete ───────────────────────────────────────────────────

function openBulkDeleteModal() {
    const n   = selectedIssueIds.size;
    const msg = document.getElementById('bulkDeleteConfirmMsg');
    if (msg) msg.textContent = `Delete ${n} selected issue${n !== 1 ? 's' : ''}? This cannot be undone.`;
    Modal.open('bulkDeleteModal');
}

async function executeBulkDelete() {
    const ids = [...selectedIssueIds];
    if (!ids.length) return;

    const btn = document.getElementById('btnBulkDeleteConfirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }

    let deleted = 0, failed = 0;
    for (const id of ids) {
        try {
            await API.deleteIssue(id);
            deleted++;
        } catch {
            failed++;
        }
    }

    Modal.close('bulkDeleteModal');
    if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }

    const msg = `Deleted ${deleted} issue${deleted !== 1 ? 's' : ''}` +
                (failed ? ` (${failed} failed)` : '') + '.';
    failed ? Toast.warn(msg) : Toast.ok(msg);
    await loadIssues();
}

// ── Import / Export ───────────────────────────────────────────────

let _importPending = [];

function parseIssuesCSV(text) {
    // ── RFC 4180 streaming parser ────────────────────────────────────
    // Walks the full text once, character by character.
    // Correctly handles: quoted fields, embedded newlines, "" escaped quotes,
    // CRLF and LF line endings, and tab-delimited files.
    // The previous line-split approach re-scanned accumulated buffers and
    // treated every " as a toggle, which broke on fields containing ""…"".
    function parseAllRows(raw) {
        // Strip leading BOM if present
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

        // Auto-detect delimiter from header line
        const firstNL = raw.indexOf('\n');
        const header  = firstNL === -1 ? raw : raw.slice(0, firstNL);
        const delim   = header.includes('\t') ? '\t' : ',';

        const rows = [];
        let col = '', cols = [], inQ = false, i = 0;
        while (i < raw.length) {
            const ch   = raw[i];
            const next = raw[i + 1];
            if (inQ) {
                if (ch === '"' && next === '"') {
                    // Escaped quote inside quoted field — emit one literal "
                    col += '"'; i += 2; continue;
                } else if (ch === '"') {
                    // Closing quote
                    inQ = false;
                } else {
                    col += ch;
                }
            } else {
                if (ch === '"') {
                    inQ = true;
                } else if (ch === delim) {
                    cols.push(col.trim()); col = '';
                } else if (ch === '\r' && next === '\n') {
                    // CRLF row boundary
                    cols.push(col.trim()); col = '';
                    rows.push(cols); cols = [];
                    i += 2; continue;
                } else if (ch === '\n' || ch === '\r') {
                    // LF or bare CR row boundary
                    cols.push(col.trim()); col = '';
                    rows.push(cols); cols = [];
                } else {
                    col += ch;
                }
            }
            i++;
        }
        // Flush final field/row
        if (col || cols.length) { cols.push(col.trim()); rows.push(cols); }
        return rows;
    }

    const allRows = parseAllRows(text);
    if (allRows.length < 2) return [];

    // Map header names → column indices
    const headers = allRows[0].map(h => h.toLowerCase());
    const ci = name => headers.indexOf(name.toLowerCase());

    const iTag      = ci('zendesk tag')   !== -1 ? ci('zendesk tag')   : ci('tag');
    const iTitle    = ci('issue description') !== -1 ? ci('issue description') : ci('title');
    const iDesc     = ci('agent next steps')  !== -1 ? ci('agent next steps')  : ci('description');
    const iExtra    = ci('work in progress / additional info or resources');
    const iPlatf    = ci('platform');
    const iStatus   = ci('status');
    const iJira     = ci('jira ticket');
    // Direct keywords column — present in SaveState exports, absent in iHR-format imports
    const iKeywords = ci('keywords');

    const issues = [];
    for (const cols of allRows.slice(1)) {
        if (cols.length < 2) continue;

        const tag      = iTag   >= 0 ? (cols[iTag]  || '') : '';
        let   title    = iTitle >= 0 ? (cols[iTitle] || '') : '';
        const platform = iPlatf >= 0 ? (cols[iPlatf] || '') : '';
        if (platform && title) title = `[${platform}] ${title}`;
        if (!title && !tag) continue;

        const step1 = iDesc  >= 0 ? (cols[iDesc]  || '') : '';
        const step2 = iExtra >= 0 ? (cols[iExtra] || '') : '';
        const desc  = [step1, step2].filter(Boolean).join('\n\n---\n').trim();

        // If the file has an explicit keywords column, use it directly.
        // Otherwise derive keywords from iHR metadata columns (platform, status, jira).
        let keywords = '';
        if (iKeywords >= 0 && cols[iKeywords]) {
            keywords = cols[iKeywords];
        } else {
            const kwParts = [];
            if (platform)                                              kwParts.push(platform);
            if (iStatus >= 0 && cols[iStatus])                        kwParts.push(cols[iStatus]);
            if (iJira   >= 0 && cols[iJira] && cols[iJira] !== 'N/A') kwParts.push(cols[iJira]);
            keywords = kwParts.join(', ');
        }

        issues.push({ tag, title: title || tag, description: desc, keywords });
    }
    return issues;
}

function parseIssuesJSON(text) {
    try {
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) throw new Error('Expected JSON array');
        return arr.map(r => ({
            tag:         r.tag         || '',
            title:       r.title       || r.tag || '',
            description: r.description || '',
            keywords:    r.keywords    || '',
        })).filter(r => r.title);
    } catch(e) {
        Toast.err('JSON parse error: ' + e.message);
        return [];
    }
}

async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const text   = await file.text();
    const issues = file.name.toLowerCase().endsWith('.json')
        ? parseIssuesJSON(text)
        : parseIssuesCSV(text);

    if (!issues.length) { Toast.warn('No valid issues found in file.'); return; }

    _importPending = issues;

    const tbody = document.getElementById('importPreviewBody');
    const info  = document.getElementById('importPreviewInfo');
    if (info) info.textContent = `${issues.length} issue(s) found — review and confirm.`;
    if (tbody) {
        tbody.innerHTML = issues.map(ki => `
          <tr>
            <td style="font-family:var(--font-mono);color:var(--warning);white-space:nowrap">
              ${escHtml(ki.tag || '—')}
            </td>
            <td style="font-weight:600;max-width:180px">${escHtml(ki.title)}</td>
            <td style="color:var(--text-muted);max-width:200px">
              ${escHtml((ki.description || '').slice(0, 80))}${(ki.description || '').length > 80 ? '…' : ''}
            </td>
            <td style="font-size:0.72rem;color:var(--text-faint);font-family:var(--font-mono)">
              ${escHtml(ki.keywords || '—')}
            </td>
          </tr>`).join('');
    }
    Modal.open('issueImportModal');
}

async function confirmImport() {
    if (!_importPending.length) return;
    const btn = document.getElementById('btnConfirmImport');
    if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    try {
        const res  = await fetch('api/issues_import.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ issues: _importPending }),
        });
        const data = await res.json();
        Modal.close('issueImportModal');
        _importPending = [];
        if (data.error) {
            Toast.err('Import failed: ' + data.error);
        } else {
            const msg = `Imported ${data.inserted} issue(s)` +
                        (data.skipped ? `, skipped ${data.skipped} duplicate(s)` : '') +
                        (data.errors  ? `, ${data.errors} error(s)` : '') + '.';
            data.errors ? Toast.warn(msg) : Toast.ok(msg);
            await loadIssues();
        }
    } catch(e) {
        Toast.err('Import error: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Import All'; }
    }
}

function exportIssuesCSV() {
    if (!knownIssues.length) { Toast.warn('No issues to export.'); return; }
    const headers = ['id','tag','title','description','keywords','active','created_at','updated_at'];
    const esc = v => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [
        headers.join(','),
        ...knownIssues.map(ki => headers.map(h => esc(ki[h] ?? '')).join(',')),
    ];
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
        href: url, download: `known-issues-${new Date().toISOString().slice(0,10)}.csv`,
    });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    Toast.ok(`Exported ${knownIssues.length} issue(s).`);
}

// ── Bootstrap ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Restore collapse state
    applyCollapseState();

    // Algo term Enter key support
    ['boostInput', 'suppressInput'].forEach(inputId => {
        document.getElementById(inputId)?.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); addAlgoTerm(inputId.replace('Input', '')); }
        });
    });

    // Load algo terms
    loadAlgoTerms();

    // Load known issues
    loadIssues();

    // Known issues buttons
    document.getElementById('btnNewIssue')?.addEventListener('click', () => openIssueModal());
    document.getElementById('btnSaveIssue')?.addEventListener('click', saveIssue);
    document.getElementById('btnExportIssues')?.addEventListener('click', exportIssuesCSV);
    document.getElementById('btnImportIssues')?.addEventListener('click', () => {
        document.getElementById('issueFileInput')?.click();
    });
    document.getElementById('issueFileInput')?.addEventListener('change', handleImportFile);
    document.getElementById('btnConfirmImport')?.addEventListener('click', confirmImport);

    // Select-all checkbox
    document.getElementById('issueSelectAll')?.addEventListener('change', function() {
        const checked = this.checked;
        knownIssues.forEach(ki => {
            if (checked) selectedIssueIds.add(ki.id);
            else         selectedIssueIds.delete(ki.id);
        });
        document.querySelectorAll('.issue-checkbox').forEach(cb => cb.checked = checked);
        syncBulkBar();
    });

    // Bulk delete buttons
    document.getElementById('btnBulkDelete')?.addEventListener('click', openBulkDeleteModal);
    document.getElementById('btnBulkClear')?.addEventListener('click', clearSelection);
    document.getElementById('btnBulkDeleteConfirm')?.addEventListener('click', executeBulkDelete);
});