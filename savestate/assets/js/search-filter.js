/**
 * search-filter.js — SaveState v2 Smart Search Token Extractor
 *
 * Analyses raw notes text and extracts high-signal tokens before the
 * fuzzy search query is fired, so the search engine sees meaningful
 * keywords instead of boilerplate filler.
 *
 * Pipeline:
 *   1. Strip user-defined suppress terms (loaded from server)
 *   2. Run regex detectors for high-signal patterns (stations, OS, versions…)
 *   3. If high-signal tokens found → query with those only
 *   4. If nothing found           → fall back to the full cleaned text
 *   5. PHP re-scores results using boost terms + stop-word penalties
 *
 * Exported global: SearchFilter.extract(rawText) → string
 */

'use strict';

const SearchFilter = (() => {

    // ── Built-in stop phrases ────────────────────────────────────────
    // These are structural filler that appear in almost every note.
    // Kept small and stable — not meant to be exhaustive.
    const BUILTIN_STOP_PHRASES = [
        'eu states', 'eu stated', 'customer states', 'customer stated',
        'customer advised', 'i advised', 'advised customer', 'advised the customer',
        'the customer', 'a customer', 'customer called', 'customer is',
        'please note', 'as per', 'going forward', 'at this time',
        'to be advised', 'to be determined', 'per the customer',
        'customer confirmed', 'confirmed with customer', 'customer would like',
        'customer requested', 'informed the customer', 'let the customer know',
        'reached out', 'following up', 'as previously', 'as mentioned',
        'per our conversation', 'at this point', 'in regards to',
        'with regards to', 'moving forward', 'upon review',
    ];

    // Single stop-words that add no search signal on their own
    const BUILTIN_STOP_WORDS = new Set([
        'the','a','an','and','or','but','in','on','at','to','for',
        'of','with','by','from','is','was','are','were','be','been',
        'has','have','had','will','would','could','should','may','might',
        'this','that','these','those','it','its','their','they','them',
        'he','she','his','her','we','our','us','you','your','i','me','my',
        'not','no','yes','also','then','than','when','where','which','who',
        'what','how','so','if','as','up','out','about','into','over',
        'after','before','between','through','during','just','now','there',
        'here','can','do','did','does','said','told','asked','called',
        'went','got','set','get','put','let','per','re','via',
        // Common note verbs that carry no search signal alone
        'states','stated','advised','confirmed','requested','mentioned',
        'explained','noted','reported','indicated','informed',
    ]);

    // ── Pattern detectors (order matters — more specific first) ──────
    const DETECTORS = [

        // Radio call letters: W/K + 2-4 uppercase letters (e.g. WKRQ, WXYZ, KABC)
        {
            name: 'radio_call_letters',
            pattern: /\b([WK][A-Z]{2,4})\b/g,
            weight: 10,
        },

        // Radio frequencies: 87.5–107.9 FM or 530–1700 AM
        {
            name: 'radio_frequency',
            pattern: /\b((?:8[7-9]|9\d|10[0-7])\.\d\s*(?:FM|fm)?|1[0-7]\d{2}\s*(?:AM|am)?)\b/g,
            weight: 10,
        },

        // OS names and versions
        {
            name: 'operating_system',
            pattern: /\b(windows\s*(?:xp|vista|7|8|8\.1|10|11|server\s*\d+)|mac\s*os\s*(?:x\s*)?(?:\d+[\.\d]*)?|macos\s*(?:ventura|sonoma|sequoia|monterey|big\s*sur|catalina|mojave)?|ios\s*\d*|android\s*\d*|ubuntu\s*[\d\.]*|debian\s*[\d\.]*|fedora\s*[\d\.]*|linux\s*mint|arch\s*linux|centos|rhel|windows)\b/gi,
            weight: 9,
        },

        // Version numbers: v1.2, 3.0.1, 2024.1, iOS 17, etc.
        {
            name: 'version_number',
            pattern: /\bv?(\d{1,4}\.\d{1,4}(?:\.\d{1,4})?(?:\.\d{1,4})?)\b/g,
            weight: 8,
        },

        // Error codes: hex (0x…), HTTP codes, Windows-style (KB######, ERR_…)
        {
            name: 'error_code',
            pattern: /\b(0x[0-9A-Fa-f]{4,}|ERR_[A-Z_]+|KB\d{6,}|[A-Z]{2,}_[A-Z_]{2,}|(?:4\d\d|5\d\d)\s+error)\b/g,
            weight: 9,
        },

        // Podcast / show names: Title Case run of 2–5 words
        // (two or more consecutive Title-Cased words not at sentence start)
        {
            name: 'title_case_phrase',
            pattern: /(?<!\.\s)(?<!\?\s)(?<!\!\s)\b([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,4})\b/g,
            weight: 6,
        },

        // Software / app names: CamelCase tokens
        {
            name: 'camel_case',
            pattern: /\b([A-Z][a-z]+[A-Z][a-zA-Z]*)\b/g,
            weight: 7,
        },

        // All-caps acronyms (3–6 chars): API, DNS, SMTP, VPN, etc.
        {
            name: 'acronym',
            pattern: /\b([A-Z]{3,6})\b/g,
            weight: 5,
        },

        // Ticket / account / case numbers: alphanumeric ID-like tokens
        {
            name: 'id_token',
            pattern: /\b([A-Z]{1,4}[-_]?\d{4,}|\d{4,}[-_]?[A-Z]{1,4})\b/g,
            weight: 8,
        },

        // Phone / frequency numbers that look like meaningful digits (7+ digits)
        {
            name: 'long_number',
            pattern: /\b(\d{7,})\b/g,
            weight: 6,
        },
    ];

    // ── Domain keywords — product/CS-specific terms that pattern detectors miss ──
    // These are medium-signal words that are meaningful in a support context
    // but wouldn't be caught by the OS/error-code/radio-station detectors above.
    // When found in notes text they get promoted into the search query.
    const DOMAIN_KEYWORDS = new Set([
        // Auth / account
        'login', 'log in', 'logout', 'log out', 'signin', 'sign in', 'signout',
        'sign out', 'password', 'account', 'email', 'username', 'credentials',
        'authenticate', 'authentication', 'forgot', 'reset', 'verify', 'verification',
        // Playback / audio
        'playback', 'playing', 'stream', 'streaming', 'buffering', 'cutting out',
        'cuts out', 'skipping', 'skips', 'stopping', 'stops', 'freezing', 'frozen',
        'crashing', 'crashes', 'loading', 'not loading', 'audio', 'volume',
        'silent', 'muted', 'no sound', 'station', 'podcast', 'episode',
        // UI / features
        'contest', 'contests', 'playlist', 'playlists', 'download', 'downloaded',
        'thumbs', 'thumbed', 'downvote', 'favorites', 'library', 'search',
        'notification', 'notifications', 'settings', 'profile', 'subscription',
        'premium', 'plus', 'billing', 'refund', 'charge', 'payment',
        // Errors
        'error', 'errors', 'something went wrong', 'not working', 'broken',
        'failed', 'failure', 'unavailable', 'missing', 'disappeared', 'gone',
        'blank', 'black screen', 'white screen', 'spinning',
        // Devices / platforms
        'iphone', 'ipad', 'android', 'tablet', 'phone', 'mobile', 'browser',
        'safari', 'chrome', 'firefox', 'edge', 'app', 'website', 'web',
        'desktop', 'laptop', 'computer', 'alexa', 'google home', 'siri',
        'carplay', 'car play', 'xbox', 'playstation', 'firetv', 'fire tv',
        'roku', 'apple tv', 'smart tv', 'smart speaker',
    ]);
    let userSuppressTerms = [];   // from search_algorithm table
    let userBoostTerms    = [];   // passed through to PHP via query param
    let kiTerms           = [];   // from known_issues tags + keywords
    let prefsLoaded       = false;

    async function loadPrefs() {
        if (prefsLoaded) return;
        try {
            const data = await apiFetch('api/search_prefs.php');
            prefsLoaded = true; // only mark loaded on success
            userSuppressTerms = (data.suppress || []).map(t => t.term.toLowerCase().trim());
            userBoostTerms    = (data.boost    || []).map(t => t.term.toLowerCase().trim());
            // KI terms — also check if they were pre-injected server-side (settings page)
            const serverKi = (window.SS_KI_TERMS || []);
            const apiKi    = (data.ki_terms || []);
            kiTerms = [...new Set([...serverKi, ...apiKi].map(t => t.toLowerCase().trim()).filter(Boolean))];
        } catch {
            // Non-fatal — fall back to built-ins only
            // Still pick up any server-injected KI terms
            kiTerms = (window.SS_KI_TERMS || []).map(t => t.toLowerCase().trim());
            // Don't set prefsLoaded=true so next call can retry
        }
    }

    // ── Normalise text: lower-case, collapse whitespace ──────────────
    function normalise(text) {
        return text.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    // ── Strip stop phrases from text ─────────────────────────────────
    function stripStopPhrases(text) {
        const phrases = [...BUILTIN_STOP_PHRASES, ...userSuppressTerms];
        // Sort longest first so multi-word phrases match before sub-phrases
        phrases.sort((a, b) => b.length - a.length);
        let out = text;
        for (const phrase of phrases) {
            // Word-boundary aware replacement
            const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), ' ');
        }
        return out.replace(/\s+/g, ' ').trim();
    }

    // ── Remove stop words from a token list ──────────────────────────
    function removeStopWords(tokens) {
        return tokens.filter(t => t.length > 2 && !BUILTIN_STOP_WORDS.has(t.toLowerCase()));
    }

    // ── Run all detectors, return scored token list ───────────────────
    function detectHighSignalTokens(text) {
        const found = new Map(); // token → highest weight seen

        for (const detector of DETECTORS) {
            const re = new RegExp(detector.pattern.source, detector.pattern.flags);
            let m;
            while ((m = re.exec(text)) !== null) {
                const token = (m[1] || m[0]).trim();
                if (!token || token.length < 2) continue;
                const existing = found.get(token.toLowerCase()) || 0;
                if (detector.weight > existing) {
                    found.set(token.toLowerCase(), detector.weight);
                }
            }
        }

        // Sort by weight descending, return top tokens
        return [...found.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([token]) => token);
    }

    // ── Check if a token is covered by any suppress term ────────────────
    // A token is suppressed if it appears inside any suppress phrase,
    // OR if any suppress phrase appears inside the token.
    function isSuppressedToken(token) {
        const t = token.toLowerCase();
        for (const phrase of [...BUILTIN_STOP_PHRASES, ...userSuppressTerms]) {
            const p = phrase.toLowerCase();
            if (p === t || p.includes(t) || t.includes(p)) return true;
        }
        return false;
    }

    // ── Public interface ─────────────────────────────────────────────
    // Set window.SS_SEARCH_DEBUG = true in browser console to enable full tracing.
    // Then call: SearchFilter.extract("your notes text here")
    function extractDebug(rawText) {
        const isDebug = window.SS_SEARCH_DEBUG;

        if (isDebug) {
            console.group('[SearchFilter] extract →', JSON.stringify(rawText).slice(0, 80));
            console.log('1. kiTerms loaded:', kiTerms);
            console.log('2. userSuppressTerms:', userSuppressTerms);
        }

        const stripped = stripStopPhrases(rawText);
        if (isDebug) console.log('3. after stop-phrase strip:', stripped);

        const detectorHits    = detectHighSignalTokens(stripped);
        const rawDetectorHits = detectHighSignalTokens(rawText).filter(t => !isSuppressedToken(t));
        if (isDebug) {
            console.log('4. detector hits (stripped):', detectorHits);
            console.log('5. detector hits (raw, filtered):', rawDetectorHits);
        }

        let highSignal = [...new Set([...detectorHits, ...rawDetectorHits])];

        const strippedLower = stripped.toLowerCase();
        const kiMatches = kiTerms.filter(term =>
            term.length >= 2 && !isSuppressedToken(term) && strippedLower.includes(term)
        );
        if (isDebug) console.log('6. KI term matches:', kiMatches);
        if (kiMatches.length > 0) highSignal = [...new Set([...kiMatches, ...highSignal])];

        const domainSorted  = [...DOMAIN_KEYWORDS].sort((a, b) => b.length - a.length);
        const domainMatches = domainSorted.filter(kw =>
            strippedLower.includes(kw) && !isSuppressedToken(kw)
        );
        if (isDebug) console.log('7. domain keyword matches:', domainMatches);
        if (domainMatches.length > 0) highSignal = [...new Set([...highSignal, ...domainMatches])];

        if (isDebug) console.log('8. merged highSignal:', highSignal);

        const boostMatches = userBoostTerms.filter(bt =>
            !isSuppressedToken(bt) && strippedLower.includes(bt.toLowerCase())
        );
        const boostParam = [...new Set([...highSignal.slice(0, 5), ...boostMatches])].join(',');

        let result;
        if (highSignal.length > 0) {
            const queryTokens = highSignal.slice(0, 6);
            result = { query: queryTokens.join(' '), boost: boostParam, hasHighSignal: true };
        } else {
            const fallbackTokens = removeStopWords(stripped.split(/\s+/)).slice(0, 8);
            result = fallbackTokens.length === 0
                ? { query: '', boost: '', hasHighSignal: false }
                : { query: fallbackTokens.join(' '), boost: boostParam, hasHighSignal: false };
        }

        if (isDebug) {
            console.log('9. FINAL result:', result);
            console.log('   → ?q=' + result.query + (result.boost ? '&boost=' + result.boost : ''));
            console.groupEnd();
        }
        return result;
    }

    return { extract: extractDebug, loadPrefs };

})();