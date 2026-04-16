// Persistent user-authored boards. Validated against the same schema the
// built-in board uses (boards.validateBoard) before being accepted into a
// room.

const mongoose = require('mongoose');

const tileSchema = new mongoose.Schema({
    pos: Number,
    type: String,
    name: String,
    group: String,
    color: String,
    price: Number,
    rent: [Number],
    houseCost: Number,
    mortgage: Number,
    amount: Number,
}, { _id: false });

const customBoardSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    authorUserId: { type: String, required: true, index: true },
    authorUsername: String,
    tiles: { type: [tileSchema], required: true },
    groupColors: { type: Map, of: String },
    description: String,
    isPublic: { type: Boolean, default: true },
    timesPlayed: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('CustomBoard', customBoardSchema);
