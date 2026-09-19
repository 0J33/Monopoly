// Rules edge cases the bot games rarely hit, with the dice rigged.
// Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../game/state');
const engine = require('../game/engine');
const auction = require('../game/auction');
const trade = require('../game/trade');
const property = require('../game/property');
const { renderCardText, getCard } = require('../game/cards');

let queue = [];
const realRandom = Math.random;
// Rig the dice: each value d is served as Math.random() = (d-1)/6 + a bit.
function dice(...vals) { queue.push(...vals.map(v => (v - 1) / 6 + 0.01)); }
Math.random = () => (queue.length ? queue.shift() : realRandom());

function newGame(n = 3, boardId = 'world-tour') {
    const room = state.createRoom({ hostUserId: 'u0', hostUsername: 'Zero', hostColor: '#EF4444', boardId });
    for (let i = 1; i < n; i++) room.players.push(state.createPlayerState({ userId: 'u' + i, username: 'P' + i, color: '#3B82F6', seat: i }));
    room.started = true; room.turnIndex = 0; room.turnPhase = 'awaiting-roll'; room.turnNumber = 1;
    return room;
}
const P = (room, i) => room.players[i];

test('doubles onto Go To Jail ends the turn (no extra roll)', () => {
    const r = newGame(); const p = P(r, 0);
    p.position = 20; dice(5, 5);            // 20 + 10 = 30 (go to jail)
    assert.ok(engine.rollAndMove(r, p).ok);
    assert.equal(p.inJail, true);
    assert.equal(r.turnPhase, 'awaiting-end-turn');
});

test('card "go to jail" after doubles ends the turn', () => {
    const r = newGame(); const p = P(r, 0);
    r.chanceDeck.draw = ['ch_go_to_jail']; r.chanceDeck.discard = [];
    p.position = 3; dice(2, 2);             // 3 + 4 = 7 (chance)
    engine.rollAndMove(r, p);
    assert.equal(p.inJail, true);
    assert.equal(r.turnPhase, 'awaiting-end-turn');
    const kinds = r.actionLog.map(e => e.kind);
    assert.ok(kinds.indexOf('card') < kinds.indexOf('go-to-jail'), 'card logged before going to jail');
});

test('escaping jail with doubles then buying does not grant another roll', () => {
    const r = newGame(); const p = P(r, 0);
    p.position = 10; p.inJail = true; dice(3, 3);   // 10 + 6 = 16 (property)
    engine.rollAndMove(r, p);
    assert.equal(p.inJail, false);
    assert.equal(r.turnPhase, 'buying');
    engine.buyCurrent(r, p);
    assert.equal(r.turnPhase, 'awaiting-end-turn');
});

test('third failed jail roll with no cash becomes a debt, then moves once paid', () => {
    const r = newGame(); const p = P(r, 0);
    p.position = 10; p.inJail = true; p.jailTurns = 2; p.cash = 10;
    r.tileState[1].owner = p.userId; p.owned.push(1);   // something to mortgage
    dice(1, 2);
    engine.rollAndMove(r, p);
    assert.equal(r.turnPhase, 'resolving');
    assert.equal(r.debts[0].amount, 50);
    assert.equal(p.position, 10);
    assert.equal(engine.payDebt(r, p).ok, false);       // can't pay yet
    assert.ok(property.mortgage(r, p, 1).ok);            // +$30 → $40, still short
    p.cash = 60;
    const res = engine.payDebt(r, p);
    assert.ok(res.ok);
    assert.equal(p.inJail, false);
    assert.equal(p.position, 13);                        // moved by the 1+2
    assert.ok(['awaiting-end-turn', 'buying'].includes(r.turnPhase));
});

test('rent you cannot afford → debt → bankruptcy hands assets to owner and passes the turn', () => {
    const r = newGame(3); const p = P(r, 0), owner = P(r, 1);
    r.tileState[39].owner = owner.userId; r.tileState[39].houses = 5; owner.owned.push(39);
    r.tileState[37].owner = owner.userId; owner.owned.push(37);
    r.tileState[5].owner = p.userId; r.tileState[5].mortgaged = true; p.owned.push(5);
    p.cash = 100; p.position = 36; dice(1, 2);           // 36 + 3 = 39
    engine.rollAndMove(r, p);
    assert.equal(r.turnPhase, 'resolving');
    const before = owner.cash;
    const res = engine.declareBankruptcy(r, p);
    assert.ok(res.ok);
    assert.equal(p.bankrupt, true);
    assert.equal(r.tileState[5].owner, owner.userId);
    assert.equal(r.tileState[5].mortgaged, true, 'mortgaged property stays mortgaged for a player creditor');
    assert.equal(owner.cash, before + 100);
    assert.equal(r.turnIndex, 1);
    assert.equal(r.turnPhase, 'awaiting-roll');
    assert.equal(r.debts.length, 0);
});

test('last opponent going bankrupt ends the game', () => {
    const r = newGame(2); const p = P(r, 0);
    const res = engine.declareBankruptcy(r, p, { resigned: true });
    assert.ok(res.ok);
    assert.equal(r.ended, true);
    assert.equal(r.winnerUserId, 'u1');
    assert.equal(r.turnPhase, 'ended');
});

test('birthday card: a short opponent owes a debt; the drawer waits', () => {
    const r = newGame(3); const p = P(r, 0);
    P(r, 2).cash = 3;
    r.chestDeck.draw = ['cc_birthday']; r.chestDeck.discard = [];
    p.position = 0; dice(1, 1);                          // 0 + 2 = 2 (chest)
    engine.rollAndMove(r, p);
    assert.equal(r.turnPhase, 'resolving');
    assert.equal(r.debts[0].userId, 'u2');
    assert.equal(P(r, 1).cash, 1490);
    P(r, 2).cash = 20;
    assert.ok(engine.payDebt(r, P(r, 2)).ok);
    assert.equal(r.turnPhase, 'awaiting-roll', 'doubles: drawer rolls again once the debt is paid');
});

test('active player going bankrupt mid-auction: auction finishes, then the turn passes', () => {
    const r = newGame(3); const p = P(r, 0);
    p.position = 1; r.turnPhase = 'buying'; r.rules.auctionUnbought = true;
    engine.declineBuy(r, p);
    assert.equal(r.turnPhase, 'auctioning');
    auction.placeBid(r, P(r, 1), 20);
    engine.declareBankruptcy(r, p, { resigned: true });
    assert.ok(r.auction, 'auction continues');
    const res = auction.pass(r, P(r, 2));
    assert.ok(res.ok);
    assert.equal(r.auction, null);
    assert.equal(r.tileState[1].owner, 'u1');
    assert.equal(r.turnIndex, 1);
    assert.equal(r.turnPhase, 'awaiting-roll');
});

test('auction bid of NaN / below minimum / by top bidder is refused', () => {
    const r = newGame(3); r.turnPhase = 'buying'; P(r, 0).position = 1;
    engine.declineBuy(r, P(r, 0));
    assert.equal(auction.placeBid(r, P(r, 1), NaN).error, 'bad-amount');
    assert.equal(auction.placeBid(r, P(r, 1), 5).error, 'below-min');
    assert.ok(auction.placeBid(r, P(r, 1), 10).ok);
    assert.equal(auction.placeBid(r, P(r, 1), 50).error, 'already-top-bidder');
});

test('trades: no self-trade, no built-up sets, proposer counts as accepting', () => {
    const r = newGame(3); const a = P(r, 0), b = P(r, 1);
    for (const pos of [1, 3]) { r.tileState[pos].owner = a.userId; a.owned.push(pos); }
    assert.equal(trade.proposeTrade(r, a, a.userId, { properties: [1] }, {}).error, 'cannot-trade-with-yourself');
    r.tileState[3].houses = 1;
    assert.equal(trade.proposeTrade(r, a, b.userId, { properties: [1] }, { cash: 10 }).error, 'sell-buildings-first');
    r.tileState[3].houses = 0;
    const t = trade.proposeTrade(r, a, b.userId, { properties: [1] }, { cash: 100 });
    assert.ok(t.ok);
    const acc = trade.acceptTrade(r, b, t.trade.id);
    assert.ok(acc.ok);
    assert.equal(r.tileState[1].owner, b.userId);
    assert.equal(a.cash, 1600);
});

test('cannot end turn before rolling, or skip a doubles re-roll', () => {
    const r = newGame(); const p = P(r, 0);
    assert.equal(engine.endTurn(r, p).error, 'roll-first');
    p.position = 0; dice(2, 2);                          // 0 + 4 = 4 (income tax)
    engine.rollAndMove(r, p);
    assert.equal(r.turnPhase, 'awaiting-roll');
    assert.equal(engine.endTurn(r, p).error, 'roll-again-doubles');
});

test('"go back 3" walks backwards 3 tiles', () => {
    const r = newGame(); const p = P(r, 0);
    r.chanceDeck.draw = ['ch_go_back_3']; r.chanceDeck.discard = [];
    p.position = 3; dice(1, 3);                          // 3 + 4 = 7 (chance) → 4
    const res = engine.rollAndMove(r, p);
    const moves = res.events.filter(e => e.type === 'move');
    assert.deepEqual(moves[1].path, [6, 5, 4]);
    assert.equal(p.position, 4);
});

test('card text names the board it is on', () => {
    const r = newGame(2, 'classic-monopoly');
    assert.equal(renderCardText(getCard('ch_advance_39'), r), 'Advance to Boardwalk.');
    const rr = newGame(2, 'richup-world');
    assert.match(renderCardText(getCard('ch_nearest_station_1'), rr), /nearest airport/);
    assert.match(renderCardText(getCard('cc_go_to_jail'), rr), /Go to Prison/);
});

test('names: cleaned, de-duplicated', () => {
    const r = newGame(2);
    r.players[1].username = 'Sam';
    assert.equal(state.uniqueName(r, state.sanitizeName('  sam  ')), 'sam 2');
    assert.equal(state.sanitizeName('‮evil\u0000'), 'evil');
});

test('decks keep 16 cards through reshuffles with a held jail card', () => {
    const r = newGame(2); const p = P(r, 0);
    for (let i = 0; i < 40; i++) {
        const c = engine.drawCard(r, 'chance', p);
        if (c.effect.kind === 'jailFree') { r.jailFreeLedger[p.userId] = { chance: 1, chest: 0 }; }
        else r.chanceDeck.discard.push(c.id);
    }
    const held = r.jailFreeLedger[p.userId]?.chance || 0;
    assert.equal(r.chanceDeck.draw.length + r.chanceDeck.discard.length + held, 16);
});
