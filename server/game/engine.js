// Core game engine. All state mutations go through here; the socket layer's
// job is just to authenticate + route. Every handler returns { ok, error?, events? }
// where `events` is a list of {type, ...payload} animation hints the client
// plays back in sequence (roll → move → land → buy, etc.) — that's how we
// keep the UI snappy without needing multi-RTT round trips per step.

const { getCard, newChanceDeck, newChestDeck, shuffled, CHANCE, CHEST } = require('./cards');
const { appendLog } = require('./state');

// ─── Dice ────────────────────────────────────────────────────────────────────
function rollDie() { return 1 + Math.floor(Math.random() * 6); }
function rollDice() { return [rollDie(), rollDie()]; }

// ─── Ownership helpers ───────────────────────────────────────────────────────
function tileDef(room, pos) { return room.board.tiles[pos]; }
function tileSt(room, pos)  { return room.tileState[pos]; }

function ownerOf(room, pos) {
    const st = tileSt(room, pos);
    if (!st || !st.owner) return null;
    return room.players.find(p => p.userId === st.owner) || null;
}

// Count how many tiles in `group` are owned by `player` — used for rent mult.
function ownedInGroup(room, player, group) {
    let n = 0;
    for (const pos of player.owned) {
        const d = tileDef(room, pos);
        if (d.type === 'property' && d.group === group) n++;
    }
    return n;
}
function ownsFullGroup(room, player, group) {
    return ownedInGroup(room, player, group) === room.board.groupSizes[group];
}
function ownedStations(room, player) {
    return player.owned.reduce((n, pos) => n + (tileDef(room, pos).type === 'station' ? 1 : 0), 0);
}
function ownedUtilities(room, player) {
    return player.owned.reduce((n, pos) => n + (tileDef(room, pos).type === 'utility' ? 1 : 0), 0);
}

// ─── Rent ────────────────────────────────────────────────────────────────────
// Computes rent owed for `player` landing on `pos`. Returns 0 if unowned,
// mortgaged, or owned by `player`.
function rentOwed(room, pos, roll, rentMultOverride = null) {
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!st.owner || st.mortgaged) return 0;
    const owner = room.players.find(p => p.userId === st.owner);
    if (!owner || owner.bankrupt) return 0;
    if (room.rules.noRentInJail && owner.inJail) return 0;

    if (def.type === 'property') {
        let rent = def.rent[0];
        if (st.houses > 0) rent = def.rent[Math.min(st.houses, 5)];
        // Full color group with no houses → base rent is doubled.
        else if (ownsFullGroup(room, owner, def.group)) rent = def.rent[0] * 2;
        if (rentMultOverride) rent = def.rent[0] * rentMultOverride; // chance "2× rent"
        return rent;
    }
    if (def.type === 'station') {
        const n = ownedStations(room, owner);
        const base = 25 * Math.pow(2, n - 1); // 25/50/100/200
        return rentMultOverride ? base * rentMultOverride : base;
    }
    if (def.type === 'utility') {
        const n = ownedUtilities(room, owner);
        const sum = Array.isArray(roll) ? (roll[0] + roll[1]) : (roll || 0);
        const mult = rentMultOverride ?? (n === 2 ? 10 : 4);
        return sum * mult;
    }
    return 0;
}

// ─── Money transfer ──────────────────────────────────────────────────────────
// Central point for every $ change. Tracks stats and returns an event so the
// client can animate the transfer. `from`/`to` can be 'bank', 'pot' (free
// parking), or a player userId.
function transfer(room, from, to, amount, reason = '') {
    if (amount <= 0) return { ok: true, events: [] };
    const events = [];

    if (from !== 'bank' && from !== 'pot') {
        const p = room.players.find(x => x.userId === from);
        if (!p) return { ok: false, error: 'bad-from' };
        if (p.cash < amount) return { ok: false, error: 'insufficient', needed: amount, have: p.cash };
        p.cash -= amount;
        p.stats.moneySpent += amount;
    } else if (from === 'pot') {
        room.parkingPot = Math.max(0, room.parkingPot - amount);
    }

    if (to !== 'bank' && to !== 'pot') {
        const p = room.players.find(x => x.userId === to);
        if (!p) return { ok: false, error: 'bad-to' };
        p.cash += amount;
        p.stats.moneyEarned += amount;
    } else if (to === 'pot') {
        room.parkingPot += amount;
    }

    events.push({ type: 'money', from, to, amount, reason });
    return { ok: true, events };
}

// ─── Movement ────────────────────────────────────────────────────────────────
function advanceTo(room, player, targetPos, { passGo = true, animate = true } = {}) {
    const events = [];
    const prev = player.position;
    const stops = [];
    let pos = prev;
    // Walk tile-by-tile so client can animate each step with easing.
    while (pos !== targetPos) {
        pos = (pos + 1) % 40;
        stops.push(pos);
        if (pos === 0 && passGo) {
            const salary = room.rules.doubleOnGo && targetPos === 0
                ? room.rules.salary * 2
                : room.rules.salary;
            const r = transfer(room, 'bank', player.userId, salary, 'pass-go');
            events.push(...r.events);
            appendLog(room, { kind: 'pass-go', userId: player.userId, amount: salary });
        }
    }
    player.position = targetPos;
    events.push({ type: 'move', userId: player.userId, from: prev, to: targetPos, path: stops, animate });
    return events;
}

function moveBy(room, player, delta, opts) {
    const target = ((player.position + delta) % 40 + 40) % 40;
    // Going backwards doesn't pass GO. Classic rule.
    return advanceTo(room, player, target, { ...opts, passGo: delta > 0 && opts?.passGo !== false });
}

// ─── Jail ────────────────────────────────────────────────────────────────────
function sendToJail(room, player) {
    const prev = player.position;
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesThisTurn = 0;
    appendLog(room, { kind: 'go-to-jail', userId: player.userId });
    // Emit a direct jump so the client's token animation walks/snaps the
    // piece to the jail cell. Without this the token can stay on the "Go
    // To Jail" tile visually while server state has already moved it.
    return [
        { type: 'move', userId: player.userId, from: prev, to: 10, path: [10], animate: false },
        { type: 'jail', userId: player.userId },
    ];
}

// ─── Tile landing resolution ─────────────────────────────────────────────────
// Called after movement settles on a tile. Returns events + sets turnPhase
// to indicate what the active player needs to do next (buy decision, pay
// rent already resolved, draw card, etc.).
function resolveLanding(room, player, diceRoll, { chainedFromCard = false } = {}) {
    const events = [];
    const def = tileDef(room, player.position);
    const st  = tileSt(room, player.position);

    // Log the landing itself — card text / buy / rent / tax follow as sub-entries.
    if (!chainedFromCard) appendLog(room, { kind: 'land', userId: player.userId, pos: player.position, tileType: def.type, tileName: def.name });

    switch (def.type) {
        case 'go':
            // Landing on GO directly — salary was already paid on pass. Nothing
            // extra unless doubleOnGo is enabled, which pass-go already handled.
            break;

        case 'property':
        case 'station':
        case 'utility': {
            if (!st.owner) {
                // Available for purchase. turnPhase flips to 'buying' so the
                // client shows Buy / Auction buttons for this player only.
                room.turnPhase = 'buying';
                events.push({ type: 'offer-buy', userId: player.userId, pos: player.position, price: def.price });
                return events;
            }
            if (st.owner === player.userId) break;           // own land
            if (st.mortgaged) break;                         // mortgaged → no rent

            const owner = room.players.find(p => p.userId === st.owner);
            if (room.rules.noRentInJail && owner.inJail) break;

            const rent = rentOwed(room, player.position, diceRoll);
            if (rent > 0) {
                const r = transfer(room, player.userId, st.owner, rent, 'rent');
                events.push(...r.events);
                if (r.ok) {
                    player.stats.rentPaid += rent;
                    owner.stats.rentCollected += rent;
                    appendLog(room, { kind: 'rent', fromUserId: player.userId, toUserId: owner.userId, amount: rent, pos: player.position });
                } else {
                    // Insufficient funds — engine.raiseOrBankrupt will surface
                    // a "you owe $N" banner on the client and block turn end
                    // until resolved.
                    room.turnPhase = 'resolving';
                    events.push({ type: 'debt', userId: player.userId, creditor: owner.userId, amount: rent });
                    return events;
                }
            }
            break;
        }

        case 'tax': {
            const r = transfer(room, player.userId,
                room.rules.freeParkingPot ? 'pot' : 'bank',
                def.amount, 'tax');
            events.push(...r.events);
            if (!r.ok) {
                room.turnPhase = 'resolving';
                events.push({ type: 'debt', userId: player.userId, creditor: 'bank', amount: def.amount });
                return events;
            }
            appendLog(room, { kind: 'tax', userId: player.userId, amount: def.amount });
            break;
        }

        case 'chance':
        case 'chest': {
            if (chainedFromCard) break;                       // never chain card → card
            const drawn = drawCard(room, def.type, player);
            events.push({ type: 'draw-card', userId: player.userId, deck: def.type, cardId: drawn.id, text: drawn.text });
            const eff = applyCardEffect(room, player, drawn);
            events.push(...eff.events);
            // Some card effects (moveTo) re-trigger landing resolution.
            if (eff.reland) {
                const chained = resolveLanding(room, player, diceRoll, { chainedFromCard: true });
                events.push(...chained);
            }
            break;
        }

        case 'jail':
            // "Just visiting" — no effect.
            break;

        case 'gotojail':
            events.push(...sendToJail(room, player));
            break;

        case 'parking':
            if (room.rules.freeParkingPot && room.parkingPot > 0) {
                const amt = room.parkingPot;
                room.parkingPot = 0;
                const r = transfer(room, 'bank', player.userId, amt, 'free-parking');
                events.push(...r.events);
                appendLog(room, { kind: 'parking-payout', userId: player.userId, amount: amt });
            }
            break;
    }
    return events;
}

// ─── Card drawing ────────────────────────────────────────────────────────────
function drawCard(room, deckName, player) {
    const deck = deckName === 'chance' ? room.chanceDeck : room.chestDeck;
    if (deck.draw.length === 0) {
        const all = deckName === 'chance' ? CHANCE : CHEST;
        // Keep "held" jail-free cards out of the reshuffle.
        const held = new Set();
        for (const uid of Object.keys(room.jailFreeLedger)) {
            const lg = room.jailFreeLedger[uid];
            if (lg[deckName] > 0) {
                // find a card id for this deck that's the jail-free one
                const jailFree = all.find(c => c.effect.kind === 'jailFree');
                if (jailFree) for (let i = 0; i < lg[deckName]; i++) held.add(jailFree.id);
            }
        }
        const refill = deck.discard.filter(id => !held.has(id));
        deck.draw = shuffled(refill);
        deck.discard = [];
    }
    const cardId = deck.draw.shift();
    return getCard(cardId);
}

// Put the card back on the discard pile unless it was retained (jail-free).
function discardCard(room, card, retained = false) {
    if (retained) return;
    const deck = card.deck === 'chance' ? room.chanceDeck : room.chestDeck;
    deck.discard.push(card.id);
}

// ─── Card effects ────────────────────────────────────────────────────────────
function applyCardEffect(room, player, card) {
    const events = [];
    const eff = card.effect;
    let retained = false;
    let reland = false;

    switch (eff.kind) {
        case 'money': {
            const r = eff.amount >= 0
                ? transfer(room, 'bank', player.userId, eff.amount, 'card')
                : transfer(room, player.userId,
                    room.rules.freeParkingPot ? 'pot' : 'bank',
                    -eff.amount, 'card');
            events.push(...r.events);
            break;
        }
        case 'moneyAll': {
            for (const other of room.players) {
                if (other.userId === player.userId || other.bankrupt) continue;
                const r = eff.amount >= 0
                    ? transfer(room, other.userId, player.userId, eff.amount, 'card-from-each')
                    : transfer(room, player.userId, other.userId, -eff.amount, 'card-to-each');
                events.push(...r.events);
            }
            break;
        }
        case 'moveTo':
            events.push(...advanceTo(room, player, eff.pos, { passGo: !!eff.passGo }));
            reland = true;
            break;
        case 'moveBy':
            events.push(...moveBy(room, player, eff.delta, { passGo: false }));
            reland = true;
            break;
        case 'moveToNearest': {
            const from = player.position;
            const wanted = eff.target; // 'station' | 'utility'
            let target = null;
            for (let i = 1; i <= 40; i++) {
                const p = (from + i) % 40;
                if (tileDef(room, p).type === wanted) { target = p; break; }
            }
            if (target != null) {
                events.push(...advanceTo(room, player, target, { passGo: true }));
                const st = tileSt(room, target);
                if (st.owner && st.owner !== player.userId && !st.mortgaged) {
                    // Custom-mult rent (2× street, dice×10 for utility).
                    const rent = rentOwed(room, target, room.lastDice, eff.rentMult);
                    if (rent > 0) {
                        const r = transfer(room, player.userId, st.owner, rent, 'card-rent');
                        events.push(...r.events);
                    }
                } else {
                    reland = true; // unowned → normal buy-offer flow
                }
            }
            break;
        }
        case 'goToJail':
            events.push(...sendToJail(room, player));
            break;
        case 'jailFree':
            room.jailFreeLedger[player.userId] ||= { chance: 0, chest: 0 };
            room.jailFreeLedger[player.userId][card.deck] += 1;
            player.getOutOfJailCards += 1;
            retained = true;
            break;
        case 'repairs': {
            let houses = 0, hotels = 0;
            for (const pos of player.owned) {
                const st = tileSt(room, pos);
                if (tileDef(room, pos).type !== 'property') continue;
                if (st.houses >= 5) hotels++;
                else houses += st.houses;
            }
            const amt = houses * eff.perHouse + hotels * eff.perHotel;
            if (amt > 0) {
                const r = transfer(room, player.userId,
                    room.rules.freeParkingPot ? 'pot' : 'bank', amt, 'repairs');
                events.push(...r.events);
            }
            break;
        }
    }
    discardCard(room, card, retained);
    appendLog(room, { kind: 'card', userId: player.userId, deck: card.deck, cardId: card.id, text: card.text });
    return { events, reland };
}

// ─── Turn actions (public API called by socket handlers) ─────────────────────
function rollAndMove(room, player) {
    if (room.turnPhase !== 'rolling' && room.turnPhase !== 'awaiting-roll') {
        return { ok: false, error: 'not-your-turn-to-roll' };
    }
    const dice = rollDice();
    const isDouble = dice[0] === dice[1];
    room.lastDice = dice;
    room.lastDiceRoller = player.userId;
    appendLog(room, { kind: 'roll', userId: player.userId, dice, isDouble });
    const events = [{ type: 'roll', userId: player.userId, dice }];

    if (player.inJail) {
        return { ok: true, events: events.concat(resolveJailRoll(room, player, dice, isDouble)) };
    }

    if (isDouble) {
        player.doublesThisTurn += 1;
        if (player.doublesThisTurn >= room.rules.xDoubles) {
            events.push(...sendToJail(room, player));
            room.turnPhase = 'awaiting-end-turn';
            return { ok: true, events };
        }
    }

    room.turnPhase = 'moving';
    const steps = dice[0] + dice[1];
    const target = (player.position + steps) % 40;
    events.push(...advanceTo(room, player, target, { passGo: true }));
    events.push(...resolveLanding(room, player, dice));

    // If resolveLanding set a decision phase (buy/debt), stay there.
    if (room.turnPhase === 'moving') {
        room.turnPhase = isDouble ? 'awaiting-roll' : 'awaiting-end-turn';
    }
    player.hasRolled = true;
    return { ok: true, events };
}

function resolveJailRoll(room, player, dice, isDouble) {
    const events = [];
    if (isDouble) {
        player.inJail = false;
        player.jailTurns = 0;
        const target = (player.position + dice[0] + dice[1]) % 40;
        events.push({ type: 'jail-escape', userId: player.userId, method: 'doubles' });
        events.push(...advanceTo(room, player, target, { passGo: true }));
        events.push(...resolveLanding(room, player, dice));
        room.turnPhase = 'awaiting-end-turn';  // doubles in jail don't grant another roll
        return events;
    }
    player.jailTurns += 1;
    if (player.jailTurns >= room.rules.jailTurnsMax) {
        // Mandatory fine + move.
        const r = transfer(room, player.userId, 'bank', room.rules.jailFine, 'jail-fine-forced');
        events.push(...r.events);
        player.inJail = false;
        player.jailTurns = 0;
        const target = (player.position + dice[0] + dice[1]) % 40;
        events.push({ type: 'jail-escape', userId: player.userId, method: 'forced-fine' });
        events.push(...advanceTo(room, player, target, { passGo: true }));
        events.push(...resolveLanding(room, player, dice));
    }
    room.turnPhase = 'awaiting-end-turn';
    return events;
}

function payJailFine(room, player) {
    if (!player.inJail) return { ok: false, error: 'not-in-jail' };
    const r = transfer(room, player.userId, 'bank', room.rules.jailFine, 'jail-fine');
    if (!r.ok) return r;
    player.inJail = false;
    player.jailTurns = 0;
    appendLog(room, { kind: 'jail-pay', userId: player.userId });
    return { ok: true, events: r.events.concat({ type: 'jail-escape', userId: player.userId, method: 'fine' }) };
}

function useJailCard(room, player) {
    if (!player.inJail) return { ok: false, error: 'not-in-jail' };
    const lg = room.jailFreeLedger[player.userId];
    if (!lg || (lg.chance + lg.chest) === 0) return { ok: false, error: 'no-card' };
    const deckName = lg.chance > 0 ? 'chance' : 'chest';
    lg[deckName] -= 1;
    player.getOutOfJailCards = Math.max(0, player.getOutOfJailCards - 1);
    // Return the card to the bottom of its deck's discard (card is "used").
    const all = deckName === 'chance' ? CHANCE : CHEST;
    const jf = all.find(c => c.effect.kind === 'jailFree');
    (deckName === 'chance' ? room.chanceDeck : room.chestDeck).discard.push(jf.id);
    player.inJail = false;
    player.jailTurns = 0;
    appendLog(room, { kind: 'jail-card', userId: player.userId, deck: deckName });
    return { ok: true, events: [{ type: 'jail-escape', userId: player.userId, method: 'card' }] };
}

function buyCurrent(room, player) {
    if (room.turnPhase !== 'buying') return { ok: false, error: 'not-buyable' };
    const def = tileDef(room, player.position);
    const st  = tileSt(room, player.position);
    if (st.owner) return { ok: false, error: 'already-owned' };
    if (player.cash < def.price) return { ok: false, error: 'insufficient' };
    player.cash -= def.price;
    player.stats.moneySpent += def.price;
    player.stats.propertiesBought += 1;
    player.owned.push(def.pos);
    st.owner = player.userId;
    appendLog(room, { kind: 'buy', userId: player.userId, pos: def.pos, price: def.price });
    room.turnPhase = playerHasExtraRoll(room, player) ? 'awaiting-roll' : 'awaiting-end-turn';
    return { ok: true, events: [{ type: 'buy', userId: player.userId, pos: def.pos, price: def.price }] };
}

function declineBuy(room, player) {
    if (room.turnPhase !== 'buying') return { ok: false, error: 'not-buyable' };
    if (room.rules.auctionUnbought) {
        // Hand off to auction.js (imported lazily to avoid cycle).
        const { startAuction } = require('./auction');
        return startAuction(room, player.position);
    }
    room.turnPhase = playerHasExtraRoll(room, player) ? 'awaiting-roll' : 'awaiting-end-turn';
    return { ok: true, events: [{ type: 'decline-buy', userId: player.userId, pos: player.position }] };
}

function playerHasExtraRoll(room, player) {
    // If the last roll was doubles (and they weren't jailed) they get another.
    return room.lastDice && room.lastDice[0] === room.lastDice[1] && !player.inJail;
}

// ─── End-of-turn + bankruptcy ────────────────────────────────────────────────
function endTurn(room, player) {
    if (room.turnPhase === 'auctioning' || room.turnPhase === 'trading' || room.turnPhase === 'buying') {
        return { ok: false, error: `cannot-end-in-${room.turnPhase}` };
    }
    // Owed-money debts must be resolved first.
    if (room.turnPhase === 'resolving') return { ok: false, error: 'resolve-debt-first' };

    player.hasRolled = false;
    player.doublesThisTurn = 0;
    player.stats.turnsPlayed += 1;

    // Advance to next non-bankrupt player.
    let n = room.players.length;
    let idx = room.turnIndex;
    for (let i = 0; i < n; i++) {
        idx = (idx + 1) % n;
        if (!room.players[idx].bankrupt) break;
    }
    room.turnIndex = idx;
    room.turnPhase = 'awaiting-roll';
    room.turnStartedAt = Date.now();
    appendLog(room, { kind: 'turn-start', userId: room.players[idx].userId });

    // Victory: only one non-bankrupt player remaining.
    const alive = room.players.filter(p => !p.bankrupt);
    if (alive.length === 1 && room.players.length > 1) {
        room.ended = true;
        room.winnerUserId = alive[0].userId;
        appendLog(room, { kind: 'victory', userId: alive[0].userId });
    }
    return { ok: true, events: [{ type: 'turn-start', userId: room.players[idx].userId }] };
}

// Liquidate all assets back to the bank, or hand to a creditor if set.
// Properties revert to `owner:null` so they can be re-bought (bank case) or
// transfer ownership (player creditor). Houses are sold back for half-price
// to the bank regardless (standard Monopoly rule, even on a player-creditor
// bankruptcy — creditor never inherits built-up buildings).
function declareBankruptcy(room, player, creditorUserId = null) {
    if (player.bankrupt) return { ok: false, error: 'already-bankrupt' };
    const events = [];
    for (const pos of [...player.owned]) {
        const def = tileDef(room, pos);
        const st  = tileSt(room, pos);
        if (def.type === 'property' && st.houses > 0) {
            // Sell buildings back to bank at half.
            const refund = Math.floor((def.houseCost * st.houses) / 2);
            if (st.houses >= 5) { room.bank.hotels += 1; room.bank.houses += 4; }
            else { room.bank.houses += st.houses; }
            st.houses = 0;
            player.cash += refund;
        }
        st.owner = creditorUserId;
        st.mortgaged = false; // creditor decides; if bank, property re-offered unmortgaged
        if (creditorUserId) {
            const c = room.players.find(p => p.userId === creditorUserId);
            if (c) c.owned.push(pos);
        }
    }
    player.owned = [];
    // Hand over cash to creditor (if any).
    if (creditorUserId) {
        const c = room.players.find(p => p.userId === creditorUserId);
        if (c) c.cash += player.cash;
    }
    player.cash = 0;
    player.bankrupt = true;

    // Any "jail free" cards go back to the bottom of their decks.
    const lg = room.jailFreeLedger[player.userId];
    if (lg) {
        for (const deckName of ['chance', 'chest']) {
            for (let i = 0; i < lg[deckName]; i++) {
                const all = deckName === 'chance' ? CHANCE : CHEST;
                const jf = all.find(c => c.effect.kind === 'jailFree');
                (deckName === 'chance' ? room.chanceDeck : room.chestDeck).discard.push(jf.id);
            }
        }
        delete room.jailFreeLedger[player.userId];
    }
    player.getOutOfJailCards = 0;

    appendLog(room, { kind: 'bankrupt', userId: player.userId, creditor: creditorUserId });
    events.push({ type: 'bankrupt', userId: player.userId, creditor: creditorUserId });
    return { ok: true, events };
}

module.exports = {
    rollDie,
    rollDice,
    rollAndMove,
    payJailFine,
    useJailCard,
    buyCurrent,
    declineBuy,
    endTurn,
    declareBankruptcy,
    advanceTo,
    sendToJail,
    transfer,
    rentOwed,
    ownedInGroup,
    ownsFullGroup,
    ownedStations,
    ownedUtilities,
    tileDef,
    tileSt,
    resolveLanding,
    drawCard,
    applyCardEffect,
};
