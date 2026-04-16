// No-accounts identity. Every browser gets a durable `monopoly_uid` cookie
// the first time they hit the API. All game-state authority keys off that.
// Display name and color are chosen per-room, not persisted globally.

const { v4: uuidv4 } = require('uuid');

const COOKIE = 'monopoly_uid';
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365; // 1 year

function sessionMiddleware(req, res, next) {
    let uid = req.cookies?.[COOKIE];
    if (!uid || typeof uid !== 'string' || uid.length < 8) {
        uid = uuidv4();
        res.cookie(COOKIE, uid, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: COOKIE_MAX_AGE,
            path: '/',
        });
    }
    req.userId = uid;
    next();
}

module.exports = { sessionMiddleware, COOKIE };
