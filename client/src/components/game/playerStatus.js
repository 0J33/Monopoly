// Shared player-status helpers for the desktop panel and the mobile strip.

// Mirrors the server's OFFLINE_REMOVE_MS: a player offline this long can be
// removed by anyone still playing, so a closed tab can't stall the game.
export const OFFLINE_REMOVE_MS = 60000;

export function canRemove(room, p, me) {
    if (!room?.started || room.ended || !me || me.bankrupt || p.bankrupt) return false;
    if (p.userId === me.userId || p.connected || !p.disconnectedAt) return false;
    return Date.now() - p.disconnectedAt >= OFFLINE_REMOVE_MS;
}

// Cash + what everything would fetch from the bank: mortgage value of each
// unmortgaged property plus half the cost of its buildings. What a player
// could raise right now to pay a debt.
export function liquidValue(room, p) {
    let v = p.cash;
    for (const pos of p.owned || []) {
        const d = room.board.tiles[pos], st = room.tileState[pos];
        if (!st.mortgaged) v += d.mortgage || 0;
        if (d.type === 'property' && st.houses > 0) v += Math.floor((d.houseCost * st.houses) / 2);
    }
    return v;
}

// Net worth for rankings: cash + full value of property and buildings
// (mortgaged property counts at half).
export function netWorth(room, p) {
    let v = p.cash;
    for (const pos of p.owned || []) {
        const d = room.board.tiles[pos], st = room.tileState[pos];
        v += st.mortgaged ? (d.mortgage || 0) : (d.price || 0);
        if (d.type === 'property' && st.houses > 0) v += d.houseCost * st.houses;
    }
    return v;
}
