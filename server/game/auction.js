// Live auction. Triggered when a player lands on an unowned property and
// declines to buy (and rules.auctionUnbought is on), or manually by any
// property owner via `offerAuction`. Everyone non-bankrupt can bid including
// the player who declined. Auction ends when (a) a bid has stood for
// `idleTimeoutMs`, or (b) everyone except the top bidder has passed.

const { transfer, tileDef, tileSt } = require('./engine');
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
    appendLog(room, { kind: 'auction-start', pos, name: def.name });
    return { ok: true, events: [{ type: 'auction-start', pos, auction: room.auction }] };
}

function placeBid(room, player, amount) {
    const a = room.auction;
    if (!a) return { ok: false, error: 'no-auction' };
    if (!a.participants.includes(player.userId)) return { ok: false, error: 'not-participant' };
    if (a.passed.includes(player.userId)) return { ok: false, error: 'already-passed' };
    if (player.cash < amount) return { ok: false, error: 'insufficient' };
    const min = a.currentBid + a.minIncrement;
    if (amount < min) return { ok: false, error: 'below-min', min };

    a.currentBid = amount;
    a.currentBidder = player.userId;
    a.endsAt = Date.now() + IDLE_TIMEOUT_MS;
    a.history.push({ userId: player.userId, amount, ts: Date.now() });
    return { ok: true, events: [{ type: 'auction-bid', userId: player.userId, amount }] };
}

function pass(room, player) {
    const a = room.auction;
    if (!a) return { ok: false, error: 'no-auction' };
    if (!a.participants.includes(player.userId)) return { ok: false, error: 'not-participant' };
    if (a.passed.includes(player.userId)) return { ok: false, error: 'already-passed' };
    a.passed.push(player.userId);
    // Everyone except top bidder (or everyone if no bids) passed → resolve.
    const remaining = a.participants.filter(u => !a.passed.includes(u));
    if (remaining.length === 0 || (remaining.length === 1 && remaining[0] === a.currentBidder)) {
        return resolveAuction(room);
    }
    return { ok: true, events: [{ type: 'auction-pass', userId: player.userId }] };
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
    if (!a) return { ok: false, error: 'no-auction' };
    const events = [];
    if (a.currentBidder && a.currentBid > 0) {
        const winner = room.players.find(p => p.userId === a.currentBidder);
        if (winner && winner.cash >= a.currentBid) {
            const r = transfer(room, winner.userId, 'bank', a.currentBid, 'auction-win');
            events.push(...r.events);
            const st = room.tileState[a.pos];
            st.owner = winner.userId;
            winner.owned.push(a.pos);
            winner.stats.auctionWins += 1;
            appendLog(room, { kind: 'auction-end', pos: a.pos, winnerId: winner.userId, price: a.currentBid });
            events.push({ type: 'auction-end', pos: a.pos, winnerId: winner.userId, price: a.currentBid });
        }
    } else {
        appendLog(room, { kind: 'auction-end', pos: a.pos, winnerId: null });
        events.push({ type: 'auction-end', pos: a.pos, winnerId: null });
    }
    room.auction = null;
    // Restore the prior phase: if the player who landed still had a doubles
    // chain, they keep rolling; otherwise they end their turn.
    const active = room.players[room.turnIndex];
    const isDouble = room.lastDice && room.lastDice[0] === room.lastDice[1];
    room.turnPhase = (isDouble && !active.inJail) ? 'awaiting-roll' : 'awaiting-end-turn';
    return { ok: true, events };
}

module.exports = { startAuction, placeBid, pass, maybeCloseOnTimeout, resolveAuction, IDLE_TIMEOUT_MS };
