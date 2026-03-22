/**
 * rpg.js — SaveState v2 Arcade Mode RPG System
 * XP · Levels · Combos · Particles · Banners · Achievements
 * Buffs · Debuffs · Poison · Word Combos · 8-bit Typing Sounds
 * Only active when mode === 'arcade'
 */

'use strict';

const RPG = (() => {

    // ── Constants ──────────────────────────────────────────────
    const SMALL_XP    = 1;
    const CHECKBOX_XP = 1.5;
    const MEDIUM_XP   = 2;
    const BUTTON_XP   = 1;
    const DELETE_XP   = 2;
    const SAVE_PCT    = 0.25;   // 25% of current level requirement
    const SOLVED_PCT  = 0.15;   // 15% of current level requirement

    // WoW-style exponential XP curve
    const XP_TARGET_BASE = 100;
    const XP_GROWTH      = 1.18;
    const xpTargetFor    = (lv) => Math.max(10, Math.round(XP_TARGET_BASE * Math.pow(XP_GROWTH, Math.max(0, lv - 1))));

    // Combo
    const COMBO_IDLE_MS      = 2000;
    const WORD_COMBO_IDLE_MS = 2000;
    const COMBO_SHAKES       = [10, 25, 50, 75, 100];

    // Word combo labels (Killer Instinct style)
    const WORD_COMBO_LABELS = {
        2: 'Double Combo',  3: 'Triple Combo', 4: 'Super Combo',
        5: 'Hyper Combo',   6: 'Brutal Combo', 7: 'Master Combo',
        8: 'Awesome Combo', 9: 'Blaster Combo',10: 'Monster Combo',
        11: 'King Combo',  12: 'Killer Combo'
    };
    const WORD_COMBO_MAX_LABEL = 'Ultra Combo';

    const DELETE_PARTICLES   = 22;
    const FIREWORKS_PARTICLES= 120;

    // ── State ──────────────────────────────────────────────────
    const state = {
        xp: 0, level: 1, xpTarget: xpTargetFor(1),
        combo: 0, lastHit: 0,
        wordCombo: 0, wordLastHit: 0,
        active: false,
        reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    };

    // Cached element refs
    const refs = {
        hud: null, xpFill: null, xpLabel: null, level: null,
        combo: null, comboValue: null, banner: null,
        wordComboEl: null, wordComboLeft: null, wordComboCenter: null, wordComboRight: null,
    };

    function syncRefs() {
        refs.hud        = document.getElementById('arcadeHud');
        refs.xpFill     = document.getElementById('xpFill');
        refs.xpLabel    = document.getElementById('arcadeXPLabel');
        refs.level      = document.getElementById('arcadeLevel');
        refs.combo      = document.getElementById('arcadeCombo');
        refs.comboValue = document.getElementById('arcadeComboValue');
        refs.banner     = document.getElementById('arcadeBanner');
    }

    // ── Arcade-mode guard ──────────────────────────────────────
    function isArcade() { return window.Modes?.get() === 'arcade'; }

    // ── Day key / persistence ─────────────────────────────────
    function dayKey() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }
    let _dayKey = dayKey();

    function loadDay() {
        try {
            const obj = JSON.parse(localStorage.getItem('arcade:xp') || '{}');
            const rec = obj[_dayKey];
            if (rec) { state.xp = +rec.xp || 0; state.level = +rec.level || 1; }
            state.xpTarget = xpTargetFor(state.level);
        } catch { /**/ }
    }
    function saveDay() {
        try {
            const obj = JSON.parse(localStorage.getItem('arcade:xp') || '{}');
            obj[_dayKey] = { xp: state.xp, level: state.level };
            localStorage.setItem('arcade:xp', JSON.stringify(obj));
        } catch { /**/ }
    }
    loadDay();

    // Check for calendar day rollover
    setInterval(() => {
        const k = dayKey();
        if (k !== _dayKey) {
            _dayKey = k;
            state.xp = 0; state.level = 1; state.xpTarget = xpTargetFor(1);
            syncHUD(); saveDay();
            showBanner('Daily XP Reset');
        }
    }, 60_000);

    // ── 8-bit Audio (Web Audio API) ───────────────────────────
    const Audio8 = (() => {
        let ctx = null;
        function init() {
            if (ctx) return;
            const C = window.AudioContext || window.webkitAudioContext;
            if (C) { ctx = new C(); if (ctx.state === 'suspended') ctx.resume().catch(() => {}); }
        }
        function blip(freq = 880, dur = 0.04, shape = 'square', gain = 0.025) {
            if (!ctx) return;
            const t  = ctx.currentTime;
            const o  = ctx.createOscillator();
            const ga = ctx.createGain();
            o.type = shape;
            o.frequency.value = freq;
            ga.gain.value = gain;
            o.connect(ga).connect(ctx.destination);
            o.start(t); o.stop(t + dur);
        }
        // Named sound effects
        const type      = () => { init(); blip(900,  0.03, 'square',   0.020); };
        const del       = () => { init(); blip(240,  0.06, 'sawtooth', 0.030); };
        const sel       = () => { init(); blip(520,  0.06, 'triangle', 0.020); };
        const milestone = () => {
            init();
            [660, 880, 1320].forEach((f, i) => setTimeout(() => blip(f, 0.08, 'square', 0.03), i * 80));
        };
        const poison    = () => {
            init();
            if (!ctx) return;
            const t0 = ctx.currentTime;
            const o  = ctx.createOscillator();
            const g  = ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(260, t0);
            o.frequency.exponentialRampToValueAtTime(110, t0 + 0.22);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.08,   t0 + 0.025);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
            o.connect(g).connect(ctx.destination);
            o.start(t0); o.stop(t0 + 0.27);
        };
        return { init, blip, type, del, sel, milestone, poison };
    })();

    // ── Overlay ───────────────────────────────────────────────
    let OVERLAY = document.getElementById('arcadeOverlay');
    if (!OVERLAY) {
        OVERLAY = document.createElement('div');
        OVERLAY.id = 'arcadeOverlay';
        OVERLAY.setAttribute('aria-hidden', 'true');
        Object.assign(OVERLAY.style, {
            position: 'fixed', left: '0', top: '0', width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible', zIndex: '2147483647',
        });
        document.body.appendChild(OVERLAY);
    }

    // ── HUD sync ──────────────────────────────────────────────
    function currentProgress() { return state.xp % state.xpTarget; }

    function syncHUD() {
        const pct = (currentProgress() / state.xpTarget) * 100;
        if (refs.xpFill)  refs.xpFill.style.width = pct.toFixed(2) + '%';
        if (refs.xpLabel) {
            const cur = Math.round(currentProgress());
            const tgt = Math.round(state.xpTarget);
            refs.xpLabel.textContent = `${cur}/${tgt} (${Math.round((cur/tgt)*100)}%)`;
        }
        if (refs.level)      refs.level.textContent = `LV ${state.level}`;
        if (refs.comboValue) refs.comboValue.textContent = String(state.combo);
    }

    // ── Banner ─────────────────────────────────────────────────
    let _bannerTimer = null;
    function showBanner(text, color = '#ff4ecd') {
        syncRefs();
        if (!refs.banner) return;
        refs.banner.textContent = text;
        refs.banner.style.color = color;
        refs.banner.classList.remove('show');
        void refs.banner.offsetWidth;
        refs.banner.classList.add('show');
        if (_bannerTimer) clearTimeout(_bannerTimer);
        _bannerTimer = setTimeout(() => refs.banner?.classList.remove('show'), 1600);
    }

    // ── Body shake ────────────────────────────────────────────
    function bodyShake() {
        if (state.reduced) return;
        document.body.classList.remove('arcade-shake');
        void document.body.offsetWidth;
        document.body.classList.add('arcade-shake');
        setTimeout(() => document.body.classList.remove('arcade-shake'), 300);
    }

    // ── XP Queue ──────────────────────────────────────────────
    let xpQueue = 0, xpProcessing = false;
    function enqueueXP(amount) {
        xpQueue += Math.max(0, amount);
        if (!xpProcessing) processXPQueue();
    }
    function processXPQueue() {
        xpProcessing = true;
        const step = () => {
            if (xpQueue <= 0) { xpProcessing = false; saveDay(); return; }
            const need = state.xpTarget - currentProgress();
            if (xpQueue >= need) {
                state.xp += need; xpQueue -= need; syncHUD();
                setTimeout(() => {
                    levelUp(); state.xp = 0; xpQueue = 0; syncHUD();
                    setTimeout(step, 140);
                }, 140);
            } else {
                state.xp += xpQueue; xpQueue = 0; syncHUD();
                xpProcessing = false; saveDay();
            }
        };
        step();
    }

    function comboMultiplier() {
        return 1 + Math.min(1.0, 0.02 * Math.max(0, state.combo - 1));
    }
    function addXP(base) {
        if (!isArcade()) return;
        enqueueXP(base * comboMultiplier() * BuffManager.multiplier());
    }
    function removeXP(base) {
        if (!isArcade()) return;
        state.xp = Math.max(0, state.xp - base);
        syncHUD(); saveDay();
    }

    // ── Level up ──────────────────────────────────────────────
    function levelUp() {
        state.level++; state.xpTarget = xpTargetFor(state.level);
        showBanner(`⬆ LEVEL ${state.level}!`, '#a855f7');
        fireworks(); Audio8.milestone();
        DebuffManager.maybeTriggerOnLevelUp(state.level);
        bodyShake();
    }

    // ── Combo ──────────────────────────────────────────────────
    let _comboTimer = null;
    function bumpCombo() {
        if (!isArcade()) return;
        const now = performance.now();
        if (now - state.lastHit > COMBO_IDLE_MS) { state.combo = 0; hideComboCounter(); }
        state.combo++; state.lastHit = now;
        syncHUD();
        BuffManager.maybeRollOnCombo(state.combo);
        showComboCounter();
        if (_comboTimer) clearTimeout(_comboTimer);
        _comboTimer = setTimeout(() => { state.combo = 0; syncHUD(); hideComboCounter(); }, COMBO_IDLE_MS);
    }
    function hideComboCounter() { syncRefs(); refs.combo?.classList.add('arcade-hidden'); }
    function showComboCounter() {
        syncRefs();
        if (!refs.combo) return;
        state.combo >= 13 ? refs.combo.classList.remove('arcade-hidden') : refs.combo.classList.add('arcade-hidden');
    }

    // ── Word Combo ─────────────────────────────────────────────
    let _wordComboTimer = null;
    function getWordComboLabel(n) {
        if (n <= 1) return '';
        if (n >= 13) return WORD_COMBO_MAX_LABEL;
        return WORD_COMBO_LABELS[n] || '';
    }
    function showWordCombo() {
        const label = getWordComboLabel(state.wordCombo);
        if (!label) return;
        if (!refs.wordComboEl) {
            const container = document.createElement('div');
            container.id = 'arcadeWordCombo';
            Object.assign(container.style, {
                position:'fixed', top:'32px', right:'32px', zIndex:'999999',
                display:'flex', alignItems:'center', justifyContent:'flex-start',
                gap:'18px', pointerEvents:'none', opacity:'0', transition:'opacity 0.3s ease-out',
            });
            const left   = document.createElement('div');
            const center = document.createElement('div');
            const right  = document.createElement('div');
            const font   = 'Impact, ArcadeClassic, Arial Black, sans-serif';
            Object.assign(left.style,   { fontFamily:font, fontSize:'32px', fontWeight:'bold', color:'#FFD600', textShadow:'2px 2px 0 #000', letterSpacing:'2px' });
            Object.assign(center.style, { fontFamily:font, fontSize:'56px', fontWeight:'bold', color:'#2196F3', textShadow:'4px 0 0 #FF1744, 2px 2px 0 #000', letterSpacing:'3px', padding:'0 8px' });
            Object.assign(right.style,  { fontFamily:font, fontSize:'32px', fontWeight:'bold', color:'#FFF',    textShadow:'2px 2px 0 #000', letterSpacing:'2px' });
            container.append(left, center, right);
            OVERLAY.appendChild(container);
            refs.wordComboEl = container;
            refs.wordComboLeft = left; refs.wordComboCenter = center; refs.wordComboRight = right;
        }
        refs.wordComboLeft.textContent   = label;
        refs.wordComboCenter.textContent = state.wordCombo;
        refs.wordComboRight.textContent  = 'words';
        refs.wordComboCenter.style.animation = 'comboShakeScale 0.7s cubic-bezier(.36,.07,.19,.97)';
        setTimeout(() => { refs.wordComboCenter.style.animation = ''; }, 700);
        Audio8.init(); Audio8.blip(880, 0.08, 'square', 0.04);
        refs.wordComboEl.style.opacity = '1';
        if (_wordComboTimer) clearTimeout(_wordComboTimer);
        _wordComboTimer = setTimeout(() => { refs.wordComboEl.style.opacity = '0'; }, WORD_COMBO_IDLE_MS);
    }
    function bumpWordCombo() {
        if (!isArcade()) return;
        const now = performance.now();
        if (now - state.wordLastHit > WORD_COMBO_IDLE_MS) state.wordCombo = 0;
        state.wordCombo++; state.wordLastHit = now;
        if (state.wordCombo <= 13) {
            showWordCombo();
            DebuffManager.checkMitigation(state.wordCombo); // Ultra combo cures poison
        }
    }

    // ── Particles ──────────────────────────────────────────────
    const r  = (a, b) => Math.random() * (b - a) + a;
    const ri = (a, b) => Math.floor(r(a, b + 1));
    function randColor() {
        const H = [140, 160, 90, 200, 300, 20];
        return `hsl(${H[ri(0, H.length-1)]}deg 100% 60%)`;
    }
    function toOverlayCoords(x, y) {
        const rect = OVERLAY.getBoundingClientRect();
        return { x: x - rect.left, y: y - rect.top };
    }
    function spawnParticle(cx, cy, opts = {}) {
        const { x, y } = toOverlayCoords(cx, cy);
        const el   = document.createElement('div');
        const kind = (opts.kind || '').trim();
        const col  = opts.color || randColor();
        const dx   = opts.dx ?? r(-120, 120);
        const dy   = opts.dy ?? r(-160, -40);
        const dur  = (opts.dur ?? r(0.55, 0.95)) * 1000;
        const rot  = opts.rotate ? r(-360, 360) : 0;
        const sz   = r(4, 9);
        el.className = kind || 'arcade-particle';
        Object.assign(el.style, {
            position: 'absolute', left: x + 'px', top: y + 'px',
            width: sz + 'px', height: sz + 'px',
            background: col, borderRadius: kind === 'arcade-shard' ? '1px' : '50%',
            pointerEvents: 'none',
        });
        OVERLAY.appendChild(el);
        if (el.animate) {
            const anim = el.animate(
                [{ transform:`translate(0,0) scale(1) rotate(0deg)`, opacity:.95 },
                 { transform:`translate(${dx}px,${dy}px) scale(.35) rotate(${rot}deg)`, opacity:0 }],
                { duration: dur, easing: 'cubic-bezier(.12,.64,.34,1)', fill: 'forwards' }
            );
            anim.onfinish = () => el.remove();
        } else {
            setTimeout(() => el.remove(), dur);
        }
    }
    function confettiBurst(cx, cy, count = 40) {
        const n = state.reduced ? Math.max(8, Math.floor(count * 0.25)) : count;
        for (let i = 0; i < n; i++) {
            spawnParticle(cx, cy, { kind:'arcade-confetti', color:randColor(), dx:r(-260,260), dy:r(80,240), dur:r(.8,1.4), rotate:true });
        }
    }
    function fireworks() {
        const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
        const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
        const cx = vw / 2, cy = vh * 0.25;
        const n  = state.reduced ? Math.max(24, Math.floor(FIREWORKS_PARTICLES * 0.3)) : FIREWORKS_PARTICLES;
        for (let i = 0; i < n; i++) {
            const t = Math.random() * Math.PI * 2, s = r(80, 260);
            spawnParticle(cx, cy, { dx: Math.cos(t)*s, dy: Math.sin(t)*s, dur: r(.7,1.2) });
        }
        confettiBurst(cx, cy + 20, 60);
    }

    // ── Caret position via DOM mirror ──────────────────────────
    function caretToClient(el) {
        try {
            const rect = el.getBoundingClientRect();
            const isText = (el.tagName === 'TEXTAREA') ||
                (el.tagName === 'INPUT' && ['text','search','email','url','tel','password','number'].includes((el.type||'').toLowerCase()));
            if (!isText) return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
            const mirror = document.createElement('div');
            const cs     = getComputedStyle(el);
            ['fontFamily','fontSize','fontWeight','letterSpacing','textTransform','textAlign','whiteSpace',
             'wordWrap','lineHeight','padding','border','paddingTop','paddingRight','paddingBottom','paddingLeft',
             'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','boxSizing','width']
                .forEach(p => mirror.style[p] = cs[p]);
            Object.assign(mirror.style, { position:'fixed', left:'-10000px', top:'0', visibility:'hidden', width:rect.width+'px' });
            const val  = el.value || '';
            const pos  = el.selectionStart ?? val.length;
            const b    = document.createElement('span'); b.textContent = val.slice(0,pos).replace(/\n$/,'\n\u200b').replace(/ /g,'\u00a0');
            const caret= document.createElement('span'); caret.textContent = '\u200b';
            const a    = document.createElement('span'); a.textContent = val.slice(pos).replace(/ /g,'\u00a0');
            mirror.append(b, caret, a);
            document.body.appendChild(mirror);
            const cr   = caret.getBoundingClientRect();
            const base = mirror.getBoundingClientRect();
            const lh   = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize)*1.2) || 16;
            const x    = rect.left + (cr.left - base.left);
            const y    = rect.top  + (cr.top  - base.top)  + lh * 0.6;
            mirror.remove();
            return { x: Math.min(rect.right, Math.max(rect.left, x)), y: Math.min(rect.bottom, Math.max(rect.top, y)) };
        } catch {
            const rect = el.getBoundingClientRect();
            return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
        }
    }

    // ── Word boundary helpers ──────────────────────────────────
    function isWordBoundary(ch) { return ch && /\s|[.,;:!?]/.test(ch); }
    function completedWordBefore(el, boundaryChar) {
        const pos  = el.selectionStart ?? 0;
        const val  = el.value || '';
        const prev = boundaryChar ? val.slice(0, pos-1) : val.slice(0, pos);
        const m    = prev.match(/([A-Za-z0-9]+)$/);
        return m ? m[1] : '';
    }

    // ── Fly-text helpers ───────────────────────────────────────
    function flyText(cx, cy, word, style = {}) {
        const { x, y } = toOverlayCoords(cx, cy);
        const el = document.createElement('div');
        el.textContent = word.toUpperCase();
        Object.assign(el.style, {
            position:'absolute', left:(x+6)+'px', top:(y-8)+'px', pointerEvents:'none',
            font:'700 14px/1.1 system-ui, sans-serif', color: style.color || '#fff',
            textShadow:'0 1px 2px rgba(0,0,0,.45)', letterSpacing:'.5px',
            filter:`drop-shadow(0 0 8px ${style.glow || 'rgba(255,255,255,.35)'})`,
        });
        OVERLAY.appendChild(el);
        const dur = state.reduced ? 500 : 800;
        const dy  = state.reduced ? -18 : -28;
        if (el.animate) {
            const anim = el.animate(
                [{ transform:'translateY(0px) scale(1)', opacity:0 },
                 { transform:'translateY(-6px) scale(1)', opacity:1, offset:.15 },
                 { transform:`translateY(${dy}px) scale(1.05)`, opacity:0 }],
                { duration:dur, easing:'cubic-bezier(.18,.7,.22,1)', fill:'forwards' }
            );
            anim.onfinish = () => el.remove();
        } else { setTimeout(() => el.remove(), dur); }
    }

    // ── Input event handlers ───────────────────────────────────
    function onType(el) {
        if (!isArcade()) return;
        const p = caretToClient(el);
        addXP(SMALL_XP);
        Audio8.type();

        // Word completion detection
        const pos      = el.selectionStart ?? 0;
        const val      = el.value ?? '';
        const lastChar = pos > 0 ? val.charAt(pos-1) : '';
        if (isWordBoundary(lastChar)) {
            const word = completedWordBefore(el, lastChar);
            if (word) {
                bumpCombo();
                bumpWordCombo();
                // Word complete: fly the word name + light confetti burst
                flyText(p.x, p.y, word);
                confettiBurst(p.x, p.y, 10);
                Audio8.milestone();
                if (!state.reduced) bodyShake();
            }
        }
    }

    function onDelete(el) {
        if (!isArcade()) return;
        state.combo = 0; syncHUD(); hideComboCounter();
        const p = caretToClient(el);
        const n = state.reduced ? Math.max(6, Math.floor(DELETE_PARTICLES * 0.4)) : DELETE_PARTICLES;
        for (let i = 0; i < n; i++) {
            spawnParticle(p.x, p.y, { kind:'arcade-shard', color:'hsl(0deg 100% 60%)', dx:r(-140,140), dy:r(40,180), dur:r(.55,.85), rotate:true });
        }
        flyText(p.x, p.y, '-XP', { color:'#e22', glow:'rgba(255,0,0,.35)' });
        if (!state.reduced) bodyShake();
        removeXP(DELETE_XP);
        Audio8.del();
    }

    function onSelectLike(el, baseXP) {
        if (!isArcade()) return;
        bumpCombo();
        const rct = el.getBoundingClientRect();
        const x = rct.left + rct.width/2, y = rct.top + rct.height/2;
        const n = state.reduced ? 8 : 16;
        for (let i = 0; i < n; i++) spawnParticle(x, y);
        addXP(baseXP);
        Audio8.sel();
    }

    function isSaveButton(el) {
        const label = ((el.value || el.textContent || '').trim()).toLowerCase();
        return /save/.test(label) || (el.getAttribute('data-xp')||'').toLowerCase() === 'save';
    }
    function isSolvedCheckbox(el) {
        if ((el.type||'').toLowerCase() !== 'checkbox') return false;
        const id   = (el.id   || '').toLowerCase();
        const name = (el.name || '').toLowerCase();
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
        const labelTx = (labelEl?.textContent || '').toLowerCase();
        return /solved|resolve|completed|done/.test([id,name,aria,labelTx].join(' ')) ||
               (el.getAttribute('data-xp')||'').toLowerCase() === 'solved';
    }

    function onButtonLike(el) {
        if (!isArcade()) return;
        bumpCombo();
        const rct = el.getBoundingClientRect();
        const x = rct.left + rct.width/2, y = rct.top + rct.height/2;
        const n = state.reduced ? 6 : 12;
        for (let i = 0; i < n; i++) spawnParticle(x, y, { dx:r(-100,100), dy:r(-120,-40) });
        addXP(isSaveButton(el) ? state.xpTarget * SAVE_PCT : BUTTON_XP);
        Audio8.sel();
    }

    // ── Printable key guard ────────────────────────────────────
    function isPrintable(ev) {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
        if (['Unidentified','Process','Dead','Enter','Tab'].includes(ev.key)) return false;
        return ev.key.length === 1;
    }

    // ── Bind all inputs ────────────────────────────────────────
    function bindInputs() {
        const inputSel = 'input[type="text"],input[type="search"],input[type="email"],input[type="url"],input[type="tel"],input[type="password"],input[type="number"],textarea';
        document.querySelectorAll(inputSel).forEach(el => {
            let composing = false;
            el.addEventListener('compositionstart', () => { composing = true; });
            el.addEventListener('compositionend',   () => { composing = false; requestAnimationFrame(() => onType(el)); });
            el.addEventListener('keydown', ev => {
                if (ev.key === 'Backspace' || ev.key === 'Delete') { onDelete(el); return; }
                if (!composing && isPrintable(ev)) requestAnimationFrame(() => onType(el));
            }, { capture: true });
            el.addEventListener('input', ev => {
                const it = ev.inputType || '';
                if (it.startsWith('insertFrom') || it === 'insertReplacementText' || it === 'insertText') {
                    requestAnimationFrame(() => onType(el));
                }
            });
            el.addEventListener('paste', () => requestAnimationFrame(() => onType(el)));
            el.addEventListener('drop',  () => requestAnimationFrame(() => onType(el)));
        });

        document.querySelectorAll('select').forEach(el => {
            el.addEventListener('change', () => onSelectLike(el, MEDIUM_XP));
        });

        document.querySelectorAll('input[type="checkbox"],input[type="radio"]').forEach(el => {
            el.addEventListener('change', () => {
                const xp = isSolvedCheckbox(el) ? state.xpTarget * SOLVED_PCT : CHECKBOX_XP;
                onSelectLike(el, xp);
            });
        });

        document.querySelectorAll('button,input[type="button"],input[type="submit"],a[role="button"]').forEach(el => {
            el.addEventListener('click', () => onButtonLike(el), { capture: true });
        });
    }

    // ══════════════════════════════════════════════════════════
    // ── Buff & Debuff CSS injection ────────────────────────────
    // ══════════════════════════════════════════════════════════
    function injectBuffDebuffStyles() {
        if (document.getElementById('arcade-buffs-debuffs-css')) return;
        const style = document.createElement('style');
        style.id = 'arcade-buffs-debuffs-css';
        style.textContent = `
@keyframes comboShakeScale {
  0%  { transform:scale(1)    translateX(0); }
  10% { transform:scale(1.25) translateX(-4px); }
  20% { transform:scale(1.15) translateX(4px); }
  30% { transform:scale(1.3)  translateX(-6px); }
  40% { transform:scale(1.1)  translateX(6px); }
  50% { transform:scale(1.25) translateX(-4px); }
  60% { transform:scale(1.15) translateX(4px); }
  70% { transform:scale(1.2)  translateX(-2px); }
  80% { transform:scale(1.1)  translateX(2px); }
  100%{ transform:scale(1)    translateX(0); }
}
@keyframes poisonJitter {
  0%  { transform:translate(0,0)     rotate(0); }
  10% { transform:translate(-1px,1px) rotate(-1deg); }
  20% { transform:translate(1px,-1px) rotate(1deg); }
  30% { transform:translate(-1px,-2px)rotate(0); }
  40% { transform:translate(2px,1px) rotate(1deg); }
  50% { transform:translate(-1px,1px) rotate(-1deg); }
  60% { transform:translate(1px,2px) rotate(0); }
  70% { transform:translate(2px,-1px)rotate(1deg); }
  80% { transform:translate(-2px,1px) rotate(-1deg); }
  90% { transform:translate(1px,1px) rotate(0); }
  100%{ transform:translate(0,0)     rotate(0); }
}
@keyframes blinkOut {
  0%  { opacity:1;   transform:scale(1); }
  25% { opacity:.25; }
  50% { opacity:.9;  transform:scale(1.02); }
  75% { opacity:.15; transform:scale(.9); }
  100%{ opacity:0;   transform:scale(0); }
}
#arcadeBuffBar {
  position:absolute; top:0; left:8px;
  transform:translateY(-50%);
  display:flex; gap:8px; align-items:center;
  pointer-events:auto; z-index:99999;
}
#arcadeDebuffBar {
  position:absolute; top:0; right:8px;
  transform:translateY(-50%);
  display:flex; gap:8px; align-items:center;
  flex-direction:row-reverse;
  pointer-events:auto; z-index:99999;
}
.arcade-icon {
  width:24px; height:24px; box-sizing:border-box;
  border-radius:6px; border:2px solid #0aa;
  background:#111; display:inline-flex;
  align-items:center; justify-content:center;
  position:relative; opacity:0; transform:scale(0.85);
  transition:opacity 180ms ease, transform 200ms cubic-bezier(.18,.7,.22,1);
}
.arcade-icon.buff   { border-color:var(--buff-border,#14b8a6); }
.arcade-icon.debuff { border-color:#bf00ff; }
.arcade-icon.show    { opacity:1; transform:scale(1); }
.arcade-icon.fadeout { opacity:0; transform:scale(0.8); }
.arcade-icon.debuff.jitter { animation:poisonJitter 450ms steps(8,end) 1; }
.arcade-icon.debuff.blink  { animation:blinkOut 420ms ease-out 1 forwards; }
.arcade-icon svg { width:72%; height:72%; display:block; }
.arcade-tooltip {
  position:fixed; z-index:2147483647;
  max-width:min(28ch,70vw);
  color:#fff; background:rgba(20,20,28,.96);
  border:2px solid #333; border-radius:10px;
  box-sizing:border-box; padding:10px 12px 10px 10px;
  box-shadow:0 8px 24px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.04);
  font:600 12px/1.25 system-ui,sans-serif;
  pointer-events:none; transform:translateY(-8px); opacity:0;
  transition:opacity 120ms ease, transform 160ms ease;
}
.arcade-tooltip.show { opacity:1; transform:translateY(-12px); }
.arcade-tooltip .row { display:grid; grid-template-columns:28px 1fr; gap:10px; align-items:start; }
.arcade-tooltip .row .big-icon {
  width:28px; height:28px; box-sizing:border-box;
  border-radius:6px; border:2px solid currentColor;
  display:inline-flex; align-items:center; justify-content:center;
  background:#0b0b12;
}
.arcade-tooltip h4 { margin:0 0 4px; padding:0; font-size:12px; line-height:1.2; letter-spacing:.3px; }
.arcade-tooltip p  { margin:0; font-size:11px; color:#cfe6ff; line-height:1.25; }
`;
        document.head.appendChild(style);
    }

    // ══════════════════════════════════════════════════════════
    // ── Tooltip ────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    const Tooltip = (() => {
        let el = null, current = null;
        function ensure() {
            if (el) return el;
            el = document.createElement('div');
            el.className = 'arcade-tooltip';
            document.body.appendChild(el);
            return el;
        }
        function follow(e) {
            if (!el) return;
            const pad = 10;
            const x = Math.min(window.innerWidth  - el.offsetWidth  - pad, Math.max(pad, e.clientX + 16));
            const y = Math.min(window.innerHeight - el.offsetHeight - pad, Math.max(pad, e.clientY - el.offsetHeight - 8));
            el.style.left = x + 'px'; el.style.top = y + 'px';
        }
        const onMove = (e) => follow(e);
        function show(data, mouseEv) {
            current = data; ensure();
            el.style.color = data.color || '#9cf';
            el.innerHTML = `<div class="row"><div class="big-icon" style="color:${data.color||'#9cf'}">${data.htmlIcon}</div><div><h4>${data.title}</h4><p>${data.description}</p></div></div>`;
            requestAnimationFrame(() => { el.classList.add('show'); follow(mouseEv); });
            window.addEventListener('mousemove', onMove, { passive:true });
        }
        function hide() {
            current = null;
            el?.classList.remove('show');
            window.removeEventListener('mousemove', onMove);
        }
        function updateDesc(desc) { if (el && current) { const p = el.querySelector('p'); if (p) p.textContent = desc; } }
        return { show, hide, updateDesc };
    })();

    // ══════════════════════════════════════════════════════════
    // ── Buff Manager ───────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    const BuffManager = (() => {
        const MAX = 4, BASE_CHANCE = 0.25;
        let active = [], hudBar = null, lastMilestone = 0, tickId = 0;

        function chance() { return BASE_CHANCE * Math.pow(0.5, active.length); }

        const COLORS = ['#00c853','#00b8d4','#ffab00','#ff7043','#18a0fb','#c6ff00','#ffd54f','#26a69a'];
        const randEl = (arr) => arr[Math.floor(Math.random()*arr.length)];
        function svgStar (c){ return `<svg viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.9 6.2L22 9.3l-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.8-5-4.9 7.1-1.1L12 2z"/></svg>`; }
        function svgBolt (c){ return `<svg viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>`; }
        function svgFlame(c){ return `<svg viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M13 3s2 2 2 5c0 2-1 3-1 3s3 0 3 4-3 6-6 6-6-2.5-6-6 3-5 5-7c1-1 2-2 3-5z"/></svg>`; }
        function svgWings(c){ return `<svg viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M2 12c3-2 6-3 10-3s7 1 10 3c-2 4-6 7-10 7S4 16 2 12z"/></svg>`; }
        function svgHex  (c){ return `<svg viewBox="0 0 24 24" fill="${c}" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l8 4.6v9.2L12 20l-8-4.2V6.6L12 2z"/></svg>`; }
        const BUFF_DEFS = [
            { id:'nova',     name:'Nova Boost',    color:COLORS[2], icon:()=>svgStar (COLORS[2]) },
            { id:'turbo',    name:'Turbo Drive',   color:COLORS[4], icon:()=>svgWings(COLORS[4]) },
            { id:'blaze',    name:'Blaze Core',    color:COLORS[3], icon:()=>svgFlame(COLORS[3]) },
            { id:'momentum', name:'Momentum Chip', color:COLORS[0], icon:()=>svgHex  (COLORS[0]) },
            { id:'surge',    name:'Surge Cell',    color:COLORS[1], icon:()=>svgBolt (COLORS[1]) },
            { id:'halo',     name:'Halo Matrix',   color:COLORS[6], icon:()=>svgStar (COLORS[6]) },
            { id:'ion',      name:'Ion Thruster',  color:COLORS[7], icon:()=>svgWings(COLORS[7]) },
            { id:'forge',    name:'Forge Ember',   color:COLORS[3], icon:()=>svgFlame(COLORS[3]) },
        ];

        function ensureHUD() {
            if (hudBar) return hudBar;
            syncRefs();
            hudBar = document.getElementById('arcadeBuffBar');
            if (!hudBar) {
                hudBar = document.createElement('div');
                hudBar.id = 'arcadeBuffBar';
                const hud = refs.hud;
                if (hud) { hud.style.overflow = 'visible'; hud.appendChild(hudBar); }
                else     { Object.assign(hudBar.style, { position:'fixed', left:'8px', bottom:'8px' }); document.body.appendChild(hudBar); }
            }
            return hudBar;
        }

        function remove(buff) {
            buff.el.classList.add('fadeout');
            setTimeout(() => buff.el.remove(), 240);
            active = active.filter(b => b !== buff);
        }

        function addRandom() {
            if (active.length >= MAX) return;
            const unused = BUFF_DEFS.filter(d => !active.some(a => a.id === d.id));
            const def    = randEl(unused.length ? unused : BUFF_DEFS);
            const now    = performance.now();
            const durSec = Math.floor(Math.random() * 51) + 10; // 10–60 s
            const end    = now + durSec * 1000;
            const iconHtml = def.icon();

            const el = document.createElement('div');
            el.className = 'arcade-icon buff';
            el.style.setProperty('--buff-border', def.color);
            el.innerHTML = iconHtml;
            ensureHUD().appendChild(el);
            requestAnimationFrame(() => el.classList.add('show'));

            const onEnter = (e) => {
                const remain = Math.max(0, Math.ceil((end - performance.now())/1000));
                Tooltip.show({ title:def.name, htmlIcon:iconHtml, color:def.color, description:`5% XP bonus for ${remain} seconds` }, e);
            };
            const onMove  = () => { const remain = Math.max(0, Math.ceil((end - performance.now())/1000)); Tooltip.updateDesc(`5% XP bonus for ${remain} seconds`); };
            const onLeave = () => Tooltip.hide();
            el.addEventListener('mouseenter', onEnter);
            el.addEventListener('mousemove',  onMove);
            el.addEventListener('mouseleave', onLeave);

            const buff = { id:def.id, name:def.name, color:def.color, el, end };
            active.push(buff);
            // Schedule removal
            setTimeout(() => { if (active.includes(buff)) remove(buff); }, durSec * 1000);
        }

        function tick() {
            const now = performance.now();
            for (const b of [...active]) { if (now >= b.end) remove(b); }
        }

        function maybeRollOnCombo(combo) {
            const milestone = Math.floor(combo / 10);
            if (milestone <= 0 || milestone === lastMilestone) return;
            lastMilestone = milestone;
            if (active.length < MAX && Math.random() < chance()) addRandom();
        }

        function multiplier() { return 1 + 0.05 * active.length; }

        function init() {
            injectBuffDebuffStyles();
            ensureHUD();
            clearInterval(tickId);
            tickId = setInterval(tick, 250);
        }

        return { init, maybeRollOnCombo, multiplier };
    })();

    // ══════════════════════════════════════════════════════════
    // ── Debuff Manager (Poison) ────────────────────────────────
    // ══════════════════════════════════════════════════════════
    const DebuffManager = (() => {
        let _active = false, endTime = 0, icon = null, tickId = 0, drainId = 0, hudBarRight = null;

        function ensureRightHUD() {
            if (hudBarRight) return hudBarRight;
            syncRefs();
            hudBarRight = document.getElementById('arcadeDebuffBar');
            if (!hudBarRight) {
                hudBarRight = document.createElement('div');
                hudBarRight.id = 'arcadeDebuffBar';
                const hud = refs.hud;
                if (hud) { hud.style.overflow = 'visible'; hud.appendChild(hudBarRight); }
                else { Object.assign(hudBarRight.style, { position:'fixed', right:'8px', bottom:'8px' }); document.body.appendChild(hudBarRight); }
            }
            return hudBarRight;
        }

        const POISON_SVG = `<svg viewBox="0 0 24 24" fill="#7cfc00" xmlns="http://www.w3.org/2000/svg"><path d="M12 2c3 2 4 5 4 7 0 2-1 4-3 4 3 0 5 2 5 5 0 2-2 4-6 4s-6-2-6-4c0-3 2-5 5-5-2 0-3-2-3-4 0-2 1-5 4-7z"/></svg>`;

        function renderIcon() {
            const el = document.createElement('div');
            el.className = 'arcade-icon debuff';
            el.innerHTML = POISON_SVG;
            el.classList.add('jitter');
            const onEnter = (e) => Tooltip.show({ title:'Poisoned!', color:'#bf00ff', htmlIcon:POISON_SVG, description:'XP drains slowly for 1 minute. Achieve an Ultra combo to cure!' }, e);
            const onLeave = () => Tooltip.hide();
            el.addEventListener('mouseenter', onEnter);
            el.addEventListener('mouseleave', onLeave);
            ensureRightHUD().appendChild(el);
            requestAnimationFrame(() => el.classList.add('show'));
            return el;
        }

        function startDrain() {
            clearInterval(drainId);
            drainId = setInterval(() => {
                if (!_active) return;
                const prog = currentProgress();
                removeXP(Math.max(1, Math.round(prog * 0.01)));
            }, 5000);
        }

        function clearPoison({ blink = true } = {}) {
            if (!_active) return;
            _active = false;
            clearInterval(drainId); clearInterval(tickId);
            if (icon) {
                if (blink) { icon.classList.add('blink'); setTimeout(() => icon?.remove(), 430); }
                else       icon.remove();
            }
            icon = null;
        }

        function apply() {
            if (_active) return;
            _active = true; endTime = performance.now() + 60_000;
            icon = renderIcon();
            Audio8.poison();
            startDrain();
            clearInterval(tickId);
            tickId = setInterval(() => { if (_active && performance.now() >= endTime) clearPoison({ blink:true }); }, 250);
        }

        function maybeTriggerOnLevelUp() {
            if (!_active && Math.random() < 1/30) apply();
        }

        function checkMitigation(wordComboCount) {
            if (_active && wordComboCount >= 13) clearPoison({ blink:true });
        }

        return { apply, clearPoison, maybeTriggerOnLevelUp, checkMitigation, get active(){ return _active; } };
    })();

    // ══════════════════════════════════════════════════════════
    // ── Public API (backwards-compatible) ─────────────────────
    // ══════════════════════════════════════════════════════════

    function init(arcadeData) {
        if (arcadeData) {
            state.xp    = arcadeData.xp    || 0;
            state.level = arcadeData.level || 1;
            state.xpTarget = xpTargetFor(state.level);
        }
        syncRefs();
        syncHUD();
        injectBuffDebuffStyles();
        BuffManager.init();
        bindInputs();
    }

    // Legacy wrappers so existing callers still work
    function awardXP(amount, label = '') {
        if (!isArcade()) return;
        addXP(amount);
        if (label) showBanner(label, '#ff4ecd');
    }
    function incrementCombo() { bumpCombo(); }
    function updateHUD()      { syncRefs(); syncHUD(); }
    function spawnParticles(count = 12) {
        if (!isArcade()) return;
        const origin = document.getElementById('btnSave')?.getBoundingClientRect()
                    || { left: window.innerWidth/2, top: window.innerHeight/2, width:0, height:0 };
        const cx = origin.left + origin.width/2;
        const cy = origin.top  + origin.height/2;
        for (let i = 0; i < Math.min(count, 24); i++) spawnParticle(cx, cy);
    }

    // Field-touch tracking (unchanged from v2 API)
    let fieldTouched = new Set();
    function trackFieldInteraction(fieldId) {
        if (!isArcade() || fieldTouched.has(fieldId)) return;
        fieldTouched.add(fieldId);
        awardXP(5);
        incrementCombo();
    }
    function resetFieldTracking() {
        fieldTouched.clear(); state.combo = 0;
        clearTimeout(_comboTimer); updateComboDisplay();
    }
    function updateComboDisplay() {
        syncRefs();
        if (!refs.combo) return;
        refs.combo.textContent = state.combo > 1 ? `${state.combo}× Combo` : '';
        refs.combo.style.color = state.combo > 5 ? '#ff4ecd' : state.combo > 2 ? '#f0e000' : 'var(--mode-arcade,#a855f7)';
    }

    // ── Entry saved event ──────────────────────────────────────
    document.addEventListener('entrySaved', (e) => {
        const { solved } = e.detail || {};
        incrementCombo();
        if (solved) showBanner('✓ SOLVED!', '#22d362');
        else        showBanner('📋 LOGGED!', '#ff4ecd');
        resetFieldTracking();
    });

    // ── Wire up field tracking on DOMContentLoaded ─────────────
    document.addEventListener('DOMContentLoaded', () => {
        const fields = document.querySelectorAll('input, select, textarea');
        fields.forEach(f => {
            f.addEventListener('change', () => trackFieldInteraction(f.id || f.name));
            if (f.tagName === 'TEXTAREA' || f.type === 'text') {
                f.addEventListener('input', debounce(() => trackFieldInteraction(f.id || f.name), 1000));
            }
        });
    });

    return {
        init, awardXP, showBanner, spawnParticles,
        incrementCombo, resetFieldTracking, updateHUD,
        trackFieldInteraction,
        // Expose sub-systems for debugging / extensions
        BuffManager, DebuffManager, Audio8,
    };
})();

// ── Bootstrap ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (window.SS_CONFIG?.arcade) {
        RPG.init(window.SS_CONFIG.arcade);
    } else {
        RPG.init(null);
    }
});