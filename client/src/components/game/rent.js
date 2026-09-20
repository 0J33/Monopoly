/* ============================================================
   What this tile would charge, right now.

   The server owns the real calculation; this mirrors it so a
   tile can show the figure without a round trip. The two must
   agree, so this file is deliberately a transcription of
   engine.rentOwed and nothing cleverer — if that changes, this
   changes with it.

   A utility's rent depends on the roll that brought you there,
   which is not knowable in advance, so it reports the
   multiplier instead of a number. Saying "×10" is honest;
   inventing a figure from the last roll is not.
   ============================================================ */

export function ownsFullGroup(room, ownerId, group) {
    const tiles = room.board.tiles;
    const inGroup = tiles.filter(t => t.type === 'property' && t.group === group);
    return inGroup.length > 0 && inGroup.every(t => room.tileState[t.pos]?.owner === ownerId);
}

/**
 * Rent for landing on `pos` now, or null when nothing would be charged.
 * Utilities return { multiplier } instead of { amount }.
 */
export function rentNow(room, pos) {
    const def = room.board.tiles[pos];
    const st = room.tileState?.[pos];
    if (!def || !st?.owner || st.mortgaged) return null;
    const owner = room.players.find(p => p.userId === st.owner);
    if (!owner || owner.bankrupt) return null;
    if (room.rules?.noRentInJail && owner.inJail) return null;

    if (def.type === 'property') {
        const h = st.houses || 0;
        if (h > 0) return { amount: def.rent[Math.min(h, 5)] };
        return { amount: ownsFullGroup(room, owner.userId, def.group) ? def.rent[0] * 2 : def.rent[0] };
    }
    if (def.type === 'station') {
        const n = owner.owned.reduce((k, p) => k + (room.board.tiles[p]?.type === 'station' ? 1 : 0), 0);
        return { amount: 25 * Math.pow(2, Math.max(0, n - 1)) };
    }
    if (def.type === 'utility') {
        const n = owner.owned.reduce((k, p) => k + (room.board.tiles[p]?.type === 'utility' ? 1 : 0), 0);
        return { multiplier: n === 2 ? 10 : 4 };
    }
    return null;
}

/** The short string a tile shows: "$200" or "×10". */
export function rentLabel(room, pos) {
    const r = rentNow(room, pos);
    if (!r) return null;
    return r.multiplier ? `×${r.multiplier}` : `$${r.amount.toLocaleString()}`;
}
