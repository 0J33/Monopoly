// Thin fetch wrapper for the monopoly REST routes. Socket traffic is handled
// separately in socket.js. In dev, CRA proxies /api → localhost:5004.

const API_BASE = process.env.REACT_APP_API_URL || '';

async function req(path, opts = {}) {
    const res = await fetch(API_BASE + path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts,
    });
    if (!res.ok) {
        let msg = res.statusText;
        try { const j = await res.json(); msg = j.error || msg; } catch {}
        throw new Error(msg);
    }
    return res.json();
}

export const api = {
    me:           ()                                 => req('/api/me'),
    tokens:       ()                                 => req('/api/tokens'),
    listBoards:   ()                                 => req('/api/boards'),
    getBoard:     (id)                               => req('/api/boards/' + encodeURIComponent(id)),
    saveBoard:    (board)                            => req('/api/boards', { method: 'POST', body: JSON.stringify(board) }),
    createRoom:   (body)                             => req('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
    getRoom:      (code)                             => req('/api/rooms/' + encodeURIComponent(code)),
    listRooms:    ()                                 => req('/api/rooms'),
};

export const API_URL = API_BASE;
