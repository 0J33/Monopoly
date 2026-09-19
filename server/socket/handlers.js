// Socket.io layer. Every inbound event goes through `handle()` which (a)
// resolves the player, (b) calls the matching engine action, (c) broadcasts
// the resulting delta + events to the whole room. We keep logic in
// game/*.js so this file stays thin.

const {
    activeRooms, getRoom, deleteRoom, publicView, bumpVersion,
    appendChat, appendLog, TOKEN_COLORS, createPlayerState,
    sanitizeName, uniqueName,
} = require('../game/state');
const { BUILTIN_BOARDS, computeGroupSizes } = require('../game/boards');
const { COOKIE } = require('../middleware/session');
const engine = require('../game/engine');
const property = require('../game/property');
const auction = require('../game/auction');
const trade = require('../game/trade');
const GameRoom = require('../models/GameRoom');

const SAVE_INTERVAL = 30000;
const saveTimers = new Map();
// A lobby seat is freed this long after its player disconnects.
const LOBBY_LEAVE_MS = 30000;
// Mid-game, anyone can remove a player who has been offline this long, so
// one closed tab can't stall the game forever.
const OFFLINE_REMOVE_MS = 60000;
// Rooms nobody is connected to are dropped after this long.
const IDLE_ROOM_MS = 6 * 60 * 60 * 1000;
const ENDED_ROOM_MS = 60 * 60 * 1000;

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

// Who is this socket? The userId comes from the httpOnly `monopoly_uid`
// cookie the HTTP layer set — the browser sends it with the socket.io
// handshake (same origin). Never from the client-supplied auth payload:
// every player's userId is in the public room state, so trusting that would
// let anyone act as anyone.
function cookieUserId(socket) {
    const header = socket.handshake.headers?.cookie || '';
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i === -1 || part.slice(0, i).trim() !== COOKIE) continue;
        try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
    return null;
}

function identify(socket) {
    const userId = cookieUserId(socket);
    const roomCode = socket.handshake.auth?.roomCode;
    if (!userId || userId.length < 8 || !roomCode) return null;
    const room = getRoom(String(roomCode).toUpperCase());
    if (!room) return null;
    return { room, userId };
}

// Is any other socket of this user still in the room? (Two tabs, or a
// reconnect racing the old socket's disconnect.)
function userStillConnected(io, room, userId, exceptSocketId) {
    for (const s of io.of('/').sockets.values()) {
        if (s.id !== exceptSocketId && s.data.roomCode === room.roomCode && s.data.userId === userId) return true;
    }
    return false;
}

function onJoin(io, socket, payload) {
    const ident = identify(socket);
    if (!ident) return socket.emit('error-msg', 'room-not-found');
    const { room, userId } = ident;
    const { username, color, asSpectator } = payload || {};

    socket.join(room.roomCode);
    socket.data.roomCode = room.roomCode;
    socket.data.userId = userId;
    socket.emit('chat-history', room.chat);

    const existing = room.players.find(p => p.userId === userId);
    if (existing) {
        const wasOffline = !existing.connected;
        existing.socketId = socket.id;
        existing.connected = true;
        existing.disconnectedAt = null;
        if (!room.started && username) existing.username = uniqueName(room, sanitizeName(username, existing.username), userId);
        if (wasOffline && existing.announcedOffline && room.started && !existing.bankrupt) sysChat(io, room, `${existing.username} is back`);
        existing.announcedOffline = false;
        return broadcast(io, room, [{ type: 'player-reconnect', userId }]);
    }
    if (asSpectator || room.started || room.players.length >= 8) {
        if (!asSpectator && !room.started) socket.emit('error-msg', 'room-full');
        const spec = room.spectators.find(s => s.userId === userId);
        if (spec) { spec.socketId = socket.id; }
        else {
            room.spectators.push({ userId, username: sanitizeName(username, 'Spectator'), socketId: socket.id });
        }
        return broadcast(io, room, [{ type: 'spectator-join', userId }]);
    }

    // Color conflict → auto-pick next free color.
    let hex = TOKEN_COLORS.find(c => c.hex === color || c.id === color)?.hex || TOKEN_COLORS[room.players.length % TOKEN_COLORS.length].hex;
    if (room.players.some(p => p.color === hex)) {
        const free = TOKEN_COLORS.find(c => !room.players.some(p => p.color === c.hex));
        hex = free?.hex || TOKEN_COLORS[0].hex;
    }
    const p = createPlayerState({
        userId,
        username: uniqueName(room, sanitizeName(username)),
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
    if (!room || !room.started || room.ended) return null;
    const active = room.players[room.turnIndex];
    return active && active.userId === userId && !active.bankrupt ? active : null;
}

// Lobby only: take a player out of the room entirely and keep the seats and
// host role consistent.
function removeFromLobby(io, room, userId, text) {
    const idx = room.players.findIndex(p => p.userId === userId);
    if (idx === -1) return;
    const [removed] = room.players.splice(idx, 1);
    room.players.forEach((p, i) => { p.seat = i; });
    if (room.players.length === 0) {
        stopAutoSave(room.roomCode);
        deleteRoom(room.roomCode);
        return;
    }
    if (removed.userId === room.hostUserId) {
        const next = room.players.find(p => p.connected) || room.players[0];
        room.hostUserId = next.userId;
        room.players.forEach(p => { p.isHost = p.userId === next.userId; });
        sysChat(io, room, `${removed.username} left — ${next.username} is the host now`);
    } else {
        sysChat(io, room, text || `${removed.username} left`);
    }
    broadcast(io, room, [{ type: 'player-leave', userId }]);
}

// Rules the host can change, with the range each may take. Anything outside
// is clamped; anything of the wrong type is ignored.
const RULES = {
    startingCash:        { type: 'int',  min: 0,   max: 100000 },
    salary:              { type: 'int',  min: 0,   max: 10000 },
    doubleOnGo:          { type: 'bool' },
    freeParkingPot:      { type: 'bool' },
    auctionUnbought:     { type: 'bool' },
    noRentInJail:        { type: 'bool' },
    evenBuild:           { type: 'bool' },
    mortgageRebuyRate:   { type: 'num',  min: 1,   max: 2 },
    jailFine:            { type: 'int',  min: 0,   max: 5000 },
    jailTurnsMax:        { type: 'int',  min: 1,   max: 10 },
    xDoubles:            { type: 'int',  min: 2,   max: 10 },
    allowDevOnMortgaged: { type: 'bool' },
    randomTurnOrder:     { type: 'bool' },
};
function coerceRule(spec, v) {
    if (spec.type === 'bool') return typeof v === 'boolean' ? v : undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const x = spec.type === 'int' ? Math.round(n) : n;
    return Math.min(spec.max, Math.max(spec.min, x));
}

// ─── Dispatch table ──────────────────────────────────────────────────────────
const handlers = {
    'chat': (io, socket, { text }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = room.players.find(pl => pl.userId === socket.data.userId)
               || room.spectators.find(s => s.userId === socket.data.userId);
        if (!p) return;
        const clean = String(text ?? '').trim();
        if (!clean) return;
        // Gentle flood control: at most 6 messages per 5 seconds per socket.
        const now = Date.now();
        socket.data.chatTimes = (socket.data.chatTimes || []).filter(t => now - t < 5000);
        if (socket.data.chatTimes.length >= 6) return socket.emit('error-msg', 'slow-down');
        socket.data.chatTimes.push(now);
        const msg = appendChat(room, { userId: p.userId, username: p.username, text: clean });
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

    // Names are fixed once the game starts — the log and trades refer to them.
    'set-username': (io, socket, { username }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room || room.started) return;
        const p = room.players.find(pl => pl.userId === socket.data.userId)
               || room.spectators.find(s => s.userId === socket.data.userId);
        if (!p) return;
        const next = uniqueName(room, sanitizeName(username, p.username), p.userId);
        if (next === p.username) return;
        p.username = next;
        broadcast(io, room, [{ type: 'player-rename', userId: p.userId }]);
    },

    'set-board': (io, socket, { boardId }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room || room.started) return;
        if (socket.data.userId !== room.hostUserId) return socket.emit('error-msg', 'not-host');
        const b = BUILTIN_BOARDS[boardId];
        if (!b) return socket.emit('error-msg', 'unknown-board');
        room.board = {
            id: b.id, name: b.name, tiles: b.tiles, groupColors: b.groupColors,
            groupSizes: b.groupSizes || computeGroupSizes(b.tiles),
            deckNames: b.deckNames, stationNoun: b.stationNoun, jailNoun: b.jailNoun || 'Jail',
            groupNames: b.groupNames || null,
        };
        sysChat(io, room, `Board changed to ${b.name}`);
        broadcast(io, room, [{ type: 'board-changed' }]);
    },

    'update-rules': (io, socket, { rules }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room || room.started) return;
        if (socket.data.userId !== room.hostUserId) return socket.emit('error-msg', 'not-host');
        for (const [k, spec] of Object.entries(RULES)) {
            if (!(k in (rules || {}))) continue;
            const v = coerceRule(spec, rules[k]);
            if (v !== undefined) room.rules[k] = v;
        }
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
        const target = room.players.find(p => p.userId === userId);
        if (!target) return;
        for (const s of io.of('/').sockets.values()) {
            if (s.data.roomCode === room.roomCode && s.data.userId === userId) {
                s.emit('kicked');
                s.leave(room.roomCode);
                s.data.roomCode = null;
            }
        }
        removeFromLobby(io, room, userId, `${target.username} was removed by the host`);
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
        room.turnNumber = 1;
        for (const p of room.players) p.cash = room.rules.startingCash;
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
        // A double-click shouldn't cost anyone a second roll.
        const now = Date.now();
        if (socket.data.lastRollAt && now - socket.data.lastRollAt < 400) return;
        socket.data.lastRollAt = now;
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
        if (!p) return;
        const r = engine.payJailFine(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },
    'jail-card': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        const p = requireActive(room, socket.data.userId);
        if (!p) return;
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

    // Pay the debt you're in (rent, tax, card, jail fine you couldn't cover).
    'pay-debt': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = requirePlayer(room, socket.data.userId);
        if (!p) return;
        const r = engine.payDebt(room, p);
        if (!r.ok) return socket.emit('error-msg', r.error);
        broadcast(io, room, r.events);
    },

    // Go bankrupt. With a debt: assets go to whoever it's owed to. Without
    // one it's resigning: assets go back to the bank. Either way the game
    // carries on without them. The creditor comes from the debt on record,
    // never from the client.
    'bankrupt': (io, socket) => {
        const room = getRoom(socket.data.roomCode);
        if (!room) return;
        const p = room.players.find(pl => pl.userId === socket.data.userId);
        if (!p) return;
        const inDebt = room.debts.some(d => d.userId === p.userId);
        const r = engine.declareBankruptcy(room, p, { resigned: !inDebt });
        if (!r.ok) return socket.emit('error-msg', r.error);
        sysChat(io, room, inDebt ? `${p.username} went bankrupt` : `${p.username} resigned`);
        afterGameChange(io, room);
        broadcast(io, room, r.events);
    },

    // Remove a player who has been offline for a while (closed the tab, lost
    // signal) so the game isn't stuck waiting on them. Their assets go to the
    // bank, exactly as if they'd resigned.
    'remove-player': (io, socket, { userId }) => {
        const room = getRoom(socket.data.roomCode);
        if (!room || !room.started || room.ended) return;
        const me = requirePlayer(room, socket.data.userId);
        if (!me) return;
        const target = room.players.find(p => p.userId === userId);
        if (!target || target.bankrupt || target.userId === me.userId) return;
        if (target.connected || !target.disconnectedAt || Date.now() - target.disconnectedAt < OFFLINE_REMOVE_MS) {
            return socket.emit('error-msg', 'player-not-idle');
        }
        const r = engine.declareBankruptcy(room, target, { resigned: true });
        if (!r.ok) return socket.emit('error-msg', r.error);
        sysChat(io, room, `${target.username} was removed after going offline (by ${me.username})`);
        afterGameChange(io, room);
        broadcast(io, room, r.events);
    },
};

// Game-over housekeeping shared by the handlers that can end a game.
function afterGameChange(io, room) {
    if (room.ended) {
        const w = room.players.find(p => p.userId === room.winnerUserId);
        if (w && !room.announcedWinner) {
            room.announcedWinner = true;
            sysChat(io, room, `${w.username} wins the game!`);
        }
    }
}

function doPropAction(io, socket, getFn, pos) {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const p = room.players.find(pl => pl.userId === socket.data.userId);
    if (!p) return;
    const action = getFn(p);
    const r = action(room, p, Number(pos));
    if (r.ok) afterGameChange(io, room);
    if (!r.ok) return socket.emit('error-msg', r.error);
    broadcast(io, room, r.events);
}

function registerSocketHandlers(io) {
    // Heartbeat for auction timers. Runs every second across all rooms, only
    // checks rooms that actually have an open auction.
    setInterval(() => {
        const now = Date.now();
        for (const room of activeRooms.values()) {
            if (room.auction) {
                const r = auction.maybeCloseOnTimeout(room);
                if (r && r.events && r.events.length) broadcast(io, room, r.events);
            }
            // Forget rooms nobody has been in for a long time.
            const idle = now - room.lastActivity;
            const anyone = room.players.some(p => p.connected) || room.spectators.some(s => s.socketId);
            if (!anyone && idle > (room.ended ? ENDED_ROOM_MS : IDLE_ROOM_MS)) {
                stopAutoSave(room.roomCode);
                deleteRoom(room.roomCode);
            }
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
        socket.on('pay-debt',      ()  => safe(() => handlers['pay-debt'](io, socket), socket));
        socket.on('set-board',     (p) => safe(() => handlers['set-board'](io, socket, p), socket));
        socket.on('remove-player', (p) => safe(() => handlers['remove-player'](io, socket, p), socket));

        socket.on('disconnect', () => {
            const room = getRoom(socket.data.roomCode);
            if (!room) return;
            const userId = socket.data.userId;
            if (userStillConnected(io, room, userId, socket.id)) return;
            const spec = room.spectators.find(s => s.userId === userId);
            if (spec) spec.socketId = null;
            const p = room.players.find(pl => pl.userId === userId);
            if (!p) return;
            p.connected = false;
            p.socketId = null;
            p.disconnectedAt = Date.now();
            if (!room.started) {
                // Free the lobby seat if they don't come back.
                setTimeout(() => {
                    const r = getRoom(room.roomCode);
                    const still = r?.players.find(x => x.userId === userId);
                    if (r && !r.started && still && !still.connected) removeFromLobby(io, r, userId);
                }, LOBBY_LEAVE_MS);
            } else if (!p.bankrupt && !room.ended) {
                // Only mention it if they don't come straight back (a reload
                // or a flaky connection shouldn't spam the chat).
                setTimeout(() => {
                    const r = getRoom(room.roomCode);
                    const still = r?.players.find(x => x.userId === userId);
                    if (r && still && !still.connected && !still.bankrupt && !r.ended) {
                        still.announcedOffline = true;
                        sysChat(io, r, `${still.username} went offline`);
                    }
                }, 10000);
            }
            broadcast(io, room, [{ type: 'player-disconnect', userId }]);
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
