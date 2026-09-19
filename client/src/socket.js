// Socket.io client singleton keyed by (roomCode, userId). Reconnects with
// backoff; all inbound events feed a listener map so multiple components
// can subscribe without stepping on each other.

import { io } from 'socket.io-client';

const WS_URL = process.env.REACT_APP_WS_URL || window.location.origin;

let socket = null;
let currentRoom = null;
const listeners = {
    state: new Set(), chat: new Set(), chatHistory: new Set(), error: new Set(), kicked: new Set(),
};

// Identity is the httpOnly cookie, which the browser attaches to the
// handshake itself — `auth` only says which room and how to appear in it.
export function connectSocket({ roomCode, username, color, asSpectator }) {
    if (socket && currentRoom === roomCode) return socket;
    if (socket) { socket.disconnect(); socket = null; }
    currentRoom = roomCode;

    socket = io(WS_URL, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        // If websockets are blocked (some proxies / networks), fall back to
        // long-polling instead of retrying the websocket forever.
        tryAllTransports: true,
        reconnection: true,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        auth: { roomCode, username, color, asSpectator: !!asSpectator },
    });

    socket.on('state',        (p) => listeners.state.forEach(fn => fn(p)));
    socket.on('chat',         (p) => listeners.chat.forEach(fn => fn(p)));
    socket.on('chat-history', (p) => listeners.chatHistory.forEach(fn => fn(p)));
    socket.on('error-msg',    (e) => listeners.error.forEach(fn => fn(e)));
    socket.on('kicked',       ()  => listeners.kicked.forEach(fn => fn()));

    return socket;
}

export function getSocket() { return socket; }
export function disconnectSocket() {
    if (socket) { socket.disconnect(); socket = null; currentRoom = null; }
}

export function onState(fn)       { listeners.state.add(fn);       return () => listeners.state.delete(fn); }
export function onChat(fn)        { listeners.chat.add(fn);        return () => listeners.chat.delete(fn); }
export function onChatHistory(fn) { listeners.chatHistory.add(fn); return () => listeners.chatHistory.delete(fn); }
export function onError(fn)       { listeners.error.add(fn);       return () => listeners.error.delete(fn); }
export function onKicked(fn)      { listeners.kicked.add(fn);      return () => listeners.kicked.delete(fn); }

export function emit(event, payload) {
    if (!socket) return;
    socket.emit(event, payload);
}
