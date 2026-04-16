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
    const to = room.players.find(p => p.userId === toUserId);
    if (!to || to.bankrupt) return { ok: false, error: 'bad-recipient' };
    if (from.bankrupt) return { ok: false, error: 'bankrupt' };

    const tr = {
        id: `tr_${uuidv4().slice(0, 8)}`,
        fromUserId: from.userId,
        toUserId,
        offer: normalize(offer),
        request: normalize(request),
        version: 1,
        acceptedBy: [],                      // userIds that have accepted current version
        status: 'open',                      // open | accepted | rejected | cancelled
        createdAt: Date.now(),
        messages: [],                        // chat thread scoped to this trade
    };
    room.trades.push(tr);
    appendLog(room, { kind: 'trade-open', tradeId: tr.id, fromUserId: from.userId, toUserId });
    return { ok: true, events: [{ type: 'trade-open', trade: tr }], trade: tr };
}

function normalize(b) {
    return {
        cash: Math.max(0, Math.floor(b?.cash || 0)),
        properties: Array.from(new Set((b?.properties || []).map(Number))),
        jailCards: {
            chance: Math.max(0, b?.jailCards?.chance || 0),
            chest:  Math.max(0, b?.jailCards?.chest  || 0),
        },
    };
}

// Either party edits the offer. Resets acceptance — both sides must re-accept.
function updateTrade(room, actor, tradeId, offer, request) {
    const tr = room.trades.find(t => t.id === tradeId);
    if (!tr) return { ok: false, error: 'no-trade' };
    if (tr.status !== 'open') return { ok: false, error: 'closed' };
    if (actor.userId !== tr.fromUserId && actor.userId !== tr.toUserId) return { ok: false, error: 'not-party' };
    tr.offer = normalize(offer);
    tr.request = normalize(request);
    tr.version += 1;
    tr.acceptedBy = [];
    appendLog(room, { kind: 'trade-update', tradeId, by: actor.userId, version: tr.version });
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
            tr.status = 'rejected';
            events.push({ type: 'trade-rejected', tradeId, reason: exec.error });
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
    appendLog(room, { kind: 'trade-close', tradeId, by: actor.userId, status: tr.status });
    return { ok: true, events: [{ type: 'trade-close', trade: tr }] };
}

function tradeMessage(room, actor, tradeId, text) {
    const tr = room.trades.find(t => t.id === tradeId);
    if (!tr) return { ok: false, error: 'no-trade' };
    if (actor.userId !== tr.fromUserId && actor.userId !== tr.toUserId) return { ok: false, error: 'not-party' };
    const msg = { id: uuidv4(), userId: actor.userId, text: String(text).slice(0, 300), ts: Date.now() };
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

    // Cash
    if (from.cash < tr.offer.cash)   return { ok: false, error: 'from-insufficient' };
    if (to.cash   < tr.request.cash) return { ok: false, error: 'to-insufficient' };

    // Properties — owner check + mortgaged properties are tradeable, but the
    // receiver pays the 10% interest on unmortgage if they choose later, OR
    // pays it immediately. Classic rule: receiver pays 10% fee at transfer,
    // mortgaged flag stays on.
    const offerProps  = tr.offer.properties;
    const requestProps = tr.request.properties;
    for (const pos of offerProps)   if (room.tileState[pos].owner !== from.userId) return { ok: false, error: 'from-not-owner' };
    for (const pos of requestProps) if (room.tileState[pos].owner !== to.userId)   return { ok: false, error: 'to-not-owner' };

    // Jail cards
    const fromLg = room.jailFreeLedger[from.userId] || { chance: 0, chest: 0 };
    const toLg   = room.jailFreeLedger[to.userId]   || { chance: 0, chest: 0 };
    if (fromLg.chance < tr.offer.jailCards.chance ||
        fromLg.chest  < tr.offer.jailCards.chest)   return { ok: false, error: 'from-no-card' };
    if (toLg.chance < tr.request.jailCards.chance ||
        toLg.chest  < tr.request.jailCards.chest)   return { ok: false, error: 'to-no-card' };

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

    // Jail card swap.
    room.jailFreeLedger[from.userId] = fromLg;
    room.jailFreeLedger[to.userId]   = toLg;
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

    appendLog(room, { kind: 'trade-executed', tradeId: tr.id, fromUserId: from.userId, toUserId: to.userId });
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
