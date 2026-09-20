/* ============================================================
   Player colours, made legible on a dark table.

   A token colour is chosen to look good as a puck — a filled
   circle with a white rim and a gloss. The same hex used as
   TEXT, or as a thin stripe on dark felt, is a different
   problem: Black (#111827) against the board is invisible, and
   Brown and Indigo are not much better. Someone picked Black
   and then could not find their own name in the chat or their
   own properties on the board.

   So there are two colours per player: the true one for
   anything with its own background (pucks, swatches, panel
   borders), and a lifted one for anything drawn AS the colour
   on dark — text, stripes, glows. The lift keeps the hue and
   raises the lightness until it clears a contrast floor, so
   Black stays recognisably the black player: a light grey, not
   a different colour.
   ============================================================ */

/** sRGB relative luminance, 0 (black) to 1 (white). */
export function luminance(hex) {
    const c = parse(hex);
    if (!c) return 1;
    const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** Contrast ratio between two colours, the WCAG way. */
export function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The colour to draw this player's name, stripe or glow in, on dark felt.
 * Keeps the hue, lifts the lightness until it reads. Idempotent, and a
 * no-op for anything already bright enough.
 */
export function readable(hex, { against = '#14352a', min = 4.0 } = {}) {
    const c = parse(hex);
    if (!c) return hex;
    let { h, s, l } = rgbToHsl(c);
    // A colour with no saturation has no hue to protect, so it can go much
    // lighter; a saturated one is kept saturated so it stays identifiable.
    s = Math.max(s, 0.25);
    let out = hslToHex(h, s, l);
    // Walk lightness up in small steps rather than jumping, so a colour that
    // only just fails ends up only just passing and the set stays distinct.
    for (let i = 0; i < 40 && contrast(out, against) < min; i++) {
        l = Math.min(0.92, l + 0.02);
        out = hslToHex(h, s, l);
    }
    return out;
}

/** A translucent wash of a colour, for tinting a tile it owns. */
export function wash(hex, alpha) {
    const c = parse(hex);
    return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})` : 'transparent';
}

/* ── conversions ─────────────────────────────────────────────────────── */

function parse(hex) {
    if (typeof hex !== 'string') return null;
    let h = hex.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function rgbToHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return { h, s, l };
}

function hslToHex(h, s, l) {
    const f = (n) => {
        const k = (n + h * 12) % 12;
        const a = s * Math.min(l, 1 - l);
        const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}
