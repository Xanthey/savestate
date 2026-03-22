/**
 * entries.js — SaveState v2 Entry Form
 * Handles: form save, reset, import/export, fuzzy search sidebar,
 *          today's entry list display, Heads Up alerts, and image attachments.
 */

'use strict';

// ── State ──────────────────────────────────────────────────────
let todayEntries = [];

/**
 * Pending image queue — holds images attached before the ticket is saved.
 * Each item: { file: File, blobUrl: string, previewId: string }
 * Cleared after a successful upload flush.
 */
let pendingImages = [];

// ── Form Draft — persist entry form across tab/page navigations ──
const FormDraft = (() => {
    const KEY = 'ss_entry_draft';

    /** Collect all saveable form values into a plain object. */
    function _collect() {
        const data = {};
        // Standard inputs & selects inside #contactPanel
        document.querySelectorAll('#contactPanel input, #contactPanel select').forEach(el => {
            if (!el.id) return;
            if (el.type === 'checkbox') data[el.id] = el.checked;
            else data[el.id] = el.value;
        });
        // Quill / notes HTML
        data.__notes_html = getNotesHtml();
        return data;
    }

    /** Save current form state to sessionStorage. */
    function save() {
        try {
            sessionStorage.setItem(KEY, JSON.stringify(_collect()));
        } catch { /* quota errors are non-fatal */ }
    }

    /** Restore saved form state. Must be called after Quill is initialised. */
    function restore() {
        let draft;
        try {
            const raw = sessionStorage.getItem(KEY);
            if (!raw) return;
            draft = JSON.parse(raw);
        } catch { return; }

        Object.entries(draft).forEach(([id, value]) => {
            if (id === '__notes_html') return; // handled separately below
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!value;
            else el.value = value;
        });

        // Restore rich-text notes
        if (draft.__notes_html) {
            setNotesHtml(draft.__notes_html);
        }
    }

    /** Wipe the saved draft (called on successful save or manual reset). */
    function clear() {
        sessionStorage.removeItem(KEY);
    }

    /** Attach change/input listeners to all form fields so drafts stay fresh. */
    function watch() {
        // Debounced save so rapid typing doesn't hammer sessionStorage
        const debouncedSave = debounce(save, 300);

        // Native inputs & selects
        const panel = document.getElementById('contactPanel');
        if (panel) {
            panel.addEventListener('input',  debouncedSave);
            panel.addEventListener('change', debouncedSave);
        }

        // Quill text-change (fires after the editor is ready)
        if (quill) {
            quill.on('text-change', debouncedSave);
        }
    }

    return { save, restore, clear, watch };
})();

// ── DOM refs ────────────────────────────────────────────────────
const form = {
    ticket:        () => document.getElementById('ticket'),
    notes:         () => document.getElementById('notes'),       // hidden textarea (legacy / fallback)
    reason:        () => document.getElementById('reason_for_contact'),
    device:        () => document.getElementById('type_of_device'),
    browser:       () => document.getElementById('browser'),
    location:      () => document.getElementById('location'),
    contactMethod: () => document.getElementById('contact_method'),
    planType:      () => document.getElementById('plan_type'),
    solved:        () => document.getElementById('solved'),
    // Checkboxes from company.conf
    allCheckboxes: () => document.querySelectorAll('#checkboxGroup input[type=checkbox]'),
};

// ── Quill editor instance (set during DOMContentLoaded) ──────────
let quill = null;

/** Get the full HTML content of the notes editor. */
function getNotesHtml() {
    if (quill) {
        // Quill's root innerHTML — empty editor is just '<p><br></p>'
        const html = quill.root.innerHTML;
        return (html === '<p><br></p>' || html === '<p></p>') ? '' : html;
    }
    return (form.notes()?.value || '').trim();
}

/** Get plain text (tags stripped) — used for search triggers and previews. */
function getNotesText() {
    if (quill) return quill.getText().trim();
    return (form.notes()?.value || '').trim();
}

/** Set the editor content from an HTML string (used when restoring/populating). */
function setNotesHtml(html) {
    if (quill) {
        if (!html) {
            quill.setContents([]);
        } else {
            quill.clipboard.dangerouslyPasteHTML(html);
        }
        return;
    }
    const el = form.notes();
    if (el) el.value = html;
}

// ── Collect form data ────────────────────────────────────────────
function collectEntry() {
    const data = {
        ticket_number:      (form.ticket()?.value || '').trim(),
        reason_for_contact: form.reason()?.value || '',
        type_of_device:     form.device()?.value || '',
        browser:            form.browser()?.value || '',
        location:           (form.location()?.value || '').trim(),
        contact_method:     form.contactMethod()?.value || '',
        plan_type:          form.planType()?.value || '',
        solved:             form.solved()?.checked || false,
        notes:              getNotesHtml(),
    };
    // Dynamic checkboxes
    form.allCheckboxes().forEach(cb => {
        data[cb.id] = cb.checked;
    });
    return data;
}

// ── Reset form ───────────────────────────────────────────────────
function resetForm() {
    const inputs = document.querySelectorAll('#contactPanel input, #contactPanel select');
    inputs.forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
    });
    // Clear Quill editor (or fallback textarea)
    if (quill) {
        quill.setContents([]);
    } else {
        const notesEl = form.notes();
        if (notesEl) notesEl.value = '';
    }
    closeFuzzyPanel();
    renderHeadsUpPanel([]);
    setStatus('');
    clearPendingImages();
    FormDraft.clear();
}

// ── Save entry ───────────────────────────────────────────────────
async function saveEntry() {
    const data = collectEntry();

    if (!data.ticket_number && !data.notes) {
        Toast.warn('Please enter a ticket number or notes before saving.');
        return;
    }

    const btn = document.getElementById('btnSave');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }

    try {
        const result = await API.saveEntry(data);
        const mode   = window.Modes?.get() || 'lab';
        const appended = result.appended === true;

        // ── Flush any pending image attachments ──────────────────
        const ticketId = result.id;
        if (pendingImages.length > 0 && ticketId) {
            await flushPendingImages(ticketId);
        }

        // Refresh today's list from server so the updated entry appears correctly
        todayEntries = await API.getEntries();
        renderTodayEntries();
        updateStatChip('Today', todayEntries.length);
        updateStatChip('Solved', todayEntries.filter(e => e.solved).length);

        // Mode-specific feedback
        const modeText = window.Modes?.text(mode) || {};
        const savedMsg = appended
            ? '📎 Notes appended to existing ticket.'
            : (modeText.saved || 'Saved.');
        setStatus(savedMsg, 'ok');
        appended ? Toast.info(savedMsg) : Toast.ok(savedMsg);

        // Fire event for RPG system
        document.dispatchEvent(new CustomEvent('entrySaved', {
            detail: { solved: data.solved, xpAwarded: result.xp || 0, appended }
        }));

        resetForm();
        clearActiveMatch();
    } catch (e) {
        Toast.err('Save failed: ' + e.message);
        setStatus('Save failed: ' + e.message, 'err');
    } finally {
        if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    }
}

// ── Today's entries list ─────────────────────────────────────────
function renderTodayEntries() {
    const container = document.getElementById('todayList');
    if (!container) return;

    if (!todayEntries.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__msg">No entries yet today</div></div>';
        return;
    }

    container.innerHTML = todayEntries.map(e => `
      <div class="today-entry glass-subtle" style="border-radius:var(--radius);padding:0.6rem 0.8rem;cursor:pointer;transition:background var(--t-fast);margin-bottom:0.4rem"
           onclick="openTicket(${e.id || 0})"
           title="View full details">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem">
          <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--accent)">#${escHtml(e.ticket_number || '—')}</span>
          <span class="badge ${e.solved ? 'badge-solved' : 'badge-unsolved'}">${e.solved ? 'Solved' : 'Open'}</span>
          ${e.escalated ? '<span class="badge badge-escalated">ESC</span>' : ''}
          ${(e.image_count > 0) ? `<span class="img-indicator" title="${e.image_count} image${e.image_count !== 1 ? 's' : ''} attached">📷</span>` : ''}
        </div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${escHtml(e.reason_for_contact || '')} · ${escHtml(e.contact_method || '')}
        </div>
        ${e.notes ? `<div style="font-size:0.75rem;color:var(--text-faint);margin-top:0.15rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(stripHtml(e.notes).slice(0,80))}${stripHtml(e.notes).length > 80 ? '…' : ''}</div>` : ''}
      </div>`).join('');
}

// ── Returning customer detection ─────────────────────────────────

// Track the currently matched ticket so saveEntry and fuzzy panel can reference it
let activeMatchedTicket = null;

function clearActiveMatch() {
    activeMatchedTicket = null;
    // Remove ticket field highlight
    const ticketEl = form.ticket();
    if (ticketEl) {
        ticketEl.style.borderColor = '';
        ticketEl.style.boxShadow  = '';
    }
    // Remove pinned card if fuzzy panel isn't otherwise showing results
    const pinned = document.getElementById('activeTicketPin');
    if (pinned) pinned.remove();
}

function populateFormFromTicket(ticket) {
    const fieldMap = {
        reason_for_contact: 'reason',
        type_of_device:     'device',
        browser:            'browser',
        location:           'location',
        contact_method:     'contactMethod',
        plan_type:          'planType',
    };
    Object.entries(fieldMap).forEach(([key, ref]) => {
        const el = form[ref]?.();
        if (!el || !ticket[key]) return;

        const isDefault = el.tagName === 'SELECT'
            ? el.selectedIndex <= 0
            : !el.value;

        if (isDefault) el.value = ticket[key];
    });

    // Checkboxes
    const boolMap = {
        obtained_info: 'obtained_info',
        has_account:   'has_account',
        escalated:     'escalated',
        solved:        'solved',
    };
    Object.entries(boolMap).forEach(([key, elId]) => {
        const el = document.getElementById(elId);
        if (el && el.type === 'checkbox') el.checked = !!ticket[key];
    });
    // solved via form ref
    const solvedEl = form.solved?.();
    if (solvedEl) solvedEl.checked = !!ticket.solved;
}

function highlightTicketField() {
    const el = form.ticket();
    if (!el) return;
    el.style.borderColor = 'var(--warning)';
    el.style.boxShadow   = '0 0 0 3px rgba(245,166,35,0.25)';
}

function pinActiveTicketCard(ticket) {
    // Ensure fuzzy panel is open
    openFuzzyPanel();

    const container = document.getElementById('fuzzyResults');
    if (!container) return;

    // Remove any existing pin
    document.getElementById('activeTicketPin')?.remove();

    const pin = document.createElement('div');
    pin.id = 'activeTicketPin';

    const date     = fmtDate(ticket.session_date || ticket.exported_at);
    const notePrev = stripHtml(ticket.notes || '').slice(0, 120);

    pin.innerHTML = `
      <div style="font-family:var(--font-display);font-size:0.72rem;font-weight:700;
                  letter-spacing:0.08em;text-transform:uppercase;color:var(--warning);
                  margin-bottom:0.4rem;padding:0.3rem 0;display:flex;align-items:center;gap:0.4rem">
        <span>🔁 RETURNING CUSTOMER</span>
      </div>
      <div class="glass-subtle" style="border-radius:var(--radius-sm);padding:0.65rem 0.75rem;
                   border-left:3px solid var(--warning);cursor:pointer"
           onclick="openTicket(${ticket.id})"
           title="Click to view full previous ticket">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem">
          <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--warning)">
            #${escHtml(ticket.ticket_number || '—')}
          </span>
          <span class="badge ${ticket.solved ? 'badge-solved' : 'badge-unsolved'}">
            ${ticket.solved ? 'Solved' : 'Open'}
          </span>
          ${ticket.escalated ? '<span class="badge badge-escalated">ESC</span>' : ''}
          <span style="font-size:0.72rem;color:var(--text-faint);margin-left:auto">${escHtml(date)}</span>
        </div>
        <div style="font-size:0.77rem;color:var(--text-muted)">
          ${escHtml(ticket.reason_for_contact || '')}
          ${ticket.contact_method ? ' · ' + escHtml(ticket.contact_method) : ''}
        </div>
        ${notePrev ? `
          <div style="font-size:0.75rem;color:var(--text-faint);margin-top:0.3rem;
                      line-height:1.45;white-space:pre-wrap;word-break:break-word">
            ${escHtml(notePrev)}${ticket.notes?.length > 120 ? '…' : ''}
          </div>` : ''}
        <button class="btn btn-sm" style="margin-top:0.45rem"
                onclick="event.stopPropagation();copyText(${JSON.stringify(stripHtml(ticket.notes||''))}, 'Notes')">
          Copy Notes
        </button>
      </div>`;

    // Insert before any existing fuzzy results so it's always at the top
    container.prepend(pin);
}

const doTicketNumberLookup = debounce(async (value) => {
    const cleaned = value.trim();
    if (!cleaned) { clearActiveMatch(); return; }

    try {
        const res = await API.lookupTicketNumber(cleaned);
        if (!res.match) {
            clearActiveMatch();
            return;
        }

        activeMatchedTicket = res.ticket;
        highlightTicketField();
        populateFormFromTicket(res.ticket);
        pinActiveTicketCard(res.ticket);
        Toast.info(`📋 Returning customer — fields pre-filled from ticket #${cleaned}`);
    } catch {
        // Silently ignore lookup errors — don't block the user
        clearActiveMatch();
    }
}, 500);


// Panel lives in the HTML — just toggle visibility, no DOM injection

function openFuzzyPanel() {
    const panel = document.getElementById('fuzzyPanel');
    if (panel) panel.style.display = '';
}

function closeFuzzyPanel() {
    const panel = document.getElementById('fuzzyPanel');
    if (panel) panel.style.display = 'none';
}

function renderFuzzyResults(results) {
    const container = document.getElementById('fuzzyResults');
    if (!container) return;

    const { tickets = [], issues = [] } = results;

    // ── Heads Up → left-column panel ────────────────────────────
    renderHeadsUpPanel(issues);

    // ── Similar tickets → fuzzy panel ───────────────────────────
    if (!tickets.length) {
        closeFuzzyPanel();
        return;
    }

    openFuzzyPanel();
    let html = '';
    tickets.forEach(t => {
        html += `
          <div class="glass-subtle" style="border-radius:var(--radius-sm);padding:0.6rem 0.75rem;
                       cursor:pointer;transition:background var(--t-fast);margin-bottom:0.4rem"
               onclick="openTicket(${t.id})"
               title="Click to view full ticket">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.2rem">
              <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--accent)">
                #${escHtml(t.ticket_number || '—')}
              </span>
              <span class="badge ${t.solved ? 'badge-solved' : 'badge-unsolved'}">${t.solved ? '✓' : '○'}</span>
              <span style="font-size:0.72rem;color:var(--text-faint);margin-left:auto">
                ${fmtDate(t.session_date)}
              </span>
            </div>
            <div style="font-size:0.77rem;color:var(--text-muted)">${escHtml(t.reason_for_contact || '')}</div>
            ${t.notes_preview ? `
              <div style="font-size:0.75rem;color:var(--text-faint);margin-top:0.2rem;line-height:1.4;word-break:break-word">
                ${escHtml(t.notes_preview)}
              </div>` : ''}
            <button class="btn btn-sm" style="margin-top:0.4rem"
                    onclick="event.stopPropagation();copyText(${JSON.stringify(t.notes_preview||'')}, 'Notes')">
              Copy Notes
            </button>
          </div>`;
    });

    container.innerHTML = html;
}

/**
 * Render known issues into #headsUpPanel in the left column.
 * Uses CSS classes from layout.css for proper sizing and word-wrap.
 */
function renderHeadsUpPanel(issues) {
    const panel = document.getElementById('headsUpPanel');
    const list  = document.getElementById('headsUpList');
    const count = document.getElementById('headsUpCount');
    if (!panel || !list) return;

    if (!issues || !issues.length) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = '';
    if (count) count.textContent = issues.length;

    list.innerHTML = issues.map(ki => `
      <div class="glass-subtle headsup-card">
        <div class="headsup-card__tag">${escHtml(ki.tag || 'KI')}</div>
        <div class="headsup-card__title">${escHtml(ki.title)}</div>
        ${ki.desc_preview ? `<div class="headsup-card__desc">${escHtml(ki.desc_preview)}</div>` : ''}
        <button class="btn btn-sm" style="margin-top:0.4rem"
                onclick="copyText(${JSON.stringify(ki.desc_preview || ki.title)}, 'KI info')">
          Copy
        </button>
      </div>`).join('');
}

// ── Debounced fuzzy search trigger ───────────────────────────────
const doFuzzySearch = debounce(async (rawText) => {
    if (!rawText || rawText.length < 3) {
        closeFuzzyPanel();
        renderHeadsUpPanel([]);
        return;
    }

    // Extract smart tokens using the SearchFilter module.
    // Falls back gracefully if the module isn't loaded yet.
    let query = rawText;
    let boost = '';
    if (window.SearchFilter) {
        const extracted = SearchFilter.extract(rawText);
        // If extraction produced an empty query (all filler), bail out early
        if (!extracted.query || extracted.query.length < 3) {
            closeFuzzyPanel();
            renderHeadsUpPanel([]);
            return;
        }
        query = extracted.query;
        boost = extracted.boost;
    }

    try {
        const results = await API.search(query, 'all', boost);
        const hasTickets = (results.tickets?.length || 0) > 0;
        const hasIssues  = (results.issues?.length  || 0) > 0;

        if (hasTickets || hasIssues) {
            renderFuzzyResults(results);
        } else {
            closeFuzzyPanel();
            renderHeadsUpPanel([]);
        }
    } catch { /* silent */ }
}, 450);


// ════════════════════════════════════════════════════════════════
// IMAGE ATTACHMENT SYSTEM
// ════════════════════════════════════════════════════════════════

/**
 * Add a File to the pending queue and render its preview card.
 */
function addPendingImage(file) {
    const MAX_BYTES = 8 * 1024 * 1024;
    const ALLOWED   = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (!ALLOWED.includes(file.type)) {
        Toast.warn('Only JPEG, PNG, GIF, and WebP images can be attached.');
        return;
    }
    if (file.size > MAX_BYTES) {
        Toast.warn(`"${file.name}" exceeds the 8 MB limit.`);
        return;
    }

    const blobUrl   = URL.createObjectURL(file);
    const previewId = 'img-pending-' + Date.now() + '-' + Math.random().toString(36).slice(2);

    pendingImages.push({ file, blobUrl, previewId });
    renderImageStrip();
}

/**
 * Remove a pending image by its previewId and revoke the blob URL.
 */
function removePendingImage(previewId) {
    const idx = pendingImages.findIndex(p => p.previewId === previewId);
    if (idx === -1) return;
    URL.revokeObjectURL(pendingImages[idx].blobUrl);
    pendingImages.splice(idx, 1);
    renderImageStrip();
}

/**
 * Clear all pending images (called on form reset).
 */
function clearPendingImages() {
    pendingImages.forEach(p => URL.revokeObjectURL(p.blobUrl));
    pendingImages = [];
    renderImageStrip();
}

/**
 * Upload all pending images to the given ticketId, then clear the queue.
 * Failures are reported via Toast but do not throw — the ticket save already succeeded.
 */
async function flushPendingImages(ticketId) {
    if (!pendingImages.length) return;

    const failed = [];

    for (const pending of pendingImages) {
        const fd = new FormData();
        fd.append('ticket_id', ticketId);
        fd.append('image', pending.file, pending.file.name);

        try {
            const resp = await fetch('api/images.php', { method: 'POST', body: fd });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                failed.push(pending.file.name + ': ' + (err.error || resp.statusText));
            }
        } catch (e) {
            failed.push(pending.file.name + ': network error');
        }
    }

    // Revoke all blob URLs and clear queue regardless of outcome
    pendingImages.forEach(p => URL.revokeObjectURL(p.blobUrl));
    pendingImages = [];
    renderImageStrip();

    if (failed.length) {
        Toast.warn('⚠ ' + failed.length + ' image(s) failed to upload:\n' + failed.join('\n'));
    }
}

/**
 * Render (or update) the image attachment strip below the notes textarea.
 * Creates the strip container in the DOM if it doesn't exist yet.
 */
function renderImageStrip() {
    // Find or create the strip container inside #notesPanel
    let strip = document.getElementById('imageStrip');
    if (!strip) {
        const panelBody = document.querySelector('#notesPanel .panel__body');
        if (!panelBody) return;

        strip = document.createElement('div');
        strip.id = 'imageStrip';
        strip.className = 'image-strip';
        panelBody.appendChild(strip);
    }

    if (!pendingImages.length) {
        strip.innerHTML = '';
        strip.style.display = 'none';
        return;
    }

    strip.style.display = 'flex';
    strip.innerHTML = pendingImages.map(p => `
        <div class="image-strip__item" id="${escHtml(p.previewId)}">
            <img src="${escHtml(p.blobUrl)}"
                 alt="${escHtml(p.file.name)}"
                 title="${escHtml(p.file.name)}"
                 onclick="openImagePreview('${escHtml(p.blobUrl)}', '${escHtml(p.file.name)}')">
            <button class="image-strip__remove"
                    onclick="removePendingImage('${escHtml(p.previewId)}')"
                    title="Remove attachment">✕</button>
            <div class="image-strip__label">${escHtml(truncateFilename(p.file.name, 18))}</div>
        </div>
    `).join('');
}

/**
 * Open a lightbox-style overlay for a full-size preview.
 */
function openImagePreview(src, name) {
    // Remove any existing overlay first
    document.getElementById('imagePreviewOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'imagePreviewOverlay';
    overlay.className = 'image-preview-overlay';
    overlay.innerHTML = `
        <div class="image-preview-overlay__backdrop" onclick="document.getElementById('imagePreviewOverlay').remove()"></div>
        <div class="image-preview-overlay__box">
            <div class="image-preview-overlay__header">
                <span>${escHtml(name)}</span>
                <button class="btn-icon" onclick="document.getElementById('imagePreviewOverlay').remove()" title="Close">✕</button>
            </div>
            <img src="${escHtml(src)}" alt="${escHtml(name)}">
        </div>
    `;
    document.body.appendChild(overlay);
}

/**
 * Truncate a filename for display, preserving the extension.
 */
function truncateFilename(name, maxLen) {
    if (name.length <= maxLen) return name;
    const dot = name.lastIndexOf('.');
    const ext = dot > -1 ? name.slice(dot) : '';
    return name.slice(0, maxLen - ext.length - 1) + '…' + ext;
}

/**
 * Wire up the attach button and paste/drag listeners.
 * With Quill active we attach to quill.root (the contenteditable div).
 * Falls back to the legacy textarea if Quill isn't initialised.
 * Called once from DOMContentLoaded after Quill is ready.
 */
function initImageAttachment() {
    const dropTarget  = quill ? quill.root : form.notes();
    const notesPanel  = document.getElementById('notesPanel');
    if (!dropTarget || !notesPanel) return;

    // ── Paperclip button in the notes panel header ───────────────
    const header = notesPanel.querySelector('.panel__header');
    if (header) {
        const attachBtn = document.createElement('button');
        attachBtn.className = 'btn-icon attach-btn';
        attachBtn.title = 'Attach image';
        attachBtn.innerHTML = '📎';
        attachBtn.addEventListener('click', () => fileInputEl.click());

        const existingIcon = header.querySelector('.panel__header-icon');
        header.insertBefore(attachBtn, existingIcon);
    }

    // ── Hidden file input ────────────────────────────────────────
    const fileInputEl = document.createElement('input');
    fileInputEl.type     = 'file';
    fileInputEl.accept   = 'image/jpeg,image/png,image/gif,image/webp';
    fileInputEl.multiple = true;
    fileInputEl.style.display = 'none';
    fileInputEl.addEventListener('change', () => {
        [...fileInputEl.files].forEach(addPendingImage);
        fileInputEl.value = '';
    });
    document.body.appendChild(fileInputEl);

    // ── Paste listener ───────────────────────────────────────────
    // Quill fires its own paste handling on quill.root; we intercept
    // image-only pastes and route them to the pending-image queue.
    dropTarget.addEventListener('paste', (e) => {
        const items      = [...(e.clipboardData?.items || [])];
        const imageItems = items.filter(i => i.kind === 'file' && i.type.startsWith('image/'));
        if (!imageItems.length) return;

        const hasText = items.some(i => i.kind === 'string' && i.type === 'text/plain');
        if (!hasText) e.preventDefault();

        imageItems.forEach(item => {
            const file = item.getAsFile();
            if (file) addPendingImage(file);
        });
    });

    // ── Drag-and-drop ────────────────────────────────────────────
    dropTarget.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropTarget.classList.add('notes-area--dragover');
    });
    dropTarget.addEventListener('dragleave', () => {
        dropTarget.classList.remove('notes-area--dragover');
    });
    dropTarget.addEventListener('drop', (e) => {
        e.preventDefault();
        dropTarget.classList.remove('notes-area--dragover');
        const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
        files.forEach(addPendingImage);
    });
}


// ── Event wiring ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Seed stat chips from server-rendered values so they're correct on first load
    if (window.SS_CONFIG) {
        updateStatChip('Today',  window.SS_CONFIG.todayCount  ?? 0);
        updateStatChip('Solved', window.SS_CONFIG.totalSolved ?? 0);
    }

    // Pre-load search algorithm prefs so the extractor has them ready
    if (window.SearchFilter) {
        SearchFilter.loadPrefs().catch(() => {/* non-fatal */});
    }

    // Load today's entries
    try {
        todayEntries = await API.getEntries();
        renderTodayEntries();
    } catch { /* not on entry page */ }

    // ── Quill rich-text editor init ──────────────────────────────
    const editorEl = document.getElementById('notesEditor');
    if (editorEl && window.Quill) {
        // Quill 1.3.7: toolbar HTML already exists in #quillToolbar (app.php).
        // Placeholder is set via data-placeholder on #notesEditor.
        quill = new Quill('#notesEditor', {
            theme: 'snow',
            modules: {
                toolbar: '#quillToolbar',
            },
        });

        // Fuzzy search fires on text-change using plain text content
        quill.on('text-change', () => {
            doFuzzySearch(quill.getText().trim());
        });

        // RPG typing sounds — forward keydown events from the contenteditable
        // to document so the RPG module's listener picks them up
        quill.root.addEventListener('keydown', (e) => {
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: e.key, code: e.code, bubbles: true,
            }));
        });
    }

    // ── Restore any in-progress draft (after Quill is ready) ────
    FormDraft.restore();
    FormDraft.watch();

    // Save button
    document.getElementById('btnSave')?.addEventListener('click', saveEntry);

    // Reset button
    document.getElementById('btnReset')?.addEventListener('click', () => {
        if (confirm('Clear the form?')) { resetForm(); clearActiveMatch(); }
    });

    // Ticket number — lookup on change/blur
    form.ticket()?.addEventListener('input',  (e) => doTicketNumberLookup(e.target.value));
    form.ticket()?.addEventListener('blur',   (e) => doTicketNumberLookup(e.target.value));

    // Keyboard shortcut: Ctrl+Enter to save
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            saveEntry();
        }
    });

    // Image attachment system — called after quill is ready so it can target quill.root
    initImageAttachment();
});