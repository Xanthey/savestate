/**
 * modes.js — SaveState v2
 * Manages Arcade / Laboratory / Business mode switching.
 *
 * Modes affect:
 *  - UI labels (set server-side via SS_CONFIG, swapped here in JS)
 *  - Arcade HUD visibility
 *  - Body data-mode attribute (CSS can hook into this)
 *  - Status/toast message verbiage
 *  - RPG effects (enabled only in arcade mode)
 */

'use strict';

const MODES = {
    arcade: {
        icon:      '🎮',
        label:     'Arcade Mode',
        save:      '⚡ LOG CASE',
        reset:     '🔄 RESET FORM',
        saved:     '🎮 CASE ACQUIRED!',
        panel_l:   '⚔ Contact Stats',
        panel_r:   '📜 Battle Notes',
        panel_hu:  '⚠ Active Alerts',
        notes_ph:  'Battle log entry... describe your encounter.',
        sub:       'Choose your weapon and engage the next ticket.',
    },
    lab: {
        icon:      '🧪',
        label:     'Laboratory Mode',
        save:      'Log Specimen',
        reset:     'Clear Apparatus',
        saved:     '✅ Specimen logged to the vault.',
        panel_l:   '🧪 Specimen Data',
        panel_r:   '📋 Observation Log',
        panel_hu:  '⚠ Known Anomalies',
        notes_ph:  'Document your findings, observations, and hypotheses...',
        sub:       'Belmont Laboratories — Contact Intelligence Division',
    },
    business: {
        icon:      '📋',
        label:     'Business Mode',
        save:      'Save Record',
        reset:     'Clear Form',
        saved:     'Record saved successfully.',
        panel_l:   'Contact Details',
        panel_r:   'Notes',
        panel_hu:  '⚠ Known Issues',
        notes_ph:  'Enter case notes here...',
        sub:       'Contact Management System',
    },
};

let currentMode = 'lab';

function getMode() { return currentMode; }

function applyMode(mode) {
    if (!MODES[mode]) return;
    currentMode = mode;
    document.body.dataset.mode = mode;

    // Force bg-scene to re-evaluate immediately (avoids flash on mode switch)
    const bgScene = document.querySelector(".bg-scene");
    if (bgScene) {
        bgScene.style.animation = "";
        void bgScene.offsetWidth; // reflow
    }

    // Mode badge in subheader
    const badge = document.querySelector('.mode-badge');
    if (badge) {
        badge.className = `mode-badge ${mode}`;
        badge.textContent = `${MODES[mode].icon} ${MODES[mode].label}`;
    }

    // Mode switcher buttons
    document.querySelectorAll('.mode-switcher__btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Arcade HUD
    const hud = document.getElementById('arcadeHud');
    if (hud) hud.classList.toggle('hidden', mode !== 'arcade');

    // Button labels on entry form
    const btnSave  = document.getElementById('btnSave');
    const btnReset = document.getElementById('btnReset');
    if (btnSave)  btnSave.textContent  = MODES[mode].save;
    if (btnReset) btnReset.textContent = MODES[mode].reset;

    // Panel headers — target by panel ID to avoid index fragility
    const leftHeader  = document.querySelector('#contactPanel .panel__header span:first-child');
    const rightHeader = document.querySelector('#notesPanel .panel__header span:first-child');
    const huHeader    = document.querySelector('#headsUpPanel .panel__header span:first-child');
    if (leftHeader)  leftHeader.textContent  = MODES[mode].panel_l;
    if (rightHeader) rightHeader.textContent = MODES[mode].panel_r;
    if (huHeader)    huHeader.textContent    = MODES[mode].panel_hu;

    // Notes placeholder
    const notes = document.getElementById('notes');
    if (notes) notes.placeholder = MODES[mode].notes_ph;

    // Subheader subtitle (if present)
    const subInfo = document.getElementById('subModeInfo');
    if (subInfo) subInfo.textContent = MODES[mode].sub;

    // Persist
    localStorage.setItem('ss_mode', mode);
    saveModePref(mode);

    // Emit custom event so other modules can react
    document.dispatchEvent(new CustomEvent('modechange', { detail: { mode } }));
}

async function saveModePref(mode) {
    try {
        await apiFetch('api/prefs.php', {
            method: 'POST',
            body: JSON.stringify({ key: 'mode', value: mode }),
        });
    } catch { /* silent */ }
}

document.addEventListener('DOMContentLoaded', () => {
    // Read initial mode from body attribute (set by PHP) or localStorage
    const bodyMode = document.body.dataset.mode;
    const stored   = localStorage.getItem('ss_mode');
    const init     = bodyMode || stored || 'lab';
    applyMode(init);

    // Mode switcher clicks
    document.querySelectorAll('.mode-switcher__btn').forEach(btn => {
        btn.addEventListener('click', () => applyMode(btn.dataset.mode));
    });
});

// Export for other modules
window.Modes = { get: getMode, apply: applyMode, text: (m) => MODES[m] || MODES.lab };