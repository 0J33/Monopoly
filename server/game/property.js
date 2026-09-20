// Property-management actions: mortgage, unmortgage, build house / hotel,
// demolish. All route through engine.transfer for consistent money flow.

const { transfer, tileDef, tileSt, ownedInGroup, ownsFullGroup } = require('./engine');
const { appendLog } = require('./state');

// Common guard: a live game, a real tile, a player still in it, on their turn.
//
// The turn check was missing entirely, so anyone could build a hotel, mortgage
// or sell in the middle of someone else's roll — including reacting to a rent
// they had just watched someone else land on.
//
// The one exception is a player who owes money: settling a debt is exactly
// when you must be able to mortgage and sell, and a debt can outlive the
// moment it was created (a card that charges every player resolves one at a
// time). Being owed something is not an exception — only owing.
function check(room, player, pos) {
    if (!room.started || room.ended) return 'not-in-game';
    if (player.bankrupt) return 'bankrupt';
    if (!Number.isInteger(pos) || pos < 0 || pos >= room.board.tiles.length) return 'bad-tile';
    if (tileSt(room, pos)?.owner !== player.userId) return 'not-owner';
    const active = room.players[room.turnIndex];
    const owes = room.debts.some(d => d.userId === player.userId);
    if (!owes && active?.userId !== player.userId) return 'not-your-turn';
    return null;
}
// Spending money you owe on buildings or interest isn't allowed.
function inDebt(room, player) {
    return room.debts.some(d => d.userId === player.userId);
}

// ─── Mortgage ────────────────────────────────────────────────────────────────
function mortgage(room, player, pos) {
    const bad = check(room, player, pos);
    if (bad) return { ok: false, error: bad };
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!['property', 'station', 'utility'].includes(def.type)) return { ok: false, error: 'not-mortgageable' };
    if (st.mortgaged) return { ok: false, error: 'already-mortgaged' };
    if (def.type === 'property' && st.houses > 0) return { ok: false, error: 'sell-buildings-first' };
    // Can't mortgage a property in a color group that has buildings on any of
    // its siblings — standard rule (would cause weird rent states otherwise).
    if (def.type === 'property') {
        for (let i = 0; i < 40; i++) {
            const d = tileDef(room, i), s = tileSt(room, i);
            if (d.type === 'property' && d.group === def.group && s.owner === player.userId && s.houses > 0) {
                return { ok: false, error: 'group-has-buildings' };
            }
        }
    }
    st.mortgaged = true;
    const r = transfer(room, 'bank', player.userId, def.mortgage, 'mortgage');
    appendLog(room, { kind: 'mortgage', userId: player.userId, pos, amount: def.mortgage });
    return { ok: true, events: r.events.concat({ type: 'mortgage', userId: player.userId, pos }) };
}

function unmortgage(room, player, pos) {
    const bad = check(room, player, pos);
    if (bad) return { ok: false, error: bad };
    if (inDebt(room, player)) return { ok: false, error: 'pay-debt-first' };
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!st.mortgaged) return { ok: false, error: 'not-mortgaged' };
    const cost = Math.ceil(def.mortgage * room.rules.mortgageRebuyRate);
    if (player.cash < cost) return { ok: false, error: 'insufficient', needed: cost };
    const r = transfer(room, player.userId, 'bank', cost, 'unmortgage');
    if (!r.ok) return r;
    st.mortgaged = false;
    appendLog(room, { kind: 'unmortgage', userId: player.userId, pos, amount: cost });
    return { ok: true, events: r.events.concat({ type: 'unmortgage', userId: player.userId, pos }) };
}

// ─── Houses / Hotels ─────────────────────────────────────────────────────────
// With rules.evenBuild on (default), you must keep all properties in a color
// group within 1 house of each other.
function canBuildEven(room, player, pos) {
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!room.rules.evenBuild) return true;
    let minInGroup = Infinity;
    for (let i = 0; i < 40; i++) {
        const d = tileDef(room, i), s = tileSt(room, i);
        if (d.type === 'property' && d.group === def.group && s.owner === player.userId) {
            if (s.houses < minInGroup) minInGroup = s.houses;
        }
    }
    return st.houses <= minInGroup;
}

function canSellEven(room, player, pos) {
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!room.rules.evenBuild) return true;
    let maxInGroup = -Infinity;
    for (let i = 0; i < 40; i++) {
        const d = tileDef(room, i), s = tileSt(room, i);
        if (d.type === 'property' && d.group === def.group && s.owner === player.userId) {
            if (s.houses > maxInGroup) maxInGroup = s.houses;
        }
    }
    return st.houses >= maxInGroup;
}

function buildHouse(room, player, pos) {
    const bad = check(room, player, pos);
    if (bad) return { ok: false, error: bad };
    if (inDebt(room, player)) return { ok: false, error: 'pay-debt-first' };
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (def.type !== 'property') return { ok: false, error: 'not-buildable' };
    if (st.mortgaged) return { ok: false, error: 'mortgaged' };
    if (st.houses >= 5) return { ok: false, error: 'max-built' };
    if (!ownsFullGroup(room, player, def.group)) return { ok: false, error: 'not-monopoly' };
    // Group contains mortgaged tiles? Block unless the rule allows it.
    if (!room.rules.allowDevOnMortgaged) {
        for (let i = 0; i < 40; i++) {
            const d = tileDef(room, i), s = tileSt(room, i);
            if (d.type === 'property' && d.group === def.group && s.owner === player.userId && s.mortgaged) {
                return { ok: false, error: 'group-has-mortgaged' };
            }
        }
    }
    if (!canBuildEven(room, player, pos)) return { ok: false, error: 'uneven-build' };
    if (player.cash < def.houseCost) return { ok: false, error: 'insufficient' };

    // Bank supply: houses go up from 0→4, hotel is 5 (which returns 4 houses
    // to the bank and consumes 1 hotel).
    if (st.houses < 4) {
        if (room.bank.houses <= 0) return { ok: false, error: 'no-houses' };
        room.bank.houses -= 1;
        st.houses += 1;
    } else {
        if (room.bank.hotels <= 0) return { ok: false, error: 'no-hotels' };
        room.bank.hotels -= 1;
        room.bank.houses += 4;
        st.houses = 5;
    }
    const r = transfer(room, player.userId, 'bank', def.houseCost, 'build');
    if (!r.ok) { /* we already deducted bank supply; rollback */
        if (st.houses === 5) { room.bank.hotels += 1; room.bank.houses -= 4; st.houses = 4; }
        else { room.bank.houses += 1; st.houses -= 1; }
        return r;
    }
    player.stats.housesBuilt += 1;
    appendLog(room, { kind: 'build', userId: player.userId, pos, houses: st.houses, amount: def.houseCost });
    return { ok: true, events: r.events.concat({ type: 'build', userId: player.userId, pos, houses: st.houses }) };
}

function sellHouse(room, player, pos) {
    const bad = check(room, player, pos);
    if (bad) return { ok: false, error: bad };
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (def.type !== 'property') return { ok: false, error: 'not-buildable' };
    if (st.houses <= 0) return { ok: false, error: 'no-houses' };
    if (!canSellEven(room, player, pos)) return { ok: false, error: 'uneven-sell' };

    let refund = Math.floor(def.houseCost / 2);
    if (st.houses === 5) {
        // A hotel breaks down into 4 houses from the bank. In a housing
        // shortage it breaks down to as many as the bank has, and the rest
        // are sold too (so a player in debt can always liquidate).
        const back = Math.min(4, room.bank.houses);
        room.bank.hotels += 1;
        room.bank.houses -= back;
        refund = Math.floor(def.houseCost / 2) * (5 - back);
        st.houses = back;
    } else {
        room.bank.houses += 1;
        st.houses -= 1;
    }
    const r = transfer(room, 'bank', player.userId, refund, 'sell-house');
    appendLog(room, { kind: 'sell-house', userId: player.userId, pos, houses: st.houses, amount: refund });
    return { ok: true, events: r.events.concat({ type: 'sell-house', userId: player.userId, pos, houses: st.houses }) };
}

module.exports = { mortgage, unmortgage, buildHouse, sellHouse };
