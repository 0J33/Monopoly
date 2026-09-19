// Trade proposals. Either side can amend the offer — every change bumps the
// `version` on the trade and resets acceptance. Both players must accept the
// same version for the trade to execute. Cancellable by either side.
//
// An offer bundle is:
//   { cash: number, properties: [pos], jailCards: { chance: n, chest: n } }
// The `from` side GIVES `offer` and RECEIVES `request` (i.e. what they want
// from the `to` side).

const { v4: uuidv4 } = require('uuid');
const { tileDef, tileSt, transfer } = require('./engine');
const { appendLog } = require('./state');

function emptyBundle() {
    return { cash: 0, properties: [], jailCards: { chance: 0, chest: 0 } };
}

function proposeTrade(room, from, toUserId, offer = emptyBundle(), request = emptyBundle()) {
    if (!room.started || room.ended) return { ok: false, error: 'not-in-game' };
    const to = room.players.find(p => p.userId === toUserId);
    if (!to || to.bankrupt) return { ok: false, error: 'bad-recipient' };
    if (to.userId === from.userId) return { ok: false, error: 'cannot-trade-with-yourself' };
    if (from.bankrupt) return { ok: false, error: 'bankrupt' };
    const o = normalize(offer), q = normalize(request);
    const bad = validateBundles(room, from, to, o, q);
    if (bad) return { ok: false, error: bad };
    // One open proposal per pair is plenty; a second would just be confusing.
    if (room.trades.some(t => t.status === 'open' && t.fromUserId === from.userId && t.toUserId === to.userId)) {
        return { ok: false, error: 'trade-already-open' };
    }

    const tr = {
        id: `tr_${uuidv4().slice(0, 8)}`,
        fromUserId: from.userId,
        toUserId,
        offer: o,
        request: q,
        version: 1,
        acceptedBy: [from.userId],           // userIds that have accepted current version (proposing = accepting)
        status: 'open',                      // open | accepted | rejected | cancelled
        createdAt: Date.now(),
        messages: [],                        // chat thread scoped to this trade
    };
    room.trades.push(tr);
    prune(room);
    appendLog(room, { kind: 'trade-open', tradeId: tr.id, fromUserId: from.userId, toUserId });
    return { ok: true, events: [{ type: 'trade-open', trade: tr }], trade: tr };
}

function count(v) {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalize(b) {
    const props = Array.isArray(b?.properties) ? b.properties : [];
    return {
        cash: count(b?.cash),
        properties: Array.from(new Set(props.map(Number).filter(Number.isInteger))),
        jailCards: {
            chance: count(b?.jailCards?.chance),
            chest:  count(b?.jailCards?.chest),
        },
    };
}

// Is this a trade that could actually happen right now? Checked when it's
// proposed / edited (so bad offers bounce immediately) and again at execution
// (things may have changed since).
function validateBundles(room, from, to, offer, request) {
    if (offer.cash > from.cash) return 'from-insufficient';
    if (request.cash > to.cash) return 'to-insufficient';
    for (const [who, list] of [[from, offer.properties], [to, request.properties]]) {
        for (const pos of list) {
            const def = room.board.tiles[pos];
            const st  = room.tileState[pos];
            if (!def || !st || !['property', 'station', 'utility'].includes(def.type)) return 'bad-property';
            if (st.owner !== who.userId) return who === from ? 'from-not-owner' : 'to-not-owner';
            // Buildings must be sold before any street in that colour group
            // changes hands.
            if (def.type === 'property' && groupHasBuildings(room, def.group)) return 'sell-buildings-first';
        }
    }
    const fromLg = room.jailFreeLedger[from.userId] || { chance: 0, chest: 0 };
    const toLg   = room.jailFreeLedger[to.userId]   || { chance: 0, chest: 0 };
    if (fromLg.chance < offer.jailCards.chance || fromLg.chest < offer.jailCards.chest) return 'from-no-card';
    if (toLg.chance < request.jailCards.chance || toLg.chest < request.jailCards.chest) return 'to-no-card';
    const empty = (b) => !b.cash && !b.properties.length && !b.jailCards.chance && !b.jailCards.chest;
    if (empty(offer) && empty(request)) return 'empty-trade';
    return null;
}

function groupHasBuildings(room, group) {
    return room.board.tiles.some((t, i) => t.type === 'property' && t.group === group && room.tileState[i].houses > 0);
}

// Either party edits the offer. Resets acceptance — both sides must re-accept.
function updateTrade(room, actor, tradeId, offer, request) {
    const tr = room.trades.find(t => t.id === tradeId);
    if (!tr) return { ok: false, error: 'no-trade' };
    if (tr.status !== 'open') return { ok: false, error: 'closed' };
    if (actor.userId !== tr.fromUserId && actor.userId !== tr.toUserId) return { ok: false, error: 'not-party' };
    const from = room.players.find(p => p.userId === tr.fromUserId);
    const to   = room.players.find(p => p.userId === tr.toUserId);
    const o = normalize(offer), q = normalize(request);
    const bad = validateBundles(room, from, to, o, q);
    if (bad) return { ok: false, error: bad };
    tr.offer = o;
    tr.request = q;
    tr.version += 1;
    // Whoever made the change is happy with it; the other side has to agree.
    tr.acceptedBy = [actor.userId];
    appendLog(room, { kind: 'trade-update', tradeId, by: actor.userId, fromUserId: tr.fromUserId, toUserId: tr.toUserId, version: tr.version });
    return { ok: true, events: [{ type: 'trade-update', trade: tr }] };
}

function acceptTrade(room, actor, tradeId) {
    const tr = room.trades.find(t => t.id === tradeId);
    if (!tr) return { ok: false, error: 'no-trade' };
    if (tr.status !== 'open') return { ok: false, error: 'closed' };
    if (actor.userId !== tr.fromUserId && actor.userId !== tr.toUserId) return { ok: false, error: 'not-party' };
    if (tr.acceptedBy.includes(actor.userId)) return { ok: false, error: 'already-accepted' };
    tr.acceptedBy.push(actor.userId);
    const events = [{ type: 'trade-accept', tradeId, by: actor.userId }];
    if (tr.acceptedBy.includes(tr.fromUserId) && tr.acceptedBy.includes(tr.toUserId)) {
        const exec = executeTrade(room, tr);
        if (!exec.ok) {
            tr.status = 'failed';
            appendLog(room, { kind: 'trade-close', tradeId, by: actor.userId, fromUserId: tr.fromUserId, toUserId: tr.toUserId, status: 'failed', reason: exec.error });
            events.push({ type: 'trade-close', trade: tr, reason: exec.error });
            return { ok: true, events };
        }
        tr.status = 'accepted';
        events.push(...exec.events);
    }
    return { ok: true, events };
}

function rejectOrCancelTrade(room, actor, tradeId) {
    const tr = room.trades.find(t => t.id === tradeId);
    if (!tr) return { ok: false, error: 'no-trade' };
    if (tr.status !== 'open') return { ok: false, error: 'closed' };
    if (actor.userId !== tr.fromUserId && actor.userId !== tr.toUserId) return { ok: false, error: 'not-party' };
    tr.status = actor.userId === tr.fromUserId ? 'cancelled' : 'rejected';
    appendLog(room, { kind: 'trade-close', tradeId, by: actor.userId, fromUserId: tr.fromUserId, toUserId: tr.toUserId, status: tr.status });
    prune(room);
    return { ok: true, events: [{ type: 'trade-close', trade: tr }] };
}

function tradeMessage(room, actor, tradeId, text) {
    const tr = room.trades.find(t => t.id === tradeId);
    if (!tr) return { ok: false, error: 'no-trade' };
    if (actor.userId !== tr.fromUserId && actor.userId !== tr.toUserId) return { ok: false, error: 'not-party' };
    const clean = String(text ?? '').trim().slice(0, 300);
    if (!clean) return { ok: false, error: 'empty-message' };
    const msg = { id: uuidv4(), userId: actor.userId, text: clean, ts: Date.now() };
    tr.messages.push(msg);
    if (tr.messages.length > 100) tr.messages.shift();
    return { ok: true, events: [{ type: 'trade-msg', tradeId, msg }] };
}

// Validate that both sides have the assets they've promised, then execute the
// swap atomically.
function executeTrade(room, tr) {
    const from = room.players.find(p => p.userId === tr.fromUserId);
    const to   = room.players.find(p => p.userId === tr.toUserId);
    if (!from || !to || from.bankrupt || to.bankrupt) return { ok: false, error: 'bad-party' };
    const bad = validateBundles(room, from, to, tr.offer, tr.request);
    if (bad) return { ok: false, error: bad };
    const offerProps   = tr.offer.properties;
    const requestProps = tr.request.properties;
    const fromLg = (room.jailFreeLedger[from.userId] ||= { chance: 0, chest: 0 });
    const toLg   = (room.jailFreeLedger[to.userId]   ||= { chance: 0, chest: 0 });

    const events = [];

    // Cash swap.
    if (tr.offer.cash > 0)   events.push(...transfer(room, from.userId, to.userId, tr.offer.cash, 'trade').events);
    if (tr.request.cash > 0) events.push(...transfer(room, to.userId, from.userId, tr.request.cash, 'trade').events);

    // Property swap.
    for (const pos of offerProps) {
        room.tileState[pos].owner = to.userId;
        from.owned = from.owned.filter(p => p !== pos);
        to.owned.push(pos);
    }
    for (const pos of requestProps) {
        room.tileState[pos].owner = from.userId;
        to.owned = to.owned.filter(p => p !== pos);
        from.owned.push(pos);
    }

    // Jail card swap. (Mortgaged properties change hands still mortgaged.)
    fromLg.chance -= tr.offer.jailCards.chance;
    fromLg.chest  -= tr.offer.jailCards.chest;
    toLg.chance   -= tr.request.jailCards.chance;
    toLg.chest    -= tr.request.jailCards.chest;
    fromLg.chance += tr.request.jailCards.chance;
    fromLg.chest  += tr.request.jailCards.chest;
    toLg.chance   += tr.offer.jailCards.chance;
    toLg.chest    += tr.offer.jailCards.chest;
    from.getOutOfJailCards = fromLg.chance + fromLg.chest;
    to.getOutOfJailCards   = toLg.chance   + toLg.chest;

    appendLog(room, { kind: 'trade-executed', tradeId: tr.id, fromUserId: from.userId, toUserId: to.userId, offer: tr.offer, request: tr.request });
    events.push({ type: 'trade-executed', trade: tr });
    return { ok: true, events };
}

// Cull old closed trades so the wire payload doesn't grow forever.
function prune(room) {
    if (room.trades.length <= 20) return;
    room.trades = room.trades.filter(t => t.status === 'open').concat(
        room.trades.filter(t => t.status !== 'open').slice(-10)
    );
}

module.exports = {
    emptyBundle,
    proposeTrade,
    updateTrade,
    acceptTrade,
    rejectOrCancelTrade,
    tradeMessage,
    prune,
};
