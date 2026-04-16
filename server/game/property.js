// Property-management actions: mortgage, unmortgage, build house / hotel,
// demolish. All route through engine.transfer for consistent money flow.

const { transfer, tileDef, tileSt, ownedInGroup, ownsFullGroup } = require('./engine');
const { appendLog } = require('./state');

// ─── Mortgage ────────────────────────────────────────────────────────────────
function mortgage(room, player, pos) {
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!st || st.owner !== player.userId) return { ok: false, error: 'not-owner' };
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
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!st || st.owner !== player.userId) return { ok: false, error: 'not-owner' };
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
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!st || st.owner !== player.userId) return { ok: false, error: 'not-owner' };
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
    appendLog(room, { kind: 'build', userId: player.userId, pos, houses: st.houses });
    return { ok: true, events: r.events.concat({ type: 'build', userId: player.userId, pos, houses: st.houses }) };
}

function sellHouse(room, player, pos) {
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!st || st.owner !== player.userId) return { ok: false, error: 'not-owner' };
    if (def.type !== 'property') return { ok: false, error: 'not-buildable' };
    if (st.houses <= 0) return { ok: false, error: 'no-houses' };
    if (!canSellEven(room, player, pos)) return { ok: false, error: 'uneven-sell' };

    const refund = Math.floor(def.houseCost / 2);
    if (st.houses === 5) {
        // Demolishing a hotel needs 4 houses available in the bank to replace it.
        if (room.bank.houses < 4) return { ok: false, error: 'no-houses-to-replace-hotel' };
        room.bank.hotels += 1;
        room.bank.houses -= 4;
        st.houses = 4;
    } else {
        room.bank.houses += 1;
        st.houses -= 1;
    }
    const r = transfer(room, 'bank', player.userId, refund, 'sell-house');
    appendLog(room, { kind: 'sell-house', userId: player.userId, pos, houses: st.houses });
    return { ok: true, events: r.events.concat({ type: 'sell-house', userId: player.userId, pos, houses: st.houses }) };
}

module.exports = { mortgage, unmortgage, buildHouse, sellHouse };
