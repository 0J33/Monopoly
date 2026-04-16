// MongoDB snapshot of a game room. In-memory state is authoritative during
// a live session; the model exists for (a) reload-after-crash, (b) history,
// (c) letting people rejoin a room after a server restart within the TTL.

const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, unique: true, index: true },
    hostUserId: { type: String, required: true },
    state: { type: mongoose.Schema.Types.Mixed, required: true },  // whole room object minus transient socket ids
    createdAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now },
});

// Auto-expire rooms that haven't seen activity in 12 hours.
gameRoomSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 3600 * 12 });

module.exports = mongoose.model('MonopolyRoom', gameRoomSchema);
