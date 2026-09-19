// Live auction. Triggered when a player lands on an unowned property and
// declines to buy (and rules.auctionUnbought is on), or manually by any
// property owner via `offerAuction`. Everyone non-bankrupt can bid including
// the player who declined. Auction ends when (a) a bid has stood for
// `idleTimeoutMs`, or (b) everyone except the top bidder has passed.

const { transfer, tileDef, tileSt, postMovePhase } = require('./engine');
const { appendLog } = require('./state');

// How long a bid can stand before auction closes. Short enough to feel live,
// long enough for someone to react on mobile.
const IDLE_TIMEOUT_MS = 8000;
const MIN_INCREMENT = 10;

// `pos` is the tile being auctioned. Opens the auction with $10 minimum.
function startAuction(room, pos) {
    const def = tileDef(room, pos);
    const st  = tileSt(room, pos);
    if (st.owner) return { ok: false, error: 'already-owned' };
    if (room.auction) return { ok: false, error: 'auction-busy' };

    const participants = room.players
        .filter(p => !p.bankrupt)
        .map(p => p.userId);

    room.auction = {
        id: `auc_${Date.now()}`,
        pos,
        name: def.name,
        price: def.price,
        participants,
        passed: [],                  // userIds that have passed
        currentBid: 0,
        currentBidder: null,
        minIncrement: MIN_INCREMENT,
        endsAt: Date.now() + IDLE_TIMEOUT_MS,
        history: [],                 // { userId, amount, ts }
    };
    room.turnPhase = 'auctioning';
    appendLog(room, { kind: 'auction-start', pos, name: def.name, userId: room.players[room.turnIndex]?.userId });
    return { ok: true, events: [{ type: 'auction-start', pos, auction: room.auction }] };
}

function placeBid(room, player, amount) {
    const a = room.auction;
    if (!a) return { ok: false, error: 'no-auction' };
    if (!a.participants.includes(player.userId)) return { ok: false, error: 'not-participant' };
    if (a.passed.includes(player.userId)) return { ok: false, error: 'already-passed' };
    if (!Number.isFinite(amount)) return { ok: false, error: 'bad-amount' };
    amount = Math.floor(amount);
    if (a.currentBidder === player.userId) return { ok: false, error: 'already-top-bidder' };
    if (player.cash < amount) return { ok: false, error: 'insufficient' };
    const min = a.currentBid + a.minIncrement;
    if (amount < min) return { ok: false, error: 'below-min', min };

    a.currentBid = amount;
    a.currentBidder = player.userId;
    a.endsAt = Date.now() + IDLE_TIMEOUT_MS;
    a.history.push({ userId: player.userId, amount, ts: Date.now() });
    // Everyone else already passed → sold, no need to wait out the clock.
    if (a.participants.every(u => u === player.userId || a.passed.includes(u))) {
        return resolveAuction(room);
    }
    return { ok: true, events: [{ type: 'auction-bid', userId: player.userId, amount }] };
}

function pass(room, player) {
    const a = room.auction;
    if (!a) return { ok: false, error: 'no-auction' };
    if (!a.participants.includes(player.userId)) return { ok: false, error: 'not-participant' };
    if (a.passed.includes(player.userId)) return { ok: false, error: 'already-passed' };
    if (a.currentBidder === player.userId) return { ok: false, error: 'top-bidder-cannot-pass' };
    a.passed.push(player.userId);
    return maybeCloseAfterPass(room, [{ type: 'auction-pass', userId: player.userId }]);
}

// Everyone except the top bidder (or everyone, if no bids) has passed → close.
function maybeCloseAfterPass(room, events) {
    const a = room.auction;
    const remaining = a.participants.filter(u => !a.passed.includes(u));
    if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === a.currentBidder)) {
        const r = resolveAuction(room);
        return { ok: true, events: events.concat(r.events) };
    }
    return { ok: true, events };
}

// A player leaving the game mid-auction. If they held the top bid, it falls
// back to the best earlier bid from someone still in.
function removeFromAuction(room, userId) {
    const a = room.auction;
    if (!a || !a.participants.includes(userId)) return [];
    a.participants = a.participants.filter(u => u !== userId);
    a.passed = a.passed.filter(u => u !== userId);
    if (a.currentBidder === userId) {
        const fallback = bestStandingBid(room, a, userId);
        a.currentBid = fallback?.amount || 0;
        a.currentBidder = fallback?.userId || null;
    }
    if (a.participants.length === 0) return resolveAuction(room).events;
    return maybeCloseAfterPass(room, []).events;
}

// The highest earlier bid by a player who is still in the game and can still
// pay it.
function bestStandingBid(room, a, excludeUserId) {
    const bids = [...a.history].reverse();
    for (const b of bids) {
        if (b.userId === excludeUserId) continue;
        const p = room.players.find(x => x.userId === b.userId);
        if (p && !p.bankrupt && p.cash >= b.amount) return b;
    }
    return null;
}

// Timer-driven close (called by a socket-layer heartbeat every ~1s).
function maybeCloseOnTimeout(room) {
    const a = room.auction;
    if (!a) return null;
    if (Date.now() < a.endsAt) return null;
    return resolveAuction(room);
}

function resolveAuction(room) {
    const a = room.auction;
    if (!a) return { ok: false, error: 'no-auction', events: [] };
    const events = [];
    let winner = null, price = 0;
    if (a.currentBidder && a.currentBid > 0) {
        const top = room.players.find(p => p.userId === a.currentBidder);
        if (top && !top.bankrupt && top.cash >= a.currentBid) {
            winner = top; price = a.currentBid;
        } else {
            // The top bidder spent the money since bidding — the best earlier
            // bid that can still be paid wins instead.
            const fb = bestStandingBid(room, a, a.currentBidder);
            if (fb) { winner = room.players.find(p => p.userId === fb.userId); price = fb.amount; }
            appendLog(room, { kind: 'auction-void-bid', userId: a.currentBidder, amount: a.currentBid });
        }
    }
    if (winner) {
        const r = transfer(room, winner.userId, 'bank', price, 'auction-win');
        events.push(...r.events);
        const st = room.tileState[a.pos];
        st.owner = winner.userId;
        winner.owned.push(a.pos);
        winner.stats.auctionWins += 1;
        winner.stats.propertiesBought += 1;
        appendLog(room, { kind: 'auction-end', pos: a.pos, winnerId: winner.userId, price });
        events.push({ type: 'auction-end', pos: a.pos, winnerId: winner.userId, price });
    } else {
        appendLog(room, { kind: 'auction-end', pos: a.pos, winnerId: null });
        events.push({ type: 'auction-end', pos: a.pos, winnerId: null });
    }
    const endTurnAfter = a.endTurnAfter;
    room.auction = null;
    // The auction happened mid-turn: carry on with that turn (roll again on
    // doubles, otherwise end it) — or, if the lander left the game meanwhile,
    // hand the turn on.
    if (endTurnAfter) {
        const { advanceTurn } = require('./engine');
        events.push(...advanceTurn(room));
    } else {
        room.turnPhase = postMovePhase(room, room.players[room.turnIndex]);
    }
    return { ok: true, events };
}

module.exports = { startAuction, placeBid, pass, removeFromAuction, maybeCloseOnTimeout, resolveAuction, IDLE_TIMEOUT_MS };
