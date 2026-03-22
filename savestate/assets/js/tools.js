/**
 * tools.js — SaveState v2
 * Diagnostics tools: Clipboard, Keyboard, Mouse, Mic, Speakers, System Info
 * Known Issues manager lives in settings.js
 */

'use strict';

// ── System Info ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? '—';
    };

    set('screenRes',    `${screen.width} × ${screen.height}`);
    set('windowSize',   `${window.innerWidth} × ${window.innerHeight}`);
    set('pixelRatio',   window.devicePixelRatio);
    set('colorDepth',   screen.colorDepth + '-bit');
    set('userAgent',    navigator.userAgent);
    set('browserLang',  navigator.language);
    set('platformOS',   navigator.platform);
    set('cpuCores',     navigator.hardwareConcurrency ?? '?');
    set('memory',       navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '—');
    set('cookiesOk',    navigator.cookieEnabled ? 'Yes' : 'No');
    set('onlineStatus', navigator.onLine ? 'Online' : 'Offline');
    set('timeZone',     Intl.DateTimeFormat().resolvedOptions().timeZone);
});

// ── Clipboard ─────────────────────────────────────────────────────
document.getElementById('clipboardBtn')?.addEventListener('click', async () => {
    const out = document.getElementById('clipboardOutput');
    try {
        const text = await navigator.clipboard.readText();
        out.textContent = text || '(empty)';
    } catch {
        out.textContent = 'Permission denied — allow clipboard access and try again.';
    }
});

// ── Keyboard Tester ───────────────────────────────────────────────
(function() {
    const box  = document.getElementById('keyboardBox');
    const log  = document.getElementById('keyLog');
    if (!box || !log) return;

    box.addEventListener('focus', () => { box.textContent = ''; });
    box.addEventListener('keydown', e => {
        e.preventDefault();
        const line = `[${e.type.padEnd(7)}] key="${e.key}" code="${e.code}" repeat=${e.repeat}`;
        log.textContent = line + '\n' + log.textContent;
    });
})();

// ── Mouse Tester ──────────────────────────────────────────────────
(function() {
    const area   = document.getElementById('mouseArea');
    const xhair  = document.getElementById('mouseXhair');
    const xEl    = document.getElementById('mouseX');
    const yEl    = document.getElementById('mouseY');
    const evtEl  = document.getElementById('mouseEvent');
    if (!area) return;

    const update = (e, evtName) => {
        const rect = area.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        if (xEl)   xEl.textContent  = x;
        if (yEl)   yEl.textContent  = y;
        if (evtEl) evtEl.textContent = evtName;
        if (xhair) {
            xhair.style.left    = x + 'px';
            xhair.style.top     = y + 'px';
            xhair.style.display = '';
        }
    };

    const evtNames = {
        mousemove:   'Move',
        mousedown:   e => ['Left','Middle','Right'][e.button] + ' Down',
        mouseup:     e => ['Left','Middle','Right'][e.button] + ' Up',
        contextmenu: () => 'Right Click',
        dblclick:    () => 'Double Click',
    };

    Object.entries(evtNames).forEach(([evt, label]) => {
        area.addEventListener(evt, e => {
            if (evt === 'contextmenu') e.preventDefault();
            update(e, typeof label === 'function' ? label(e) : label);
        });
    });
})();

// ── Microphone / Echo Test ────────────────────────────────────────
(function() {
    let mediaRecorder, chunks = [];
    const startBtn  = document.getElementById('startRecording');
    const stopBtn   = document.getElementById('stopRecording');
    const statusEl  = document.getElementById('micStatus');
    const audioEl   = document.getElementById('playbackAudio');

    startBtn?.addEventListener('click', async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            chunks = [];
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                audioEl.src = URL.createObjectURL(blob);
                audioEl.style.display = '';
                audioEl.play().catch(() => {});
                stream.getTracks().forEach(t => t.stop());
                if (statusEl) statusEl.textContent = 'Playback ready';
            };
            mediaRecorder.start();
            startBtn.disabled = true;
            stopBtn.disabled  = false;
            if (statusEl) statusEl.textContent = '● Recording…';
        } catch(e) {
            if (statusEl) statusEl.textContent = 'Error: ' + e.message;
        }
    });

    stopBtn?.addEventListener('click', () => {
        mediaRecorder?.stop();
        startBtn.disabled = false;
        stopBtn.disabled  = true;
    });
})();

// ── Speaker Test ──────────────────────────────────────────────────
function playTone(freq, duration = 0.5) {
    try {
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch(e) {
        Toast.err('Audio error: ' + e.message);
    }
}

function playMelody() {
    const notes = [261.63,329.63,392.00,523.25,392.00,329.63,261.63];
    notes.forEach((freq, i) => setTimeout(() => playTone(freq, 0.3), i * 200));
}

document.getElementById('playTone440')?.addEventListener('click', () => playTone(440));
document.getElementById('playTone880')?.addEventListener('click', () => playTone(880));
document.getElementById('playMelody')?.addEventListener('click', playMelody);