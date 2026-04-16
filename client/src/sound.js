// Procedural sound effects via the Web Audio API. No external files, no
// licensing concerns, no extra bytes shipped. Every sound is synthesized from
// oscillators + noise on demand. Volume + mute persist to localStorage.
//
// Each effect is a tiny function that schedules gain-envelopes on oscillators;
// total sample time is <500ms. The audio context is created lazily on the
// first user gesture (browsers block playback otherwise).

const KEY = 'monopoly.audio';
let ctx = null;
let masterGain = null;
let prefs = readPrefs();

function readPrefs() {
    const d = { volume: 0.6, muted: false };
    try { return { ...d, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch { return d; }
}
function writePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = prefs.volume;
    masterGain.connect(ctx.destination);
    return ctx;
}

export function getAudioPrefs() { return { ...prefs }; }
export function setVolume(v) {
    prefs.volume = Math.max(0, Math.min(1, v));
    writePrefs(prefs);
    if (masterGain) masterGain.gain.value = prefs.volume;
}
export function setMuted(m) {
    prefs.muted = !!m;
    writePrefs(prefs);
}

// ─── Building blocks ────────────────────────────────────────────────────────

function tone({ freq = 440, dur = 0.15, type = 'sine', vol = 0.3, attack = 0.005, decay = null, freqEnd = null }) {
    const c = ensureCtx();
    if (!c || prefs.muted) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + dur);
    const end = decay != null ? decay : dur;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.001, now + end);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + end + 0.02);
}

function noise({ dur = 0.12, vol = 0.15, filterFreq = 2000, filterQ = 1, type = 'lowpass' }) {
    const c = ensureCtx();
    if (!c || prefs.muted) return;
    const now = c.currentTime;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(now);
    src.stop(now + dur + 0.02);
}

function chord(freqs, opts = {}) { freqs.forEach((f, i) => setTimeout(() => tone({ freq: f, ...opts }), i * (opts.stagger || 0))); }

// ─── Effect bank ────────────────────────────────────────────────────────────

const EFFECTS = {
    // Short UI tick for button presses.
    click: () => tone({ freq: 820, dur: 0.04, type: 'triangle', vol: 0.15, attack: 0.002, decay: 0.04 }),

    // Rattle of dice: bandpassed noise + two clicks.
    dice: () => {
        noise({ dur: 0.32, vol: 0.22, filterFreq: 1200, filterQ: 3, type: 'bandpass' });
        setTimeout(() => tone({ freq: 900, dur: 0.04, type: 'square', vol: 0.12 }), 200);
        setTimeout(() => tone({ freq: 720, dur: 0.04, type: 'square', vol: 0.12 }), 260);
    },

    // Token step — tiny wooden-ish tick.
    move: () => tone({ freq: 640, dur: 0.04, type: 'triangle', vol: 0.1, attack: 0.001, decay: 0.05 }),

    // Buy property — ascending two-tone "ka-ching".
    buy: () => {
        tone({ freq: 523.25, dur: 0.1, type: 'triangle', vol: 0.22 });
        setTimeout(() => tone({ freq: 783.99, dur: 0.22, type: 'triangle', vol: 0.22, decay: 0.28 }), 80);
    },

    // Build house — wooden hammer tap.
    build: () => {
        noise({ dur: 0.06, vol: 0.25, filterFreq: 300, filterQ: 2, type: 'lowpass' });
        setTimeout(() => tone({ freq: 220, dur: 0.05, type: 'triangle', vol: 0.18 }), 10);
    },

    // Money in — coin drop (two quick high tones).
    'money-in': () => {
        tone({ freq: 1480, dur: 0.08, type: 'triangle', vol: 0.18 });
        setTimeout(() => tone({ freq: 1975, dur: 0.14, type: 'triangle', vol: 0.2, decay: 0.2 }), 50);
    },

    // Money out — descending thunk.
    'money-out': () => {
        tone({ freq: 340, dur: 0.2, type: 'triangle', vol: 0.2, freqEnd: 180, decay: 0.25 });
    },

    // Card draw — paper flip (short high noise).
    card: () => noise({ dur: 0.18, vol: 0.14, filterFreq: 4500, filterQ: 0.5, type: 'highpass' }),

    // Jail entry — ominous low hit.
    jail: () => {
        tone({ freq: 95, dur: 0.4, type: 'sawtooth', vol: 0.2, freqEnd: 60, decay: 0.5 });
        noise({ dur: 0.25, vol: 0.1, filterFreq: 400, filterQ: 1, type: 'lowpass' });
    },

    // Jail escape — bright rising triad.
    'jail-escape': () => {
        tone({ freq: 523, dur: 0.08, type: 'triangle', vol: 0.22 });
        setTimeout(() => tone({ freq: 659, dur: 0.08, type: 'triangle', vol: 0.22 }), 80);
        setTimeout(() => tone({ freq: 880, dur: 0.2, type: 'triangle', vol: 0.24, decay: 0.28 }), 160);
    },

    // Auction gavel — two sharp wood taps.
    'auction-bid': () => tone({ freq: 1100, dur: 0.05, type: 'square', vol: 0.16 }),
    'auction-end': () => {
        noise({ dur: 0.08, vol: 0.3, filterFreq: 250, filterQ: 2, type: 'lowpass' });
        setTimeout(() => noise({ dur: 0.12, vol: 0.3, filterFreq: 200, filterQ: 2, type: 'lowpass' }), 140);
    },

    // Trade — soft chime pair.
    'trade-open': () => tone({ freq: 680, dur: 0.12, type: 'sine', vol: 0.2, decay: 0.2 }),
    'trade-done': () => {
        tone({ freq: 660, dur: 0.12, type: 'sine', vol: 0.22 });
        setTimeout(() => tone({ freq: 990, dur: 0.18, type: 'sine', vol: 0.22, decay: 0.28 }), 80);
        setTimeout(() => tone({ freq: 1320, dur: 0.22, type: 'sine', vol: 0.22, decay: 0.35 }), 180);
    },

    // Pass GO — celebratory rising tone.
    'pass-go': () => {
        tone({ freq: 523, dur: 0.1, type: 'triangle', vol: 0.22 });
        setTimeout(() => tone({ freq: 659, dur: 0.1, type: 'triangle', vol: 0.22 }), 90);
        setTimeout(() => tone({ freq: 880, dur: 0.28, type: 'triangle', vol: 0.26, decay: 0.35 }), 180);
    },

    // Turn start — low UI blip.
    'turn-start': () => tone({ freq: 440, dur: 0.06, type: 'sine', vol: 0.14 }),

    // Victory — arpeggio fanfare.
    victory: () => {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.3, decay: 0.3 }), i * 110));
        setTimeout(() => tone({ freq: 1319, dur: 0.6, type: 'triangle', vol: 0.32, decay: 0.7 }), 500);
    },

    // Bankruptcy — descending dirge.
    bankrupt: () => {
        const notes = [440, 392, 349, 294];
        notes.forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.25, type: 'sawtooth', vol: 0.22, decay: 0.3 }), i * 180));
    },

    // Error / negative feedback.
    error: () => {
        tone({ freq: 220, dur: 0.12, type: 'square', vol: 0.18 });
        setTimeout(() => tone({ freq: 175, dur: 0.18, type: 'square', vol: 0.18, decay: 0.22 }), 60);
    },

    // Chat message ping.
    chat: () => tone({ freq: 1240, dur: 0.06, type: 'sine', vol: 0.13 }),

    // Mortgage / unmortgage — low metallic tap.
    mortgage: () => {
        tone({ freq: 280, dur: 0.12, type: 'triangle', vol: 0.18, decay: 0.18 });
        noise({ dur: 0.05, vol: 0.1, filterFreq: 800, filterQ: 2, type: 'bandpass' });
    },
};

export function play(key) {
    const fn = EFFECTS[key];
    if (!fn) return;
    try { fn(); } catch {}
}

// Server event types → sound keys.
const EVENT_TO_SOUND = {
    'roll':           'dice',
    'move':           'move',
    'buy':            'buy',
    'build':          'build',
    'sell-house':     'build',
    'money':          null,       // handled below (direction-dependent)
    'draw-card':      'card',
    'jail':           'jail',
    'jail-escape':    'jail-escape',
    'auction-bid':    'auction-bid',
    'auction-end':    'auction-end',
    'auction-start':  'auction-bid',
    'trade-open':     'trade-open',
    'trade-accept':   'trade-open',
    'trade-update':   'trade-open',
    'trade-executed': 'trade-done',
    'turn-start':     'turn-start',
    'bankrupt':       'bankrupt',
    'mortgage':       'mortgage',
    'unmortgage':     'mortgage',
};

export function playEvents(events) {
    if (prefs.muted || !Array.isArray(events)) return;
    let delay = 0;
    for (const e of events) {
        let key = EVENT_TO_SOUND[e.type];
        if (e.type === 'money') {
            if (e.reason === 'pass-go') key = 'pass-go';
            else if (e.to !== 'bank' && e.to !== 'pot') key = 'money-in';
            else key = 'money-out';
        }
        if (!key) continue;
        if (delay === 0) play(key);
        else setTimeout(() => play(key), delay);
        delay += 70;
    }
}

// Global click-sound installer. Attaches one listener to the document; any
// <button> (or element with .btn / [data-sound="click"]) triggers the click
// tick. Cheap to ignore false positives.
export function installGlobalClickSound() {
    document.addEventListener('click', (e) => {
        const el = e.target?.closest?.('button, .btn, [data-sound="click"]');
        if (!el || el.disabled) return;
        // Skip clicks on inputs wrapped in a label etc.
        if (el.dataset.noSound) return;
        play('click');
    }, { capture: true });
}
