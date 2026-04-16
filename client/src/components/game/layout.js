// Board geometry. Single source of truth so Tile, PlayerToken, and overlay
// effects agree on where a position lives.
//
// Layout:
//   pos  0  = GO at TOP-LEFT
//   1–9       top row, moving right
//   10        Jail at TOP-RIGHT
//   11–19     right side, moving down
//   20        Free Parking at BOTTOM-RIGHT
//   21–29     bottom row, moving left
//   30        Go To Jail at BOTTOM-LEFT
//   31–39     left side, moving up back to GO

export const CORNER_PCT = 13;
export const SIDE_PCT = (100 - 2 * CORNER_PCT) / 9;   // ~8.222%

export function tileRect(pos) {
    const C = CORNER_PCT, S = SIDE_PCT;
    if (pos === 0)  return { left: 0,       top: 0,       width: C, height: C, side: 'corner', corner: 'tl' };
    if (pos === 10) return { left: 100 - C, top: 0,       width: C, height: C, side: 'corner', corner: 'tr' };
    if (pos === 20) return { left: 100 - C, top: 100 - C, width: C, height: C, side: 'corner', corner: 'br' };
    if (pos === 30) return { left: 0,       top: 100 - C, width: C, height: C, side: 'corner', corner: 'bl' };

    if (pos >= 1 && pos <= 9) {
        const idx = pos - 1;
        return { left: C + idx * S, top: 0, width: S, height: C, side: 'top' };
    }
    if (pos >= 11 && pos <= 19) {
        const idx = pos - 11;
        return { left: 100 - C, top: C + idx * S, width: C, height: S, side: 'right' };
    }
    if (pos >= 21 && pos <= 29) {
        const idx = pos - 21;
        return { left: 100 - C - (idx + 1) * S, top: 100 - C, width: S, height: C, side: 'bottom' };
    }
    if (pos >= 31 && pos <= 39) {
        const idx = pos - 31;
        return { left: 0, top: 100 - C - (idx + 1) * S, width: C, height: S, side: 'left' };
    }
    return { left: 0, top: 0, width: 0, height: 0, side: 'corner' };
}

// Geometric center of a tile — used by overlay effects (money pops, jail flash).
export function tileCenter(pos) {
    const r = tileRect(pos);
    return [r.left + r.width / 2, r.top + r.height / 2];
}

// Where player tokens sit ON a tile. We put them in a reserved "token strip"
// that lives between the color bar / houses (on the inner edge) and the text
// body (near the outer edge). Keeps tokens from ever covering names, prices,
// or buildings. Corners use the true center — no room for a strip.
//
// Tile vertical layout (bottom tile, percents of tile height):
//     0% ── 20%   color bar (hosts house row)
//    20% ── 38%   TOKEN STRIP
//    38% ── 100%  text body
//
// TOKEN_INNER_OFFSET = 0.29  (center of the strip, from the inner edge).
export const BAR_PCT = 20;
export const TOKEN_STRIP_END_PCT = 38;
export const TOKEN_INNER_OFFSET = 0.29;

export function tokenCenter(pos) {
    const r = tileRect(pos);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const k = TOKEN_INNER_OFFSET;
    if (r.side === 'top')    return [cx, r.top + r.height * (1 - k)];
    if (r.side === 'bottom') return [cx, r.top + r.height * k];
    if (r.side === 'left')   return [r.left + r.width * (1 - k), cy];
    if (r.side === 'right')  return [r.left + r.width * k, cy];
    return [cx, cy];
}

// Which edge of the tile is the "inner" edge (facing the board's center).
// Color bar, houses, and tokens all anchor off this.
export function innerEdge(side) {
    if (side === 'top')    return 'bottom';
    if (side === 'bottom') return 'top';
    if (side === 'left')   return 'right';
    if (side === 'right')  return 'left';
    return null;
}
