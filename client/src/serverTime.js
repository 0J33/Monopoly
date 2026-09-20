/* ============================================================
   The server's clock, as this browser should read it.

   Several things on screen are a server timestamp compared
   against "now": the auction deadline, and how long a player
   has been disconnected. They were compared against the
   BROWSER's clock, which is a different clock — two people in
   the same game are two machines, and nothing keeps them in
   step. A browser running a few seconds fast showed an auction
   that had already expired: 0s, frozen, for the whole eight
   seconds everyone else was bidding in.

   So every state broadcast carries the server's own `now`, and
   the difference is remembered. It is a single offset, not a
   round-trip estimate — latency makes it a few tens of
   milliseconds out, which does not matter for a countdown in
   whole seconds, and it costs nothing.
   ============================================================ */

let skew = 0;

/** Called with `room.now` on every broadcast. */
export function noteServerTime(now) {
    if (typeof now === 'number' && Number.isFinite(now)) skew = now - Date.now();
}

/** `Date.now()`, corrected onto the server's clock. */
export function serverNow() {
    return Date.now() + skew;
}

/** How far this browser's clock is from the server's, in ms. For diagnostics. */
export function clockSkew() {
    return skew;
}
