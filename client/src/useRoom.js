// Room-state subscription hook. Owns the socket connection lifecycle for
// whichever component mounts it (Lobby first, then Game when lobby hands off).
// Keeps the latest room view and an append-only `events` log that UI layers
// (animations, sound) drain from.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { connectSocket, onState, onChat, onChatHistory, onKicked, emit, disconnectSocket } from './socket';
import { playEvents } from './sound';

export default function useRoom({ userId, pushToast }) {
    const { code } = useParams();
    const nav = useNavigate();
    const [room, setRoom] = useState(null);
    const [events, setEvents] = useState([]);
    const [chat, setChat] = useState([]);
    const [connected, setConnected] = useState(false);
    const seenVersion = useRef(-1);

    useEffect(() => {
        // Only what this browser actually has: an empty name must not rename
        // a player who is already seated (the server names newcomers).
        const username = localStorage.getItem('monopoly.username') || undefined;
        const color = localStorage.getItem('monopoly.color') || undefined;
        const s = connectSocket({ roomCode: code, username, color });
        const onConnect = () => setConnected(true);
        const onDisconnect = () => setConnected(false);
        s.on('connect', onConnect);
        s.on('disconnect', onDisconnect);
        if (s.connected) setConnected(true);

        const offState = onState(({ room: r, events: evs }) => {
            // Ignore anything older than what's on screen (a slow packet
            // arriving after a newer one must not rewind the board).
            if (r.version < seenVersion.current) return;
            setRoom(r);
            if (r.version > seenVersion.current) {
                seenVersion.current = r.version;
                if (evs?.length) {
                    setEvents(prev => prev.concat(evs.map((e, i) => ({ ...e, _k: `${r.version}_${i}` }))).slice(-400));
                    playEvents(evs);
                }
            }
        });
        // History arrives once per (re)connect and replaces what we had, so a
        // reconnect never duplicates or reorders messages.
        const offHistory = onChatHistory((list) => setChat(Array.isArray(list) ? list : []));
        const offChat = onChat((msg) => setChat(c => (c.some(m => m.id === msg.id) ? c : c.concat(msg))));
        const offKicked = onKicked(() => {
            pushToast?.('The host removed you from the room');
            nav('/');
        });

        return () => {
            s.off('connect', onConnect);
            s.off('disconnect', onDisconnect);
            offState();
            offHistory();
            offChat();
            offKicked();
            disconnectSocket();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, userId]);

    const act = useCallback((type, payload) => emit(type, payload), []);
    const sendChat = useCallback((text) => emit('chat', { text }), []);

    return { roomCode: code, room, events, chat, connected, act, sendChat };
}
