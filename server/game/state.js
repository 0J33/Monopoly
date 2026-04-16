// Room + player state factories. Mirrors mtg.ojee.net's pattern — in-memory
// Map keyed by roomCode, periodic snapshot to mongodb. Engine code in
// engine.js mutates these shapes; the serializer (gameStateForClient) strips
// private fields before broadcast.

const { v4: uuidv4 } = require('uuid');
const { BUILTIN_BOARDS, WORLD_TOUR } = require('./boards');
const { newChanceDeck, newChestDeck } = require('./cards');

const activeRooms = new Map();

// Room codes shown to users — no ambiguous chars (O/0, I/1, etc.), 6 long.
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        if (!activeRooms.has(code)) return code;
    }
    // Fall back to uuid fragment if we somehow collide 10×. Never expected.
    return uuidv4().slice(0, 6).toUpperCase();
}

// Ten paintable tokens. Player-picked at join, host can reassign if needed.
// Hex values chosen for contrast on the dark board; avoid pairs that are
// hard to tell apart at a glance (no red+pink both in the defaults).
// Player token palette. Hex values picked so they read on dark board even at
// 20px. Black and white bracket the range; the middle is tuned for contrast
// between adjacent seats (no red/pink/orange sitting next to each other in the
// default fill order).
const TOKEN_COLORS = [
    { id: 'red',     hex: '#EF4444', name: 'Red'     },
    { id: 'blue',    hex: '#3B82F6', name: 'Blue'    },
    { id: 'green',   hex: '#10B981', name: 'Green'   },
    { id: 'yellow',  hex: '#FACC15', name: 'Yellow'  },
    { id: 'purple',  hex: '#A855F7', name: 'Purple'  },
    { id: 'pink',    hex: '#EC4899', name: 'Pink'    },
    { id: 'orange',  hex: '#F97316', name: 'Orange'  },
    { id: 'cyan',    hex: '#06B6D4', name: 'Cyan'    },
    { id: 'lime',    hex: '#84CC16', name: 'Lime'    },
    { id: 'teal',    hex: '#14B8A6', name: 'Teal'    },
    { id: 'indigo',  hex: '#6366F1', name: 'Indigo'  },
    { id: 'rose',    hex: '#F43F5E', name: 'Rose'    },
    { id: 'amber',   hex: '#F59E0B', name: 'Amber'   },
    { id: 'emerald', hex: '#22C55E', name: 'Emerald' },
    { id: 'sky',     hex: '#0EA5E9', name: 'Sky'     },
    { id: 'slate',   hex: '#94A3B8', name: 'Slate'   },
    { id: 'brown',   hex: '#A16207', name: 'Brown'   },
    { id: 'white',   hex: '#FFFFFF', name: 'White'   },
    { id: 'black',   hex: '#111827', name: 'Black'   },
];

// Default house rules. Each flag is independently toggleable in the lobby
// before the game starts. Some are locked once `started` is true.
function defaultRules() {
    return {
        startingCash:        1500,
        salary:              200,    // $ collected on passing GO
        doubleOnGo:          false,  // 2× salary for landing exactly on GO
        freeParkingPot:      false,  // taxes + fees accumulate, collected on landing
        auctionUnbought:     true,   // decline to buy → property goes to auction
        noRentInJail:        true,   // jailed owners collect no rent
        evenBuild:           true,   // must build evenly within a color group
        mortgageRebuyRate:   1.1,    // 10% interest to unmortgage
        maxHouses:           32,     // bank-wide house supply (classic)
        maxHotels:           12,
        jailFine:            50,
        jailTurnsMax:        3,      // roll-for-doubles attempts before mandatory fine
        xDoubles:            3,      // 3 doubles in a row = straight to jail
        startingBuildings:   { houses: 32, hotels: 12 },
        turnClockSeconds:    0,      // 0 = no clock; otherwise auto-pass when expired
        allowDevOnMortgaged: false,
        randomTurnOrder:     true,
    };
}

// Everything the engine + client needs to know about a player. Keep serializable
// for mongo. `socketId` + `connected` are live transport state, not game state.
function createPlayerState({ userId, username, color, seat, isHost = false, startingCash = 1500 }) {
    return {
        userId,
        username,
        color,                       // hex string from TOKEN_COLORS
        seat,                        // turn order index (0..n-1)
        socketId: null,
        connected: true,
        isHost,
        isBot: false,

        position: 0,
        cash: startingCash,
        inJail: false,
        jailTurns: 0,                // how many failed escape attempts so far
        getOutOfJailCards: 0,        // total — engine tracks source via separate ledger
        bankrupt: false,

        // Property ownership is stored both here (set of pos ids) and in the
        // authoritative tile.owner / tile.houses on the board. We keep this
        // denormalized set for fast "does player own X" checks and the UI
        // player panel.
        owned: [],                   // list of tile pos ids

        doublesThisTurn: 0,
        hasRolled: false,
        hasMoved: false,

        // Bookkeeping for the action log + stats screen at game end.
        stats: {
            turnsPlayed: 0,
            moneyEarned: 0,
            moneySpent: 0,
            rentCollected: 0,
            rentPaid: 0,
            propertiesBought: 0,
            housesBuilt: 0,
            auctionWins: 0,
        },
    };
}

// Authoritative per-tile mutable state. Non-property tiles just carry type +
// a position reference back into the board definition.
function createTileState(tileDef) {
    const base = { pos: tileDef.pos, type: tileDef.type };
    if (tileDef.type === 'property') {
        return { ...base, owner: null, houses: 0, mortgaged: false };
    }
    if (tileDef.type === 'station' || tileDef.type === 'utility') {
        return { ...base, owner: null, mortgaged: false };
    }
    return base;
}

function createRoom({ hostUserId, hostUsername, hostColor, boardId = 'world-tour', customBoard = null }) {
    const board = customBoard || BUILTIN_BOARDS[boardId];
    if (!board) throw new Error(`Unknown board: ${boardId}`);

    const roomCode = generateRoomCode();
    const rules = defaultRules();
    const host = createPlayerState({
        userId: hostUserId,
        username: hostUsername,
        color: hostColor,
        seat: 0,
        isHost: true,
        startingCash: rules.startingCash,
    });

    const room = {
        roomCode,
        hostUserId,
        board: {
            id: board.id,
            name: board.name,
            tiles: board.tiles,          // static definitions
            groupColors: board.groupColors,
            groupSizes: board.groupSizes,
        },
        // Runtime tile state, indexed by pos. Parallel array to board.tiles.
        tileState: board.tiles.map(createTileState),

        players: [host],
        spectators: [],                  // { userId, username, socketId }
        turnIndex: 0,
        turnPhase: 'waiting',            // waiting | rolling | moving | resolving | buying | auctioning | trading | ended
        turnStartedAt: null,
        lastDice: null,                  // [d1, d2]
        lastDiceRoller: null,

        chanceDeck: newChanceDeck(),
        chestDeck: newChestDeck(),
        jailFreeLedger: {},              // userId -> { chance: n, chest: n }

        auction: null,                   // active auction { propertyPos, bids, currentBid, endsAt }
        trades: [],                      // active trade proposals { id, from, to, offer, request, status }
        parkingPot: 0,

        rules,
        bank: {
            houses: rules.startingBuildings.houses,
            hotels: rules.startingBuildings.hotels,
        },

        chat: [],                        // { id, userId, username, text, ts, system? }
        actionLog: [],                   // structured events for the log panel
        started: false,
        ended: false,
        winnerUserId: null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        // A monotonic version number so clients can detect missed deltas and
        // request a full resync. Incremented on every broadcast.
        version: 0,
    };

    activeRooms.set(roomCode, room);
    return room;
}

function getRoom(code) { return activeRooms.get(code); }
function deleteRoom(code) { activeRooms.delete(code); }

// A player is in the room either as a player or a spectator. Returns the
// player object or null.
function getPlayer(room, userId) {
    return room.players.find(p => p.userId === userId) || null;
}
function getSpectator(room, userId) {
    return room.spectators.find(s => s.userId === userId) || null;
}
function getOccupant(room, userId) {
    return getPlayer(room, userId) || getSpectator(room, userId);
}

// Strip server-only fields before broadcasting. We don't currently have
// hidden-info fields (Monopoly is perfect-information), but we keep this
// hook so adding e.g. secret bids in blind auctions later doesn't need a
// schema refactor.
function publicView(room) {
    return {
        roomCode: room.roomCode,
        hostUserId: room.hostUserId,
        board: room.board,
        tileState: room.tileState,
        players: room.players.map(p => ({ ...p, socketId: undefined })),
        spectators: room.spectators.map(s => ({ userId: s.userId, username: s.username })),
        turnIndex: room.turnIndex,
        turnPhase: room.turnPhase,
        turnStartedAt: room.turnStartedAt,
        lastDice: room.lastDice,
        lastDiceRoller: room.lastDiceRoller,
        // Deck counts only — the actual next card stays private until drawn.
        chanceDeck: { draw: room.chanceDeck.draw.length, discard: room.chanceDeck.discard.length },
        chestDeck:  { draw: room.chestDeck.draw.length,  discard: room.chestDeck.discard.length },
        jailFreeLedger: room.jailFreeLedger,
        auction: room.auction,
        trades: room.trades,
        parkingPot: room.parkingPot,
        rules: room.rules,
        bank: room.bank,
        chat: room.chat,
        actionLog: room.actionLog.slice(-200), // cap on the wire
        started: room.started,
        ended: room.ended,
        winnerUserId: room.winnerUserId,
        version: room.version,
    };
}

function bumpVersion(room) {
    room.version += 1;
    room.lastActivity = Date.now();
    return room.version;
}

function appendLog(room, entry) {
    const full = { id: uuidv4(), ts: Date.now(), ...entry };
    room.actionLog.push(full);
    if (room.actionLog.length > 1000) room.actionLog.splice(0, room.actionLog.length - 1000);
    return full;
}

function appendChat(room, { userId, username, text, system = false }) {
    const msg = {
        id: uuidv4(),
        userId: system ? null : userId,
        username: system ? 'System' : username,
        text: String(text).slice(0, 500),
        ts: Date.now(),
        system,
    };
    room.chat.push(msg);
    if (room.chat.length > 500) room.chat.splice(0, room.chat.length - 500);
    return msg;
}

module.exports = {
    TOKEN_COLORS,
    activeRooms,
    defaultRules,
    createRoom,
    createPlayerState,
    getRoom,
    deleteRoom,
    getPlayer,
    getSpectator,
    getOccupant,
    publicView,
    bumpVersion,
    appendLog,
    appendChat,
    generateRoomCode,
};
