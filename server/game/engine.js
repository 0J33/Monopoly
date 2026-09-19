// Core game engine. All state mutations go through here; the socket layer's
// job is just to authenticate + route. Every handler returns { ok, error?, events? }
// where `events` is a list of {type, ...payload} animation hints the client
// plays back in sequence (roll → move → land → buy, etc.) — that's how we
// keep the UI snappy without needing multi-RTT round trips per step.
//
// Turn flow:
//   awaiting-roll → (roll) → moving → buying | auctioning | resolving
//                                   → awaiting-roll (doubles) | awaiting-end-turn
// Anything that must be paid goes through `charge()`. If the payer is short,
// the amount becomes a debt, the phase becomes 'resolving', and play waits
// until the debtor raises the cash and pays, or goes bankrupt.

const { getCard, renderCardText, shuffled, CHANCE, CHEST } = require('./cards');
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
function playerById(room, userId) {
    return room.players.find(p => p.userId === userId) || null;
}
function activePlayer(room) {
    return room.players[room.turnIndex] || null;
}
// Fines, taxes and card payments go to the Free Parking pot when that house
// rule is on, otherwise to the bank.
function bankOrPot(room) {
    return room.rules.freeParkingPot ? 'pot' : 'bank';
}

// ─── Rent ────────────────────────────────────────────────────────────────────
// Computes rent owed for landing on `pos`. Returns 0 if unowned, mortgaged,
// or the owner can't collect (bankrupt, or jailed under noRentInJail).
function rentOwed(room, pos, roll, rentMultOverride = null) {
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (!st.owner || st.mortgaged) return 0;
    const owner = playerById(room, st.owner);
    if (!owner || owner.bankrupt) return 0;
    if (room.rules.noRentInJail && owner.inJail) return 0;

    if (def.type === 'property') {
        let rent = def.rent[0];
        if (st.houses > 0) rent = def.rent[Math.min(st.houses, 5)];
        // Full color group with no houses → base rent is doubled.
        else if (ownsFullGroup(room, owner, def.group)) rent = def.rent[0] * 2;
        if (rentMultOverride) rent *= rentMultOverride;
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
// parking), or a player userId. Always returns an `events` array, even on
// failure, so callers can spread it unconditionally.
function transfer(room, from, to, amount, reason = '') {
    if (!(amount > 0)) return { ok: true, events: [] };

    let payer = null, payee = null;
    if (from !== 'bank' && from !== 'pot') {
        payer = playerById(room, from);
        if (!payer) return { ok: false, error: 'bad-from', events: [] };
        if (payer.cash < amount) return { ok: false, error: 'insufficient', needed: amount, have: payer.cash, events: [] };
    }
    if (to !== 'bank' && to !== 'pot') {
        payee = playerById(room, to);
        if (!payee) return { ok: false, error: 'bad-to', events: [] };
    }

    if (payer) { payer.cash -= amount; payer.stats.moneySpent += amount; }
    else if (from === 'pot') room.parkingPot = Math.max(0, room.parkingPot - amount);

    if (payee) { payee.cash += amount; payee.stats.moneyEarned += amount; }
    else if (to === 'pot') room.parkingPot += amount;

    return { ok: true, events: [{ type: 'money', from, to, amount, reason }] };
}

// ─── Charges and debts ───────────────────────────────────────────────────────
// Make `payer` pay each of `payees` ([{ to, amount }]). If they can cover the
// total it's paid at once and `log` (if any) is written. If not, nothing is
// paid: the whole amount becomes one debt and the phase becomes 'resolving'
// (the log then says "can't pay", and later "settled").
function charge(room, payer, payees, reason, log = null, stat = null) {
    const list = payees.filter(p => p.amount > 0);
    const total = list.reduce((n, p) => n + p.amount, 0);
    if (total <= 0) return { ok: true, events: [] };

    if (payer.cash >= total) {
        const events = [];
        for (const p of list) events.push(...transfer(room, payer.userId, p.to, p.amount, reason).events);
        if (log) appendLog(room, log);
        applyStat(room, payer, list, stat);
        return { ok: true, events };
    }

    const debt = {
        id: `debt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        userId: payer.userId,
        amount: total,
        reason,
        payees: list,
        stat,
    };
    room.debts.push(debt);
    room.turnPhase = 'resolving';
    appendLog(room, { kind: 'debt', userId: payer.userId, amount: total, reason, creditor: creditorOf(debt) });
    return { ok: false, debt, events: [{ type: 'debt', userId: payer.userId, amount: total, reason, creditor: creditorOf(debt) }] };
}

function applyStat(room, payer, payees, stat) {
    if (stat !== 'rent') return;
    for (const p of payees) {
        payer.stats.rentPaid += p.amount;
        const owner = playerById(room, p.to);
        if (owner) owner.stats.rentCollected += p.amount;
    }
}

// Who inherits a bankrupt debtor's assets: the one player they owe, else the bank.
function creditorOf(debt) {
    if (!debt || debt.payees.length !== 1) return 'bank';
    const to = debt.payees[0].to;
    return to === 'pot' ? 'bank' : to;
}

// The debtor pays their oldest debt in full.
function payDebt(room, player) {
    const debt = room.debts.find(d => d.userId === player.userId);
    if (!debt) return { ok: false, error: 'no-debt' };
    if (player.cash < debt.amount) return { ok: false, error: 'insufficient', needed: debt.amount, have: player.cash };
    const events = [];
    for (const p of debt.payees) events.push(...transfer(room, player.userId, p.to, p.amount, debt.reason).events);
    applyStat(room, player, debt.payees, debt.stat);
    room.debts = room.debts.filter(d => d !== debt);
    appendLog(room, { kind: 'debt-paid', userId: player.userId, amount: debt.amount, reason: debt.reason, creditor: creditorOf(debt) });
    events.push({ type: 'debt-paid', userId: player.userId, amount: debt.amount });
    events.push(...continueAfterDebts(room));
    return { ok: true, events };
}

// Once the last debt clears, pick the turn back up where it stopped.
function continueAfterDebts(room) {
    if (room.ended || room.debts.length) return [];
    if (room.turnPhase !== 'resolving') return [];
    const active = activePlayer(room);
    const resume = room.debtResume;
    room.debtResume = null;
    if (resume?.kind === 'jail-move' && resume.userId === active?.userId && active.inJail) {
        return leaveJailAndMove(room, active, resume.dice, 'forced-fine');
    }
    room.turnPhase = postMovePhase(room, active);
    return [];
}

// ─── Movement ────────────────────────────────────────────────────────────────
// Walk tile-by-tile (forwards, or backwards for "go back 3") so the client can
// animate each step. Passing GO forwards pays salary.
function advanceTo(room, player, targetPos, { passGo = true, animate = true, backwards = false } = {}) {
    const events = [];
    const prev = player.position;
    const stops = [];
    let pos = prev;
    while (pos !== targetPos) {
        pos = backwards ? (pos + 39) % 40 : (pos + 1) % 40;
        stops.push(pos);
        if (!backwards && pos === 0 && passGo) {
            const salary = room.rules.doubleOnGo && targetPos === 0
                ? room.rules.salary * 2
                : room.rules.salary;
            const r = transfer(room, 'bank', player.userId, salary, 'pass-go');
            events.push(...r.events);
            appendLog(room, { kind: 'pass-go', userId: player.userId, amount: salary, landed: targetPos === 0 });
        }
    }
    player.position = targetPos;
    events.push({ type: 'move', userId: player.userId, from: prev, to: targetPos, path: stops, animate });
    return events;
}

function moveBy(room, player, delta, opts) {
    const target = ((player.position + delta) % 40 + 40) % 40;
    // Going backwards doesn't pass GO. Classic rule.
    return advanceTo(room, player, target, { ...opts, backwards: delta < 0, passGo: delta > 0 && opts?.passGo !== false });
}

// What the active player does after their move settles: roll again on
// doubles (unless they ended up in jail), otherwise end the turn.
function postMovePhase(room, player) {
    return room.extraRoll && player && !player.inJail && !player.bankrupt ? 'awaiting-roll' : 'awaiting-end-turn';
}

// ─── Jail ────────────────────────────────────────────────────────────────────
function sendToJail(room, player, why = null) {
    const prev = player.position;
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesThisTurn = 0;
    if (player.userId === activePlayer(room)?.userId) room.extraRoll = false;
    appendLog(room, { kind: 'go-to-jail', userId: player.userId, why });
    // Emit a direct jump so the client's token animation walks/snaps the
    // piece to the jail cell. Without this the token can stay on the "Go
    // To Jail" tile visually while server state has already moved it.
    return [
        { type: 'move', userId: player.userId, from: prev, to: 10, path: [10], animate: false },
        { type: 'jail', userId: player.userId },
    ];
}

function leaveJailAndMove(room, player, dice, method) {
    player.inJail = false;
    player.jailTurns = 0;
    appendLog(room, { kind: 'jail-escape', userId: player.userId, method, amount: method === 'forced-fine' ? room.rules.jailFine : undefined });
    const events = [{ type: 'jail-escape', userId: player.userId, method }];
    room.extraRoll = false;                    // leaving jail never grants another roll
    room.turnPhase = 'moving';
    events.push(...advanceTo(room, player, (player.position + dice[0] + dice[1]) % 40, { passGo: true }));
    events.push(...resolveLanding(room, player, dice));
    if (room.turnPhase === 'moving') room.turnPhase = postMovePhase(room, player);
    return events;
}

// ─── Tile landing resolution ─────────────────────────────────────────────────
// Called after movement settles on a tile. Returns events + sets turnPhase
// to indicate what the active player needs to do next (buy decision, debt,
// etc.). `depth` counts card-driven moves so a card can lead to at most one
// more card (Chance "go back 3" onto Community Chest), never a loop.
function resolveLanding(room, player, diceRoll, { depth = 0 } = {}) {
    const events = [];
    const def = tileDef(room, player.position);
    const st  = tileSt(room, player.position);

    appendLog(room, { kind: 'land', userId: player.userId, pos: player.position, tileType: def.type, tileName: def.name, viaCard: depth > 0 });

    switch (def.type) {
        case 'go':
            // Salary was already paid by the move (doubled if doubleOnGo).
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
            const owner = playerById(room, st.owner);
            if (st.mortgaged) {
                appendLog(room, { kind: 'no-rent', userId: player.userId, toUserId: st.owner, pos: player.position, why: 'mortgaged' });
                break;
            }
            if (room.rules.noRentInJail && owner?.inJail) {
                appendLog(room, { kind: 'no-rent', userId: player.userId, toUserId: st.owner, pos: player.position, why: 'jail' });
                break;
            }
            const rent = rentOwed(room, player.position, diceRoll);
            if (rent > 0) {
                const r = charge(room, player, [{ to: st.owner, amount: rent }], 'rent',
                    { kind: 'rent', fromUserId: player.userId, toUserId: st.owner, amount: rent, pos: player.position }, 'rent');
                events.push(...r.events);
            }
            break;
        }

        case 'tax': {
            const r = charge(room, player, [{ to: bankOrPot(room), amount: def.amount }], 'tax',
                { kind: 'tax', userId: player.userId, amount: def.amount, pos: player.position });
            events.push(...r.events);
            break;
        }

        case 'chance':
        case 'chest': {
            if (depth > 1) break;
            const drawn = drawCard(room, def.type, player);
            const text = renderCardText(drawn, room);
            // Log the card BEFORE its effects so the log reads in order:
            // "drew Chance: Advance to GO" → "passed GO" → "landed on GO".
            appendLog(room, { kind: 'card', userId: player.userId, deck: def.type, deckName: room.board.deckNames?.[def.type], cardId: drawn.id, text });
            events.push({ type: 'draw-card', userId: player.userId, deck: def.type, cardId: drawn.id, text });
            const eff = applyCardEffect(room, player, drawn);
            events.push(...eff.events);
            if (eff.reland) events.push(...resolveLanding(room, player, diceRoll, { depth: depth + 1 }));
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
                const r = transfer(room, 'pot', player.userId, amt, 'free-parking');
                events.push(...r.events);
                appendLog(room, { kind: 'parking-payout', userId: player.userId, amount: amt });
            }
            break;

        default:
            break;
    }
    return events;
}

// ─── Card drawing ────────────────────────────────────────────────────────────
function drawCard(room, deckName, player) {
    const deck = deckName === 'chance' ? room.chanceDeck : room.chestDeck;
    if (deck.draw.length === 0) {
        // Held jail-free cards are never in the discard pile (they only go
        // back when used), so the whole discard pile is safe to reshuffle.
        deck.draw = shuffled(deck.discard);
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

function returnJailCard(room, deckName) {
    const all = deckName === 'chance' ? CHANCE : CHEST;
    const jf = all.find(c => c.effect.kind === 'jailFree');
    (deckName === 'chance' ? room.chanceDeck : room.chestDeck).discard.push(jf.id);
}

// ─── Card effects ────────────────────────────────────────────────────────────
function applyCardEffect(room, player, card) {
    const events = [];
    const eff = card.effect;
    let retained = false;
    let reland = false;

    switch (eff.kind) {
        case 'money': {
            if (eff.amount >= 0) {
                events.push(...transfer(room, 'bank', player.userId, eff.amount, 'card').events);
            } else {
                events.push(...charge(room, player, [{ to: bankOrPot(room), amount: -eff.amount }], 'card').events);
            }
            break;
        }
        case 'moneyAll': {
            const others = room.players.filter(o => o.userId !== player.userId && !o.bankrupt);
            if (eff.amount < 0) {
                // Pay each player — one charge so a short player owes it all at once.
                events.push(...charge(room, player, others.map(o => ({ to: o.userId, amount: -eff.amount })), 'card-to-each').events);
            } else {
                // Collect from each player — anyone short owes it as a debt.
                for (const o of others) {
                    events.push(...charge(room, o, [{ to: player.userId, amount: eff.amount }], 'card-from-each').events);
                }
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
            let target = null;
            for (let i = 1; i <= 40; i++) {
                const p = (from + i) % 40;
                if (tileDef(room, p).type === eff.target) { target = p; break; }
            }
            if (target == null) break;
            events.push(...advanceTo(room, player, target, { passGo: true }));
            const st = tileSt(room, target);
            const owner = st.owner && st.owner !== player.userId ? playerById(room, st.owner) : null;
            if (!owner) { reland = true; break; }            // unowned → buy offer; own → nothing
            appendLog(room, { kind: 'land', userId: player.userId, pos: target, tileType: tileDef(room, target).type, tileName: tileDef(room, target).name, viaCard: true });
            if (st.mortgaged || (room.rules.noRentInJail && owner.inJail)) {
                appendLog(room, { kind: 'no-rent', userId: player.userId, toUserId: owner.userId, pos: target, why: st.mortgaged ? 'mortgaged' : 'jail' });
                break;
            }
            // Utility: the card says to roll fresh and pay 10× that roll.
            let roll = room.lastDice;
            if (eff.target === 'utility') {
                roll = rollDice();
                appendLog(room, { kind: 'utility-roll', userId: player.userId, dice: roll });
                events.push({ type: 'utility-roll', userId: player.userId, dice: roll });
            }
            const rent = rentOwed(room, target, roll, eff.rentMult);
            if (rent > 0) {
                events.push(...charge(room, player, [{ to: owner.userId, amount: rent }], 'card-rent',
                    { kind: 'rent', fromUserId: player.userId, toUserId: owner.userId, amount: rent, pos: target }, 'rent').events);
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
                events.push(...charge(room, player, [{ to: bankOrPot(room), amount: amt }], 'repairs',
                    { kind: 'repairs', userId: player.userId, amount: amt, houses, hotels }).events);
            } else {
                appendLog(room, { kind: 'repairs', userId: player.userId, amount: 0, houses: 0, hotels: 0 });
            }
            break;
        }
        default:
            break;
    }
    discardCard(room, card, retained);
    return { events, reland };
}

// ─── Turn actions (public API called by socket handlers) ─────────────────────
function rollAndMove(room, player) {
    if (room.turnPhase !== 'awaiting-roll') {
        return { ok: false, error: room.turnPhase === 'resolving' ? 'resolve-debt-first' : 'not-your-turn-to-roll' };
    }
    const dice = rollDice();
    const isDouble = dice[0] === dice[1];
    room.lastDice = dice;
    room.lastDiceRoller = player.userId;
    room.extraRoll = false;
    player.hasRolled = true;
    appendLog(room, { kind: 'roll', userId: player.userId, dice, isDouble });
    const events = [{ type: 'roll', userId: player.userId, dice }];

    if (player.inJail) {
        return { ok: true, events: events.concat(resolveJailRoll(room, player, dice, isDouble)) };
    }

    if (isDouble) {
        player.doublesThisTurn += 1;
        if (player.doublesThisTurn >= room.rules.xDoubles) {
            events.push(...sendToJail(room, player, 'doubles'));
            room.turnPhase = 'awaiting-end-turn';
            return { ok: true, events };
        }
        room.extraRoll = true;
    }

    room.turnPhase = 'moving';
    events.push(...advanceTo(room, player, (player.position + dice[0] + dice[1]) % 40, { passGo: true }));
    events.push(...resolveLanding(room, player, dice));

    // If resolveLanding set a decision phase (buy/auction/debt), stay there.
    if (room.turnPhase === 'moving') room.turnPhase = postMovePhase(room, player);
    return { ok: true, events };
}

function resolveJailRoll(room, player, dice, isDouble) {
    if (isDouble) return leaveJailAndMove(room, player, dice, 'doubles');

    player.jailTurns += 1;
    if (player.jailTurns < room.rules.jailTurnsMax) {
        appendLog(room, { kind: 'jail-stay', userId: player.userId, attempt: player.jailTurns, of: room.rules.jailTurnsMax });
        room.turnPhase = 'awaiting-end-turn';
        return [];
    }
    // Out of attempts: the fine is mandatory, then move by this roll. If they
    // can't pay, the move waits until the debt is settled.
    const r = charge(room, player, [{ to: bankOrPot(room), amount: room.rules.jailFine }], 'jail-fine');
    if (!r.ok) {
        room.debtResume = { kind: 'jail-move', userId: player.userId, dice };
        return r.events;
    }
    return r.events.concat(leaveJailAndMove(room, player, dice, 'forced-fine'));
}

// Paying the fine / using a card happens before rolling; the player then
// rolls normally.
function payJailFine(room, player) {
    if (!player.inJail) return { ok: false, error: 'not-in-jail' };
    if (room.turnPhase !== 'awaiting-roll') return { ok: false, error: 'pay-before-rolling' };
    const r = transfer(room, player.userId, bankOrPot(room), room.rules.jailFine, 'jail-fine');
    if (!r.ok) return r;
    player.inJail = false;
    player.jailTurns = 0;
    appendLog(room, { kind: 'jail-pay', userId: player.userId, amount: room.rules.jailFine });
    return { ok: true, events: r.events.concat({ type: 'jail-escape', userId: player.userId, method: 'fine' }) };
}

function useJailCard(room, player) {
    if (!player.inJail) return { ok: false, error: 'not-in-jail' };
    if (room.turnPhase !== 'awaiting-roll') return { ok: false, error: 'use-before-rolling' };
    const lg = room.jailFreeLedger[player.userId];
    if (!lg || (lg.chance + lg.chest) === 0) return { ok: false, error: 'no-card' };
    const deckName = lg.chance > 0 ? 'chance' : 'chest';
    lg[deckName] -= 1;
    player.getOutOfJailCards = lg.chance + lg.chest;
    returnJailCard(room, deckName);
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
    room.turnPhase = postMovePhase(room, player);
    return { ok: true, events: [{ type: 'buy', userId: player.userId, pos: def.pos, price: def.price }] };
}

function declineBuy(room, player) {
    if (room.turnPhase !== 'buying') return { ok: false, error: 'not-buyable' };
    if (room.rules.auctionUnbought) {
        // Hand off to auction.js (imported lazily to avoid cycle).
        const { startAuction } = require('./auction');
        return startAuction(room, player.position);
    }
    appendLog(room, { kind: 'decline-buy', userId: player.userId, pos: player.position });
    room.turnPhase = postMovePhase(room, player);
    return { ok: true, events: [{ type: 'decline-buy', userId: player.userId, pos: player.position }] };
}

function playerHasExtraRoll(room, player) {
    return postMovePhase(room, player) === 'awaiting-roll';
}

// ─── End-of-turn + bankruptcy ────────────────────────────────────────────────
function endTurn(room, player) {
    if (room.turnPhase === 'resolving') return { ok: false, error: 'resolve-debt-first' };
    if (room.turnPhase === 'awaiting-roll') return { ok: false, error: player.hasRolled ? 'roll-again-doubles' : 'roll-first' };
    if (room.turnPhase !== 'awaiting-end-turn') return { ok: false, error: `cannot-end-in-${room.turnPhase}` };
    player.stats.turnsPlayed += 1;
    return { ok: true, events: advanceTurn(room) };
}

// Hand the turn to the next player still in the game.
function advanceTurn(room) {
    const leaving = activePlayer(room);
    if (leaving) { leaving.hasRolled = false; leaving.doublesThisTurn = 0; }
    const n = room.players.length;
    let idx = room.turnIndex;
    for (let i = 0; i < n; i++) {
        idx = (idx + 1) % n;
        if (!room.players[idx].bankrupt) break;
    }
    room.turnIndex = idx;
    const next = room.players[idx];
    next.hasRolled = false;
    next.doublesThisTurn = 0;
    room.extraRoll = false;
    room.debtResume = null;
    room.turnPhase = 'awaiting-roll';
    room.turnStartedAt = Date.now();
    room.turnNumber = (room.turnNumber || 0) + 1;
    appendLog(room, { kind: 'turn-start', userId: next.userId });
    return [{ type: 'turn-start', userId: next.userId }];
}

// Game over when one player is left standing.
function checkVictory(room) {
    if (room.ended || !room.started) return [];
    const alive = room.players.filter(p => !p.bankrupt);
    if (alive.length !== 1) return [];
    room.ended = true;
    room.winnerUserId = alive[0].userId;
    room.turnPhase = 'ended';
    room.auction = null;
    room.debts = [];
    room.debtResume = null;
    for (const t of room.trades) if (t.status === 'open') t.status = 'cancelled';
    appendLog(room, { kind: 'victory', userId: alive[0].userId });
    return [{ type: 'victory', userId: alive[0].userId }];
}

// Liquidate all assets back to the bank, or hand to a creditor if set.
// Buildings are always sold back to the bank at half price (the creditor
// gets the cash, never the buildings). Properties go to a player creditor
// as they are — mortgaged ones stay mortgaged — or back to the bank clean
// and unowned so they can be bought again.
function liquidate(room, player, creditorUserId = null) {
    const creditor = creditorUserId ? playerById(room, creditorUserId) : null;
    for (const pos of [...player.owned]) {
        const def = tileDef(room, pos);
        const st  = tileSt(room, pos);
        if (def.type === 'property' && st.houses > 0) {
            const refund = Math.floor((def.houseCost * st.houses) / 2);
            if (st.houses >= 5) { room.bank.hotels += 1; room.bank.houses += 4; }
            else { room.bank.houses += st.houses; }
            st.houses = 0;
            player.cash += refund;
        }
        if (creditor) {
            st.owner = creditor.userId;
            creditor.owned.push(pos);
        } else {
            st.owner = null;
            st.mortgaged = false;
        }
    }
    player.owned = [];
    if (creditor) creditor.cash += player.cash;
    player.cash = 0;

    // Jail-free cards go to the creditor, or back under their decks.
    const lg = room.jailFreeLedger[player.userId];
    if (lg) {
        if (creditor) {
            const cl = (room.jailFreeLedger[creditor.userId] ||= { chance: 0, chest: 0 });
            cl.chance += lg.chance; cl.chest += lg.chest;
            creditor.getOutOfJailCards = cl.chance + cl.chest;
        } else {
            for (const deckName of ['chance', 'chest']) {
                for (let i = 0; i < lg[deckName]; i++) returnJailCard(room, deckName);
            }
        }
        delete room.jailFreeLedger[player.userId];
    }
    player.getOutOfJailCards = 0;
}

// Out of the game — either because a debt can't be paid, or voluntarily
// (resigning, or being removed after leaving). Assets go to the one player
// they owe, otherwise to the bank. Keeps the game moving: open trades are
// cancelled, they leave any auction, and if it was their turn the next
// player's turn starts.
function declareBankruptcy(room, player, { resigned = false } = {}) {
    if (player.bankrupt) return { ok: false, error: 'already-bankrupt' };
    if (!room.started || room.ended) return { ok: false, error: 'not-in-game' };
    const events = [];
    const debt = room.debts.find(d => d.userId === player.userId);
    const creditorId = debt ? creditorOf(debt) : 'bank';
    const creditor = creditorId !== 'bank' ? playerById(room, creditorId) : null;
    const wasActive = activePlayer(room)?.userId === player.userId;

    liquidate(room, player, creditor && !creditor.bankrupt ? creditor.userId : null);
    player.bankrupt = true;
    player.inJail = false;
    player.bankruptAt = room.turnNumber || 0;

    // Their debts die with them; debts owed TO them are owed to the bank now.
    room.debts = room.debts.filter(d => d.userId !== player.userId);
    for (const d of room.debts) for (const p of d.payees) if (p.to === player.userId) p.to = 'bank';
    if (room.debtResume?.userId === player.userId) room.debtResume = null;

    for (const t of room.trades) {
        if (t.status === 'open' && (t.fromUserId === player.userId || t.toUserId === player.userId)) {
            t.status = 'cancelled';
            events.push({ type: 'trade-close', trade: t });
        }
    }

    appendLog(room, { kind: 'bankrupt', userId: player.userId, creditor: creditor ? creditor.userId : null, resigned });
    events.push({ type: 'bankrupt', userId: player.userId, creditor: creditor ? creditor.userId : null });

    if (room.auction) {
        const { removeFromAuction } = require('./auction');
        events.push(...removeFromAuction(room, player.userId));
    }

    const won = checkVictory(room);
    if (won.length) return { ok: true, events: events.concat(won) };

    if (wasActive) {
        if (room.auction) {
            // Let the auction for their square finish; it hands the turn on.
            room.auction.endTurnAfter = true;
        } else {
            events.push(...advanceTurn(room));
            if (room.debts.length) room.turnPhase = 'resolving';
        }
    } else {
        events.push(...continueAfterDebts(room));
    }
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
    advanceTurn,
    declareBankruptcy,
    payDebt,
    charge,
    checkVictory,
    postMovePhase,
    playerHasExtraRoll,
    advanceTo,
    sendToJail,
    transfer,
    rentOwed,
    ownerOf,
    ownedInGroup,
    ownsFullGroup,
    ownedStations,
    ownedUtilities,
    tileDef,
    tileSt,
    activePlayer,
    resolveLanding,
    drawCard,
    applyCardEffect,
};
