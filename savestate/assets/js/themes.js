/**
 * themes.js — SaveState v2
 * Theme switcher: applies theme class, persists to server + localStorage.
 * Renders a fully custom dropdown in place of the native <select>.
 */

'use strict';

// ── Grouped theme definitions ─────────────────────────────────
const THEME_GROUPS = [
    {
        label: 'Standard',
        themes: [
            { value: 'amber-dark',    label: 'Amber Terminal',   swatch: '#ffb300' },
            { value: 'amber-light',   label: 'Amber – Light',    swatch: '#ffe082' },
            { value: 'cyberpunk',     label: 'Cyberpunk',        swatch: '#f0e000' },
            { value: 'dark',          label: 'Dark',             swatch: '#1a2233' },
            { value: 'iheart-dark',   label: 'iHeart – Dark',    swatch: '#e4002b' },
            { value: 'iheart-light',  label: 'iHeart – Light',   swatch: '#ff4d6d' },
            { value: 'light',         label: 'Light',            swatch: '#e8edf5' },
            { value: 'ocean',         label: 'Ocean Dark',       swatch: '#0a7ea4' },
            { value: 'rose',          label: 'Rose Light',       swatch: '#e8a0a8' },
            { value: 'synthwave',     label: 'Synthwave',        swatch: '#ff00cc' },
        ],
    },
    {
        label: 'Arcade',
        themes: [
            { value: 'castlevania',   label: 'Castlevania',      swatch: '#8b0000' },
            { value: 'ff6',           label: 'Final Fantasy VI',  swatch: '#6a3fa0' },
            { value: 'gameboy',       label: 'Game Boy',         swatch: '#8bac0f' },
            { value: 'luigi',         label: 'Luigi',            swatch: '#3a9c35' },
            { value: 'mario',         label: 'Mario',            swatch: '#e52222' },
            { value: 'megaman',       label: 'Mega Man',         swatch: '#4ab8e8' },
            { value: 'metroid',       label: 'Metroid',          swatch: '#f97316' },
            { value: 'sonic',         label: 'Sonic',            swatch: '#0050d8' },
            { value: 'tmnt',          label: 'TMNT',             swatch: '#3cb371' },
            { value: 'zelda',         label: 'Zelda',            swatch: '#c8a000' },
        ],
    },
    {
        label: 'Computer',
        themes: [
            { value: 'apple2',        label: 'Apple II',         swatch: '#33ff33' },
            { value: 'bios',          label: 'BIOS / POST',      swatch: '#00ffff' },
            { value: 'c64',           label: 'Commodore 64',     swatch: '#a0a0ff' },
            { value: 'ibm5250',       label: 'IBM 5250 / AS400', swatch: '#00cc00' },
            { value: 'msdos',         label: 'MS-DOS',           swatch: '#aaaaaa' },
            { value: 'cde',           label: 'Motif / CDE',      swatch: '#4040c0' },
            { value: 'nextstep',      label: 'NeXTSTEP',         swatch: '#e8e8e8' },
            { value: 'trs80',         label: 'TRS-80',           swatch: '#ffffff' },
            { value: 'win16-light',   label: 'Win 3.11 Classic',  swatch: '#008080' },
            { value: 'win16-dark',    label: 'Win 3.11 HiContrast', swatch: '#00ffff' },
        ],
    },
];

// Flat list derived from groups (used for class cleanup, lookups, etc.)
const THEMES = THEME_GROUPS.flatMap(g => g.themes);

const THEME_CLASSES = THEMES.map(t => 'theme-' + t.value);

function applyTheme(theme) {
    document.body.classList.remove(...THEME_CLASSES);
    document.body.classList.add('theme-' + theme);
    localStorage.setItem('ss_theme', theme);
}

async function saveThemePref(theme) {
    try {
        await apiFetch('api/prefs.php', {
            method: 'POST',
            body: JSON.stringify({ key: 'theme', value: theme }),
        });
    } catch { /* silent */ }
}

// ── Custom dropdown ────────────────────────────────────────────
function buildPicker(select, currentTheme) {
    // Build wrapper
    const picker = document.createElement('div');
    picker.className = 'theme-picker';
    picker.setAttribute('aria-label', 'Theme selector');

    // Trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'theme-picker__trigger';
    const activeTheme = THEMES.find(t => t.value === currentTheme) || THEMES[0];
    trigger.innerHTML = `
        <span class="theme-swatch" style="width:10px;height:10px;border-radius:50%;
              background:${activeTheme.swatch};border:1px solid rgba(255,255,255,0.2);flex-shrink:0"></span>
        <span class="theme-picker__label">${activeTheme.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>`;

    // Menu
    const menu = document.createElement('div');
    menu.className = 'theme-picker__menu';
    menu.setAttribute('role', 'listbox');

    // Render grouped sections — each group becomes its own column
    THEME_GROUPS.forEach(group => {
        const col = document.createElement('div');
        col.className = 'theme-picker__column';

        // Column header
        const header = document.createElement('div');
        header.className = 'theme-picker__group-header';
        header.textContent = group.label;
        col.appendChild(header);

        // Options in this group
        group.themes.forEach(t => {
            const opt = document.createElement('div');
            opt.className = 'theme-picker__option' + (t.value === currentTheme ? ' active' : '');
            opt.setAttribute('role', 'option');
            opt.dataset.value = t.value;
            opt.innerHTML = `
                <span class="theme-swatch" style="background:${t.swatch}"></span>
                ${t.label}`;

            opt.addEventListener('click', () => {
                // Update native select (keeps server sync working)
                select.value = t.value;

                // Update trigger label + swatch
                trigger.querySelector('.theme-picker__label').textContent = t.label;
                trigger.querySelector('.theme-swatch').style.background = t.swatch;

                // Update active state
                menu.querySelectorAll('.theme-picker__option').forEach(o =>
                    o.classList.toggle('active', o.dataset.value === t.value));

                applyTheme(t.value);
                saveThemePref(t.value);
                closePicker();
            });

            col.appendChild(opt);
        });

        menu.appendChild(col);
    });

    picker.appendChild(trigger);
    picker.appendChild(menu);

    // Toggle open/close
    function openPicker() {
        picker.classList.add('open');
        // Scroll active option into view
        const active = menu.querySelector('.active');
        if (active) active.scrollIntoView({ block: 'nearest' });
    }
    function closePicker() { picker.classList.remove('open'); }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        picker.classList.contains('open') ? closePicker() : openPicker();
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!picker.contains(e.target)) closePicker();
    });

    // Keyboard: Escape closes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePicker();
    });

    // Insert picker right after the hidden select
    select.insertAdjacentElement('afterend', picker);
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('themeSelect');
    if (!select) return;

    const current = localStorage.getItem('ss_theme')
        || [...document.body.classList]
              .find(c => c.startsWith('theme-'))
              ?.replace('theme-', '')
        || 'dark';

    applyTheme(current);
    select.value = current;

    buildPicker(select, current);

    // Keep native select in sync (for any legacy listeners)
    select.addEventListener('change', () => {
        applyTheme(select.value);
        saveThemePref(select.value);
    });
});