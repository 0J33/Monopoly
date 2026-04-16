// Socket.io layer. Every inbound event goes through `handle()` which (a)
// resolves the player, (b) calls the matching engine action, (c) broadcasts
// the resulting delta + events to the whole room. We keep logic in
// game/*.js so this file stays thin.

const { v4: uuidv4 } = require('uuid');
const {
    activeRooms, getRoom, publicView, bumpVersion,
    appendChat, appendLog, TOKEN_COLORS,
} = require('../game/state');
const engine = require('../game/engine');
const property = require('../game/property');
const auction = require('../game/auction');
const trade = require('../game/trade');
const GameRoom = require('../models/GameRoom');

const SAVE_INTERVAL = 30000;
const saveTimers = new Map();

function startAutoSave(roomCode) {
    if (saveTimers.has(roomCode)) return;
    const t = setInterval(async () => {
        const r = getRoom(roomCode);
        if (!r) { clearInterval(t); saveTimers.delete(roomCode); return; }
        try {
            await GameRoom.findOneAndUpdate(
                { roomCode },
                { roomCode, hostUserId: r.hostUserId, state: stripTransient(r), lastActivity: new Date() },
                { upsert: true }
            );
        } catch (e) { /* mongo optional in dev */ }
    }, SAVE_INTERVAL);
    saveTimers.set(roomCode, t);
}
function stopAutoSave(roomCode) {
    const t = saveTimers.get(roomCode);
    if (t) { clearInterval(t); saveTimers.delete(roomCode); }
}
function stripTransient(room) {
    return {
        ...room,
        players: room.players.map(p => ({ ...p, socketId: null, connected: true })),
        spectators: room.spectators.map(s => ({ ...s, socketId: null })),
    };
}

function broadcast(io, room, events = []) {
    bumpVersion(room);
    io.to(room.roomCode).emit('state', { room: publicView(room), events });
}

function sysChat(io, room, text) {
    const msg = appendChat(room, { userId: null, username: 'System', text, system: true });
    io.to(room.roomCode).emit('chat', msg);
}

// Per-socket auth payload sent by client on connect: { userId, roomCode, username, color }.
// We trust userId because it comes from an httpOnly cookie the HTTP layer set.
function identify(socket) {
    const auth = socket.handshake.auth || {};
    const { userId, roomCode } = auth;
    if (!userId || !roomCode) return null;
    const room = getRoom(String(roomCode).toUpperCase());
    if (!room) return null;
    return { room, userId };
}

function onJoin(io, socket, payload) {
    const ident = identify(socket);
    if (!ident) return socket.emit('error-msg', 'invalid-session');
    const { room, userId } = ident;
    const { username, color, asSpectator } = payload || {};

    socket.join(room.roomCode);
    socket.data.roomCode = room.roomCode;
    socket.data.userId = userId;

    const existing = room.players.find(p => p.userId === userId);
    if (existing) {
        existing.socketId = socket.id;
        existing.connected = true;
        if (username) existing.username = String(username).slice(0, 24);
        return broadcast(io, room, [{ type: 'player-reconnect', userId }]);
    }
    if (asSpectator || room.started) {
        const spec = room.spectators.find(s => s.userId === userId);
        if (spec) { spec.socketId = socket.id; }
        else {
            room.spectators.push({ userId, username: (username || 'Spectator').slice(0, 24), socketId: socket.id });
        }
        return broadcast(io, room, [{ type: 'spectator-join', userId }]);
    }
    if (room.players.length >= 8) return socket.emit('error-msg', 'room-full');

    // Color conflict → auto-pick next free color.
    let hex = color || TOKEN_COLORS[room.players.length].hex;
    if (room.players.some(p => p.color === hex)) {
        const free = TOKEN_COLORS.find(c => !room.players.some(p => p.color === c.hex));
        hex = free?.hex || TOKEN_COLORS[0].hex;
    }
    const { createPlayerState } = require('../game/state');
    const p = createPlayerState({
        userId,
        username: (username || 'Player').slice(0, 24),
        color: hex,
        seat: room.players.length,
        isHost: false,
        startingCash: room.rules.startingCash,
    });
    p.socketId = socket.id;
    room.players.push(p);
    sysChat(io, room, `${p.username} joined`);
    broadcast(io, room, [{ type: 'player-join', userId }]);
}

function requirePlayer(room, userId) {
    return room.players.find(p => p.userId === userId && !p.bankrupt) || null;
}
function requireActive(room, userId) {
    const active = room.players[room.turnIndex];
    return active && active.userId === userId ? active : null;
}

// ─── Dispatch table ──────────────────────────────────────────────────────────
const handlers = {
    'chat': (io, socket, { text }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = room.players.find(pl => pl.userId === socket.data.userId)
               || room.spectators.find(s => s.userId === socket.data.userId);
        if (!p) return;
        const msg = appendChat(room, { userId: p.userId, username: p.username, text });
        io.to(room.roomCode).emit('chat', msg);
    },

    'set-color': (io, socket, { color }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room || room.started) return;
        const p = room.players.find(pl => pl.userId === socket.data.userId);
        if (!p) return;
        const hex = TOKEN_COLORS.find(c => c.hex === color || c.id === color)?.hex;
        if (!hex) return;
        if (room.players.some(x => x !== p && x.color === hex)) return socket.emit('error-msg', 'color-taken');
        p.color = hex;
        broadcast(io, room, [{ type: 'player-color', userId: p.userId }]);
    },

    'set-username': (io, socket, { username }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = room.players.find(pl => pl.userId === socket.data.userId)
               || room.spectators.find(s => s.userId === socket.data.userId);
        if (!p) return;
        p.username = String(username).slice(0, 24);
        broadcast(io, room, [{ type: 'player-rename', userId: p.userId }]);
    },

    'update-rules': (io, socket, { rules }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room || room.started) return;
        if (socket.data.userId !== room.hostUserId) return socket.emit('error-msg', 'not-host');
        const allow = ['startingCash', 'salary', 'doubleOnGo', 'freeParkingPot', 'auctionUnbought',
                       'noRentInJail', 'evenBuild', 'mortgageRebuyRate', 'jailFine', 'jailTurnsMax',
                       'xDoubles', 'turnClockSeconds', 'allowDevOnMortgaged', 'randomTurnOrder'];
        for (const k of allow) if (k in (rules || {})) room.rules[k] = rules[k];
        // Refund/charge starting cash adjustments before game starts so players
        // see the current number in lobby.
        for (const p of room.players) p.cash = room.rules.startingCash;
        broadcast(io, room, [{ type: 'rules-updated' }]);
    },

    'kick': (io, socket, { userId }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room || room.started) return;
        if (socket.data.userId !== room.hostUserId) return;
        if (userId === room.hostUserId) return;
        const idx = room.players.findIndex(p => p.userId === userId);
        if (idx === -1) return;
        const [removed] = room.players.splice(idx, 1);
        // Reindex seats.
        room.players.forEach((p, i) => p.seat = i);
        sysChat(io, room, `${removed.username} was removed by host`);
        broadcast(io, room, [{ type: 'player-kick', userId }]);
    },

    'start-game': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        if (socket.data.userId !== room.hostUserId) return socket.emit('error-msg', 'not-host');
        if (room.started) return;
        if (room.players.length < 2) return socket.emit('error-msg', 'need-2-players');
        if (room.rules.randomTurnOrder) {
            // Shuffle player array and re-assign seats.
            for (let i = room.players.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [room.players[i], room.players[j]] = [room.players[j], room.players[i]];
            }
            room.players.forEach((p, i) => p.seat = i);
        }
        room.started = true;
        room.turnIndex = 0;
        room.turnPhase = 'awaiting-roll';
        room.turnStartedAt = Date.now();
        appendLog(room, { kind: 'game-start' });
        // First turn-start doesn't come through endTurn, so log it here.
        appendLog(room, { kind: 'turn-start', userId: room.players[0].userId });
        startAutoSave(room.roomCode);
        sysChat(io, room, `Game started — ${room.players[0].username} goes first.`);
        broadcast(io, room, [{ type: 'game-start' }, { type: 'turn-start', userId: room.players[0].userId }]);
    },

    'roll': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requireActive(room, socket.data.userId);
        if (!p) return socket.emit('error-msg', 'not-your-turn');
        const r = engine.rollAndMove(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },

    'buy': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requireActive(room, socket.data.userId);
        if (!p) return;
        const r = engine.buyCurrent(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },

    'decline-buy': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requireActive(room, socket.data.userId);
        if (!p) return;
        const r = engine.declineBuy(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },

    'end-turn': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requireActive(room, socket.data.userId);
        if (!p) return;
        const r = engine.endTurn(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },

    'jail-pay':  (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        const p = requireActive(room, socket.data.userId);
        if (!room || !p) return;
        const r = engine.payJailFine(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },
    'jail-card': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        const p = requireActive(room, socket.data.userId);
        if (!room || !p) return;
        const r = engine.useJailCard(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },

    'mortgage':   (io, socket, { pos }) => doPropAction(io, socket, p => property.mortgage, pos),
    'unmortgage': (io, socket, { pos }) => doPropAction(io, socket, p => property.unmortgage, pos),
    'build':      (io, socket, { pos }) => doPropAction(io, socket, p => property.buildHouse, pos),
    'demolish':   (io, socket, { pos }) => doPropAction(io, socket, p => property.sellHouse, pos),

    'auction-bid':  (io, socket, { amount }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requirePlayer(room, socket.data.userId);
        if (!p) return;
        const r = auction.placeBid(room, p, Number(amount));
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },
    'auction-pass': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requirePlayer(room, socket.data.userId);
        if (!p) return;
        const r = auction.pass(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },

    'trade-propose': (io, socket, { toUserId, offer, request }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requirePlayer(room, socket.data.userId);
        if (!p) return;
        const r = trade.proposeTrade(room, p, toUserId, offer, request);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },
    'trade-update': (io, socket, { tradeId, offer, request }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requirePlayer(room, socket.data.userId);
        if (!p) return;
        const r = trade.updateTrade(room, p, tradeId, offer, request);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },
    'trade-accept': (io, socket, { tradeId }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requirePlayer(room, socket.data.userId);
        if (!p) return;
        const r = trade.acceptTrade(room, p, tradeId);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },
    'trade-reject': (io, socket, { tradeId }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requirePlayer(room, socket.data.userId);
        if (!p) return;
        const r = trade.rejectOrCancelTrade(room, p, tradeId);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },
    'trade-msg': (io, socket, { tradeId, text }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requirePlayer(room, socket.data.userId);
        if (!p) return;
        const r = trade.tradeMessage(room, p, tradeId, text);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },

    'bankrupt': (io, socket, { creditorUserId }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = room.players.find(pl => pl.userId === socket.data.userId);
        if (!p) return;
        const r = engine.declareBankruptcy(room, p, creditorUserId || null);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },
};

function doPropAction(io, socket, getFn, pos) {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const p = room.players.find(pl => pl.userId === socket.data.userId);
    if (!p) return;
    const action = getFn(p);
    const r = action(room, p, Number(pos));
    if (!r.ok) return socket.emit('error-msg', r.error);
    broadcast(io, room, r.events);
}

function registerSocketHandlers(io) {
    // Heartbeat for auction timers. Runs every second across all rooms, only
    // checks rooms that actually have an open auction.
    setInterval(() => {
        for (const room of activeRooms.values()) {
            if (!room.auction) continue;
            const r = auction.maybeCloseOnTimeout(room);
            if (r && r.events && r.events.length) broadcast(io, room, r.events);
        }
    }, 1000);

    io.on('connection', (socket) => {
        onJoin(io, socket, socket.handshake.auth);

        socket.on('chat',          (p) => safe(() => handlers['chat'](io, socket, p), socket));
        socket.on('set-color',     (p) => safe(() => handlers['set-color'](io, socket, p), socket));
        socket.on('set-username',  (p) => safe(() => handlers['set-username'](io, socket, p), socket));
        socket.on('update-rules',  (p) => safe(() => handlers['update-rules'](io, socket, p), socket));
        socket.on('kick',          (p) => safe(() => handlers['kick'](io, socket, p), socket));
        socket.on('start-game',    ()  => safe(() => handlers['start-game'](io, socket), socket));
        socket.on('roll',          ()  => safe(() => handlers['roll'](io, socket), socket));
        socket.on('buy',           ()  => safe(() => handlers['buy'](io, socket), socket));
        socket.on('decline-buy',   ()  => safe(() => handlers['decline-buy'](io, socket), socket));
        socket.on('end-turn',      ()  => safe(() => handlers['end-turn'](io, socket), socket));
        socket.on('jail-pay',      ()  => safe(() => handlers['jail-pay'](io, socket), socket));
        socket.on('jail-card',     ()  => safe(() => handlers['jail-card'](io, socket), socket));
        socket.on('mortgage',      (p) => safe(() => handlers['mortgage'](io, socket, p), socket));
        socket.on('unmortgage',    (p) => safe(() => handlers['unmortgage'](io, socket, p), socket));
        socket.on('build',         (p) => safe(() => handlers['build'](io, socket, p), socket));
        socket.on('demolish',      (p) => safe(() => handlers['demolish'](io, socket, p), socket));
        socket.on('auction-bid',   (p) => safe(() => handlers['auction-bid'](io, socket, p), socket));
        socket.on('auction-pass',  ()  => safe(() => handlers['auction-pass'](io, socket), socket));
        socket.on('trade-propose', (p) => safe(() => handlers['trade-propose'](io, socket, p), socket));
        socket.on('trade-update',  (p) => safe(() => handlers['trade-update'](io, socket, p), socket));
        socket.on('trade-accept',  (p) => safe(() => handlers['trade-accept'](io, socket, p), socket));
        socket.on('trade-reject',  (p) => safe(() => handlers['trade-reject'](io, socket, p), socket));
        socket.on('trade-msg',     (p) => safe(() => handlers['trade-msg'](io, socket, p), socket));
        socket.on('bankrupt',      (p) => safe(() => handlers['bankrupt'](io, socket, p), socket));

        socket.on('disconnect', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room) return;
            const p = room.players.find(pl => pl.socketId === socket.id);
            if (p) { p.connected = false; p.socketId = null; }
            broadcast(io, room, [{ type: 'player-disconnect', userId: socket.data.userId }]);
        });
    });
}

function safe(fn, socket) {
    try { fn(); }
    catch (e) {
        console.error('[socket handler]', e);
        socket.emit('error-msg', 'server-error');
    }
}

module.exports = registerSocketHandlers;
