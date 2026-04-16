// HTTP endpoints for room management. The live game traffic runs over
// socket.io; these routes handle the pre-socket flow (list public rooms,
// create a room, look up whether a code is valid) plus board CRUD.

const express = require('express');
const router = express.Router();
const { createRoom, activeRooms, publicView, TOKEN_COLORS } = require('../game/state');
const { BUILTIN_BOARDS, validateBoard } = require('../game/boards');
const CustomBoard = require('../models/CustomBoard');

// List all built-in + user's own boards + public community boards.
router.get('/boards', async (req, res) => {
    const builtin = Object.values(BUILTIN_BOARDS).map(b => ({
        id: b.id, name: b.name, builtin: true,
    }));
    let community = [];
    try {
        community = await CustomBoard.find({ isPublic: true })
            .select('id name authorUsername timesPlayed')
            .sort({ timesPlayed: -1 })
            .limit(50)
            .lean();
    } catch { /* mongo optional in dev */ }
    res.json({ builtin, community });
});

router.get('/boards/:id', async (req, res) => {
    const b = BUILTIN_BOARDS[req.params.id];
    if (b) return res.json(b);
    try {
        const cb = await CustomBoard.findOne({ id: req.params.id }).lean();
        if (!cb) return res.status(404).json({ error: 'not-found' });
        res.json(cb);
    } catch (e) {
        res.status(500).json({ error: 'server' });
    }
});

router.post('/boards', async (req, res) => {
    const { id, name, tiles, groupColors, description, isPublic } = req.body || {};
    if (!id || !name) return res.status(400).json({ error: 'missing-fields' });
    const errs = validateBoard({ tiles });
    if (errs.length) return res.status(400).json({ error: 'invalid-board', details: errs });
    try {
        const doc = await CustomBoard.findOneAndUpdate(
            { id },
            {
                id, name, tiles, groupColors, description, isPublic: !!isPublic,
                authorUserId: req.userId, updatedAt: new Date(),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json(doc);
    } catch (e) {
        res.status(500).json({ error: 'server' });
    }
});

// Create a new room. Body: { username, color, boardId }. Host becomes
// player 0; others join via socket.
router.post('/rooms', async (req, res) => {
    const { username, color, boardId = 'world-tour', customBoardId } = req.body || {};
    if (!username || !color) return res.status(400).json({ error: 'missing-fields' });
    if (!/^[\w .\-]{1,24}$/.test(username)) return res.status(400).json({ error: 'bad-username' });
    if (!TOKEN_COLORS.some(c => c.hex === color || c.id === color)) return res.status(400).json({ error: 'bad-color' });

    let customBoard = null;
    if (customBoardId) {
        try {
            customBoard = await CustomBoard.findOne({ id: customBoardId }).lean();
            if (!customBoard) return res.status(404).json({ error: 'board-not-found' });
        } catch { /* ignore — fall back to default */ }
    }

    const hex = TOKEN_COLORS.find(c => c.hex === color || c.id === color).hex;
    const room = createRoom({
        hostUserId: req.userId,
        hostUsername: username.trim(),
        hostColor: hex,
        boardId,
        customBoard,
    });
    res.json({ roomCode: room.roomCode });
});

router.get('/rooms/:code', (req, res) => {
    const r = activeRooms.get(req.params.code.toUpperCase());
    if (!r) return res.status(404).json({ error: 'not-found' });
    // Lightweight preview — don't leak the whole state.
    res.json({
        roomCode: r.roomCode,
        boardName: r.board.name,
        players: r.players.map(p => ({ username: p.username, color: p.color })),
        started: r.started,
        full: r.players.length >= 8,
    });
});

router.get('/rooms', (req, res) => {
    // Public list: rooms that haven't started and have headroom. Handy for a
    // "quick join" browser view — skip rooms with zero activity in 5 minutes.
    const now = Date.now();
    const list = [];
    for (const r of activeRooms.values()) {
        if (r.started) continue;
        if (r.players.length >= 8) continue;
        if (now - r.lastActivity > 5 * 60 * 1000) continue;
        list.push({
            roomCode: r.roomCode,
            boardName: r.board.name,
            players: r.players.length,
            host: r.players.find(p => p.isHost)?.username || '',
        });
    }
    res.json(list);
});

router.get('/tokens', (_req, res) => res.json(TOKEN_COLORS));

module.exports = router;
