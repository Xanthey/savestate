/**
 * common.js — SaveState v2
 * Shared utilities: API fetch, toast, modal, debounce, formatting
 */

'use strict';

// ── API helpers ──────────────────────────────────────────────────

/** Generic fetch wrapper. Returns parsed JSON or throws. */
async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

const API = {
    // Entries
    getEntries: (date = '') =>
        apiFetch(`api/entries.php${date ? '?date=' + date : ''}`),
    getEntry: (id) =>
        apiFetch(`api/entries.php?id=${id}`),
    saveEntry: (payload) =>
        apiFetch('api/entries.php', { method: 'POST', body: JSON.stringify(payload) }),
    updateEntry: (id, payload) =>
        apiFetch(`api/entries.php?id=${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deleteEntry: (id) =>
        apiFetch(`api/entries.php?id=${id}`, { method: 'DELETE' }),
    batchImport: (entries) =>
        apiFetch('api/entries.php', { method: 'POST', body: JSON.stringify({ entries }) }),

    // Vault
    vaultSearch: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return apiFetch(`api/vault.php?${qs}`);
    },
    vaultTicket: (id) => apiFetch(`api/vault.php?id=${id}`),
    vaultStats:  ()   => apiFetch('api/vault.php?stats=1'),

    // Fuzzy search (boost = comma-joined high-signal tokens from SearchFilter)
    search: (q, mode = 'all', boost = '') => {
        let url = `api/search.php?q=${encodeURIComponent(q)}&mode=${mode}`;
        if (boost) url += `&boost=${encodeURIComponent(boost)}`;
        return apiFetch(url);
    },

    // Search algorithm preferences (boost / suppress terms)
    getSearchPrefs: () =>
        apiFetch('api/search_prefs.php'),
    addSearchTerm: (type, term) =>
        apiFetch('api/search_prefs.php', { method: 'POST', body: JSON.stringify({ action: 'add', type, term }) }),
    removeSearchTerm: (id) =>
        apiFetch('api/search_prefs.php', { method: 'POST', body: JSON.stringify({ action: 'remove', id }) }),

    // Known issues
    getIssues:    ()       => apiFetch('api/issues.php'),
    getIssue:     (id)     => apiFetch(`api/issues.php?id=${id}`),
    saveIssue:    (data)   => apiFetch('api/issues.php', { method: 'POST', body: JSON.stringify(data) }),
    updateIssue:  (id, d)  => apiFetch(`api/issues.php?id=${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    deleteIssue:  (id)     => apiFetch(`api/issues.php?id=${id}`, { method: 'DELETE' }),

    // Prefs
    setPref: (key, value) =>
        apiFetch('api/prefs.php', { method: 'POST', body: JSON.stringify({ key, value }) }),

    // Vault bulk import
    importVault: (entries) =>
        apiFetch('api/import.php', { method: 'POST', body: JSON.stringify({ entries }) }),

    // Ticket number lookup (for returning customer detection)
    lookupTicketNumber: (ticketNumber) =>
        apiFetch(`api/entries.php?ticket_number=${encodeURIComponent(ticketNumber)}`),

    // Images
    getImages: (ticketId) =>
        apiFetch(`api/images.php?ticket_id=${ticketId}`),
};

// ── Toast ────────────────────────────────────────────────────────

const Toast = (() => {
    let container;
    function getContainer() {
        if (!container) {
            container = document.getElementById('toastContainer');
            if (!container) {
                container = document.createElement('div');
                container.className = 'toast-container';
                document.body.appendChild(container);
            }
        }
        return container;
    }

    function show(msg, type = 'info', duration = 3000) {
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        const icons = { ok: '✓', err: '✗', info: '●', warn: '⚠' };
        el.innerHTML = `<span>${icons[type] || '●'}</span><span>${msg}</span>`;
        getContainer().appendChild(el);
        setTimeout(() => el.remove(), duration + 250);
        return el;
    }

    return {
        ok:   (msg) => show(msg, 'ok'),
        err:  (msg) => show(msg, 'err', 4000),
        info: (msg) => show(msg, 'info'),
        warn: (msg) => show(msg, 'warn', 4000),
    };
})();

// ── Modal ────────────────────────────────────────────────────────

const Modal = (() => {
    function open(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('open');
    }
    function close(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('open');
    }
    function closeAll() {
        document.querySelectorAll('.modal-overlay.open').forEach(el => el.classList.remove('open'));
    }
    // Click outside to close
    document.addEventListener('click', e => {
        if (e.target.classList.contains('modal-overlay')) closeAll();
    });
    // Escape to close
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAll();
    });
    return { open, close, closeAll };
})();

// ── Debounce ─────────────────────────────────────────────────────
function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

// ── Format helpers ────────────────────────────────────────────────
function fmtDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtBool(val) {
    return val ? '✓' : '—';
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Strip HTML tags and decode basic entities to plain text.
 * Used wherever notes must be shown as plain text (previews, copy, search snippets).
 */
function stripHtml(html) {
    if (!html) return '';
    // Use a temporary div so the browser's own parser handles entity decoding
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').trim();
}

/** Copy text to clipboard, show toast */
async function copyText(text, label = 'Copied') {
    try {
        await navigator.clipboard.writeText(text);
        Toast.ok(`${label} to clipboard`);
    } catch {
        Toast.err('Clipboard access denied');
    }
}

// ── Status bar helper ─────────────────────────────────────────────
function setStatus(msg, type = '', duration = 4000) {
    const el = document.getElementById('statusMsg');
    if (!el) return;
    el.textContent = msg;
    el.className = `footer__status ${type}`;
    if (duration > 0) {
        setTimeout(() => {
            if (el.textContent === msg) {
                el.textContent = '';
                el.className = 'footer__status';
            }
        }, duration);
    }
}

// ── Ticket detail modal builder ────────────────────────────────────
function buildTicketModal(ticket, images, modalId = 'ticketDetailModal') {
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal glass ticket-detail">
            <div class="modal__header">
              <span id="${modalId}Title">Ticket Detail</span>
              <button class="btn-icon" onclick="Modal.close('${modalId}')" title="Close">✕</button>
            </div>
            <div class="modal__body" id="${modalId}Body"></div>
            <div class="modal__footer" id="${modalId}Footer"></div>
          </div>`;
        document.body.appendChild(modal);
    }

    const title = modal.querySelector(`#${modalId}Title`);
    const body  = modal.querySelector(`#${modalId}Body`);
    const footer = modal.querySelector(`#${modalId}Footer`);

    title.textContent = `Ticket #${ticket.ticket_number || ticket.id}`;

    const fields = [
        ['Reason',         ticket.reason_for_contact],
        ['Device',         ticket.type_of_device],
        ['Browser',        ticket.browser],
        ['Location',       ticket.location],
        ['Contact Method', ticket.contact_method],
        ['Plan',           ticket.plan_type],
        ['Date',           fmtDate(ticket.session_date || ticket.exported_at)],
        ['Has Account',    ticket.has_account   ? '✓ Yes' : 'No'],
        ['Obtained Info',  ticket.obtained_info ? '✓ Yes' : 'No'],
        ['Escalated',      ticket.escalated     ? '⚠ Yes' : 'No'],
        ['Solved',         ticket.solved        ? '✓ Solved' : '✗ Unsolved'],
    ];

    const rows = fields.map(([k, v]) => `
      <div class="ticket-detail__row">
        <span class="ticket-detail__key">${escHtml(k)}</span>
        <span class="ticket-detail__val">${escHtml(v ?? '—')}</span>
      </div>`).join('');

    const notes      = ticket.notes || ticket.notes_preview || '';
    const notesPlain = stripHtml(notes);

    // Store images on window so inline onclick handlers can reference by index safely
    const imgList = Array.isArray(images) ? images : [];
    window.__ticketLightboxImages = imgList;

    body.innerHTML = `
      <div class="ticket-detail__grid">${rows}</div>
      ${notes ? `
        <div class="ticket-detail__notes" style="margin-top:0.75rem">
          <span class="ticket-detail__key">Notes</span>
          <div class="ticket-detail__notes-text ql-editor" style="padding:0.5rem 0;min-height:unset">${notes}</div>
        </div>` : ''}
      ${imgList.length ? `
        <div class="ticket-thumbs">
          <div class="ticket-thumbs__label">
            <span class="ticket-detail__key">Attachments</span>
            <span class="ticket-thumbs__count">${imgList.length} image${imgList.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="ticket-thumbs__strip">
            ${imgList.map((img, i) => `
              <div class="ticket-thumb" data-idx="${i}" title="${escHtml(img.orig_name)}">
                <img src="${escHtml(img.url)}" alt="${escHtml(img.orig_name)}" loading="lazy">
                <div class="ticket-thumb__label">${escHtml(truncateModalFilename(img.orig_name, 14))}</div>
              </div>`).join('')}
          </div>
        </div>` : ''}`;

    // Wire up thumbnail clicks after innerHTML is set
    body.querySelectorAll('.ticket-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
            openTicketLightbox(window.__ticketLightboxImages, parseInt(thumb.dataset.idx));
        });
    });

    footer.innerHTML = `
      <button class="btn btn-sm" onclick="copyText(${JSON.stringify(notesPlain)}, 'Notes')">Copy Notes</button>
      <button class="btn btn-sm" onclick="copyText('#${ticket.ticket_number}', 'Ticket #')">Copy Ticket #</button>
      <button class="btn btn-sm" onclick="Modal.close('${modalId}')">Close</button>`;

    Modal.open(modalId);
}

/** Truncate filename for modal thumbnail labels */
function truncateModalFilename(name, maxLen) {
    if (!name || name.length <= maxLen) return name || '';
    const dot = name.lastIndexOf('.');
    const ext = dot > -1 ? name.slice(dot) : '';
    return name.slice(0, maxLen - ext.length - 1) + '…' + ext;
}

/** Open a ticket detail — fetches full record if only id given */
async function openTicket(idOrObj) {
    try {
        const ticket = (typeof idOrObj === 'object')
            ? idOrObj
            : await API.vaultTicket(idOrObj);
        let images = [];
        if (ticket.id) {
            try { images = await API.getImages(ticket.id); } catch { images = []; }
        }
        buildTicketModal(ticket, images);
    } catch (e) {
        Toast.err('Could not load ticket: ' + e.message);
    }
}

/**
 * Full-screen lightbox for ticket images.
 * Supports: prev/next, keyboard nav, scroll-wheel zoom, click-drag pan, touch swipe.
 */
function openTicketLightbox(images, startIndex) {
    if (!images || !images.length) return;
    startIndex = startIndex || 0;

    document.getElementById('ticketLightbox')?.remove();

    let currentIndex = startIndex;
    let scale = 1;
    let panX = 0, panY = 0;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let panStart  = { x: 0, y: 0 };

    const lb = document.createElement('div');
    lb.id = 'ticketLightbox';
    lb.className = 'tl-overlay';
    lb.innerHTML = `
      <div class="tl-backdrop"></div>
      <div class="tl-box">
        <div class="tl-header">
          <span class="tl-title" id="tlTitle"></span>
          <div class="tl-header-actions">
            <span class="tl-counter" id="tlCounter"></span>
            <button class="tl-btn" id="tlZoomReset" title="Reset zoom (double-click image)" style="opacity:0.4">⊡</button>
            <a class="tl-btn" id="tlDownload" title="Open full size in new tab" target="_blank" rel="noopener">⤢</a>
            <button class="tl-btn tl-close" id="tlClose" title="Close (Esc)">✕</button>
          </div>
        </div>
        <div class="tl-stage">
          <button class="tl-nav tl-nav-prev" id="tlPrev" title="Previous (←)">❮</button>
          <div class="tl-img-wrap" id="tlImgWrap">
            <img class="tl-img" id="tlImg" alt="" draggable="false">
          </div>
          <button class="tl-nav tl-nav-next" id="tlNext" title="Next (→)">❯</button>
        </div>
        <div class="tl-filmstrip" id="tlFilmstrip"></div>
      </div>`;
    document.body.appendChild(lb);

    const img      = lb.querySelector('#tlImg');
    const wrap     = lb.querySelector('#tlImgWrap');
    const title    = lb.querySelector('#tlTitle');
    const counter  = lb.querySelector('#tlCounter');
    const prev     = lb.querySelector('#tlPrev');
    const next     = lb.querySelector('#tlNext');
    const closeBtn = lb.querySelector('#tlClose');
    const download = lb.querySelector('#tlDownload');
    const zoomRst  = lb.querySelector('#tlZoomReset');
    const strip    = lb.querySelector('#tlFilmstrip');
    const backdrop = lb.querySelector('.tl-backdrop');

    function applyTransform() {
        img.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
        wrap.style.cursor = scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in';
        zoomRst.style.opacity = scale > 1 ? '1' : '0.4';
    }

    function resetZoom() {
        scale = 1; panX = 0; panY = 0;
        applyTransform();
    }

    function goTo(idx) {
        currentIndex = ((idx % images.length) + images.length) % images.length;
        const cur = images[currentIndex];
        img.src = cur.url;
        img.alt = cur.orig_name || '';
        title.textContent = cur.orig_name || '';
        counter.textContent = (currentIndex + 1) + ' / ' + images.length;
        download.href = cur.url;
        prev.style.visibility = images.length > 1 ? '' : 'hidden';
        next.style.visibility = images.length > 1 ? '' : 'hidden';
        resetZoom();
        strip.querySelectorAll('.tl-thumb').forEach((t, i) => {
            t.classList.toggle('tl-thumb--active', i === currentIndex);
        });
    }

    // Filmstrip
    if (images.length > 1) {
        strip.innerHTML = images.map((im, i) => `
          <div class="tl-thumb" data-idx="${i}" title="${escHtml(im.orig_name || '')}">
            <img src="${escHtml(im.url)}" alt="" loading="lazy" draggable="false">
          </div>`).join('');
        strip.querySelectorAll('.tl-thumb').forEach(t => {
            t.addEventListener('click', () => goTo(parseInt(t.dataset.idx)));
        });
    }

    goTo(startIndex);

    prev.addEventListener('click', () => goTo(currentIndex - 1));
    next.addEventListener('click', () => goTo(currentIndex + 1));

    function closeLightbox() {
        lb.remove();
        document.removeEventListener('keydown', onKey);
    }
    closeBtn.addEventListener('click', closeLightbox);
    backdrop.addEventListener('click', closeLightbox);
    zoomRst.addEventListener('click', resetZoom);
    img.addEventListener('dblclick', resetZoom);

    function onKey(e) {
        if      (e.key === 'Escape')      closeLightbox();
        else if (e.key === 'ArrowLeft')   goTo(currentIndex - 1);
        else if (e.key === 'ArrowRight')  goTo(currentIndex + 1);
        else if (e.key === '+' || e.key === '=') { scale = Math.min(5, scale + 0.25); applyTransform(); }
        else if (e.key === '-')           { scale = Math.max(1, scale - 0.25); if (scale===1){panX=0;panY=0;} applyTransform(); }
    }
    document.addEventListener('keydown', onKey);

    // Scroll-wheel zoom
    wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        scale = Math.max(1, Math.min(5, scale + (e.deltaY > 0 ? -0.15 : 0.15)));
        if (scale === 1) { panX = 0; panY = 0; }
        applyTransform();
    }, { passive: false });

    // Click to zoom / reset
    wrap.addEventListener('click', (e) => {
        if (isDragging) return;
        if (scale === 1) {
            const rect = wrap.getBoundingClientRect();
            const cx = e.clientX - rect.left - rect.width / 2;
            const cy = e.clientY - rect.top - rect.height / 2;
            scale = 2.5; panX = -cx * 0.6; panY = -cy * 0.6;
        } else {
            resetZoom();
        }
        applyTransform();
    });

    // Drag to pan
    wrap.addEventListener('mousedown', (e) => {
        if (scale <= 1) return;
        e.preventDefault();
        isDragging = false;
        dragStart = { x: e.clientX, y: e.clientY };
        panStart  = { x: panX, y: panY };
        const onMove = (ev) => {
            const dx = ev.clientX - dragStart.x;
            const dy = ev.clientY - dragStart.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging = true;
            panX = panStart.x + dx; panY = panStart.y + dy;
            applyTransform();
        };
        const onUp = () => {
            setTimeout(() => { isDragging = false; }, 50);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // Touch swipe
    let touchStartX = 0;
    lb.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend',   (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 50) goTo(dx < 0 ? currentIndex + 1 : currentIndex - 1);
    });
}

// ── Stat chip updater ─────────────────────────────────────────────
function updateStatChip(label, value) {
    document.querySelectorAll('.stat-chip').forEach(chip => {
        if (chip.querySelector('span')?.textContent === label) {
            const val = chip.querySelector('.stat-chip__value');
            if (val) val.textContent = value;
        }
    });
}

// ── Export helpers ────────────────────────────────────────────────
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    triggerDownload(blob, filename);
}

function downloadCSV(rows, filename) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [
        headers.map(h => `"${h}"`).join(','),
        ...rows.map(row =>
            headers.map(h => {
                const v = String(row[h] ?? '').replace(/"/g, '""');
                return `"${v}"`;
            }).join(',')
        ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    triggerDownload(blob, filename);
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ── CSV/JSON parser for import ─────────────────────────────────────
function parseImportFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const text = e.target.result;
                if (file.name.endsWith('.json')) {
                    const data = JSON.parse(text);
                    resolve(Array.isArray(data) ? data : [data]);
                } else if (file.name.endsWith('.csv')) {
                    const lines = text.split('\n').filter(l => l.trim());
                    const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim());
                    const rows = lines.slice(1).map(line => {
                        const vals = line.match(/(".*?"|[^,]+)/g) || [];
                        const obj = {};
                        headers.forEach((h, i) => {
                            obj[h] = (vals[i] || '').replace(/^"|"$/g,'').trim();
                        });
                        return obj;
                    });
                    resolve(rows);
                } else {
                    reject(new Error('Unsupported file type'));
                }
            } catch(err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsText(file);
    });
}
// ── MultiClock ────────────────────────────────────────────────────
/**
 * MultiClock — world-clock widget in the titlebar.
 *
 * • Hover over the clock icon  → tooltip fades in fast (120 ms),
 *   showing three digital clocks ticking in real time.
 * • Mouse leave                → tooltip fades out slow (600 ms).
 * • Click on the clock icon    → opens a dialog to configure
 *   timezone per clock and AM/PM vs 24-hour format.
 * • All choices persist via api/prefs.php:
 *     clock_timezones  → JSON array of 3 IANA tz strings
 *     clock_timeformat → "12" or "24"
 */
const MultiClock = (() => {
    'use strict';

    // ── IANA timezone options ────────────────────────────────────
    const TZ_OPTIONS = [
        { label: 'Local (device)',          tz: '__local__'                      },
        { label: 'UTC',                     tz: 'UTC'                            },
        { label: 'New York (ET)',            tz: 'America/New_York'               },
        { label: 'Chicago (CT)',             tz: 'America/Chicago'                },
        { label: 'Denver (MT)',              tz: 'America/Denver'                 },
        { label: 'Los Angeles (PT)',         tz: 'America/Los_Angeles'            },
        { label: 'Anchorage (AKT)',          tz: 'America/Anchorage'              },
        { label: 'Honolulu (HT)',            tz: 'Pacific/Honolulu'               },
        { label: 'Phoenix (MST, no DST)',    tz: 'America/Phoenix'                },
        { label: 'Toronto (ET)',             tz: 'America/Toronto'                },
        { label: 'Vancouver (PT)',           tz: 'America/Vancouver'              },
        { label: 'Mexico City (CT)',         tz: 'America/Mexico_City'            },
        { label: 'São Paulo (BRT)',          tz: 'America/Sao_Paulo'              },
        { label: 'Buenos Aires (ART)',       tz: 'America/Argentina/Buenos_Aires' },
        { label: 'London (GMT/BST)',         tz: 'Europe/London'                  },
        { label: 'Dublin (IST)',             tz: 'Europe/Dublin'                  },
        { label: 'Paris / Berlin (CET)',     tz: 'Europe/Paris'                   },
        { label: 'Helsinki (EET)',           tz: 'Europe/Helsinki'                },
        { label: 'Istanbul (TRT)',           tz: 'Europe/Istanbul'                },
        { label: 'Moscow (MSK)',             tz: 'Europe/Moscow'                  },
        { label: 'Dubai (GST)',              tz: 'Asia/Dubai'                     },
        { label: 'Kolkata (IST)',            tz: 'Asia/Kolkata'                   },
        { label: 'Dhaka (BST)',              tz: 'Asia/Dhaka'                     },
        { label: 'Bangkok (ICT)',            tz: 'Asia/Bangkok'                   },
        { label: 'Singapore / KL (SGT)',     tz: 'Asia/Singapore'                 },
        { label: 'Hong Kong (HKT)',          tz: 'Asia/Hong_Kong'                 },
        { label: 'Shanghai / Beijing (CST)', tz: 'Asia/Shanghai'                  },
        { label: 'Tokyo (JST)',              tz: 'Asia/Tokyo'                     },
        { label: 'Seoul (KST)',              tz: 'Asia/Seoul'                     },
        { label: 'Sydney (AEDT/AEST)',       tz: 'Australia/Sydney'               },
        { label: 'Auckland (NZDT/NZST)',     tz: 'Pacific/Auckland'               },
    ];

    const DEFAULT_TZS    = ['__local__', 'America/New_York', 'America/Los_Angeles'];
    const DEFAULT_FORMAT = '24'; // "12" or "24"

    // ── State ────────────────────────────────────────────────────
    let timezones   = [...DEFAULT_TZS];
    let timeFormat  = DEFAULT_FORMAT;   // "12" | "24"
    let tickInterval = null;
    let tooltipVisible = false;
    let leaveTimer     = null;

    // ── DOM refs ─────────────────────────────────────────────────
    let widget, btn, tooltip, tooltipClocks;

    // ── Time formatting ──────────────────────────────────────────
    function formatTime(tz) {
        const use12 = timeFormat === '12';
        const opts = {
            hour:   '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: use12,
        };
        try {
            const tzOpt = tz === '__local__' ? {} : { timeZone: tz };
            return new Date().toLocaleTimeString(undefined, { ...opts, ...tzOpt });
        } catch {
            return '--:--:--';
        }
    }

    function labelFor(tz) {
        if (tz === '__local__') return 'Local';
        const match = TZ_OPTIONS.find(o => o.tz === tz);
        if (match) return match.label;
        return tz.split('/').pop().replace(/_/g, ' ');
    }

    // ── Tooltip rendering ────────────────────────────────────────
    function buildTooltipClock(tz, index) {
        return `
            <div class="clock-tooltip__item" data-slot="${index}">
                <div class="clock-tooltip__label">${escHtml(labelFor(tz))}</div>
                <div class="clock-tooltip__time" data-tz="${escHtml(tz)}">${escHtml(formatTime(tz))}</div>
            </div>`;
    }

    function renderTooltipClocks() {
        if (!tooltipClocks) return;
        tooltipClocks.innerHTML = timezones.map((tz, i) => buildTooltipClock(tz, i)).join('');
    }

    function tickTooltip() {
        if (!tooltipClocks) return;
        tooltipClocks.querySelectorAll('.clock-tooltip__time').forEach(el => {
            el.textContent = formatTime(el.dataset.tz);
        });
    }

    function startTick() {
        if (tickInterval) return;
        tickInterval = setInterval(tickTooltip, 1000);
    }

    function stopTick() {
        clearInterval(tickInterval);
        tickInterval = null;
    }

    // ── Tooltip show / hide ───────────────────────────────────────
    function showTooltip() {
        clearTimeout(leaveTimer);
        if (!tooltipVisible) {
            renderTooltipClocks();
            startTick();
        }
        tooltip.classList.add('clock-tooltip--visible');
        tooltipVisible = true;
    }

    function hideTooltip() {
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => {
            tooltip.classList.remove('clock-tooltip--visible');
            tooltip.classList.add('clock-tooltip--hiding');
            setTimeout(() => {
                tooltip.classList.remove('clock-tooltip--hiding');
                stopTick();
                tooltipVisible = false;
            }, 700);
        }, 0);
    }

    // ── Config dialog ─────────────────────────────────────────────
    function buildTzSelect(slotIndex) {
        const current = timezones[slotIndex] || '__local__';
        const opts = TZ_OPTIONS.map(o =>
            `<option value="${escHtml(o.tz)}"${o.tz === current ? ' selected' : ''}>${escHtml(o.label)}</option>`
        ).join('');
        return `
            <div class="clock-config-modal__row">
                <label class="clock-config-modal__slot-label">Clock ${slotIndex + 1}</label>
                <select class="clock-tz-select" data-slot="${slotIndex}">${opts}</select>
            </div>`;
    }

    function buildFormatToggle() {
        const is12 = timeFormat === '12';
        return `
            <div class="clock-config-modal__row clock-config-modal__row--format">
                <label class="clock-config-modal__slot-label">Format</label>
                <div class="clock-format-toggle" id="clockFormatToggle" role="group" aria-label="Time format">
                    <button class="clock-format-btn${!is12 ? ' active' : ''}" data-fmt="24" type="button">24h</button>
                    <button class="clock-format-btn${is12  ? ' active' : ''}" data-fmt="12" type="button">AM/PM</button>
                </div>
            </div>`;
    }

    function openConfig() {
        clearTimeout(leaveTimer);
        tooltip.classList.remove('clock-tooltip--visible', 'clock-tooltip--hiding');
        tooltipVisible = false;
        stopTick();

        const rows = document.getElementById('clockConfigRows');
        if (rows) {
            rows.innerHTML = [0, 1, 2].map(buildTzSelect).join('') + buildFormatToggle();
            // Wire up format toggle buttons
            rows.querySelectorAll('.clock-format-btn').forEach(b => {
                b.addEventListener('click', () => {
                    rows.querySelectorAll('.clock-format-btn').forEach(x => x.classList.remove('active'));
                    b.classList.add('active');
                });
            });
        }
        Modal.open('clockConfigModal');
    }

    async function saveConfig() {
        const selects = document.querySelectorAll('.clock-tz-select');
        const newTzs  = [...selects].map(s => s.value);
        const fmtBtn  = document.querySelector('.clock-format-btn.active');
        const newFmt  = fmtBtn ? fmtBtn.dataset.fmt : '24';

        timezones  = newTzs;
        timeFormat = newFmt;

        try {
            await Promise.all([
                apiFetch('api/prefs.php', {
                    method: 'POST',
                    body: JSON.stringify({ key: 'clock_timezones', value: JSON.stringify(newTzs) }),
                }),
                apiFetch('api/prefs.php', {
                    method: 'POST',
                    body: JSON.stringify({ key: 'clock_timeformat', value: newFmt }),
                }),
            ]);
            Toast.ok('Clock settings saved.');
        } catch {
            Toast.warn('Could not save clock preferences.');
        }
        Modal.close('clockConfigModal');
    }

    // ── Persistence: load from data attributes set by PHP ────────
    function loadFromDom() {
        const w = document.getElementById('clockWidget');
        if (!w) return;

        const rawTz = w.dataset.tzpref;
        if (rawTz) {
            try {
                const parsed = JSON.parse(rawTz);
                if (Array.isArray(parsed) && parsed.length === 3) timezones = parsed;
            } catch { /* keep defaults */ }
        }

        const rawFmt = w.dataset.fmtpref;
        if (rawFmt === '12' || rawFmt === '24') timeFormat = rawFmt;
    }

    // ── Init ──────────────────────────────────────────────────────
    function init() {
        widget        = document.getElementById('clockWidget');
        btn           = document.getElementById('clockBtn');
        tooltip       = document.getElementById('clockTooltip');
        tooltipClocks = document.getElementById('clockTooltipClocks');

        if (!widget || !btn || !tooltip) return;

        loadFromDom();

        widget.addEventListener('mouseenter', () => showTooltip());
        widget.addEventListener('mouseleave', () => hideTooltip());

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openConfig();
        });

        const saveBtn = document.getElementById('clockConfigSave');
        if (saveBtn) saveBtn.addEventListener('click', saveConfig);

        tooltip.addEventListener('mouseenter', () => clearTimeout(leaveTimer));
        tooltip.addEventListener('mouseleave', () => hideTooltip());
    }

    document.addEventListener('DOMContentLoaded', init);

    return { init, openConfig };
})();