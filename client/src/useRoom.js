// Room-state subscription hook. Owns the socket connection lifecycle for
// whichever component mounts it (Lobby first, then Game when lobby hands off).
// Keeps the latest room view and an append-only `events` log that UI layers
// (animations, sound) drain from.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { connectSocket, onState, onChat, emit, disconnectSocket } from './socket';
import { playEvents } from './sound';

export default function useRoom({ userId }) {
    const { code } = useParams();
    const [room, setRoom] = useState(null);
    const [events, setEvents] = useState([]);
    const [chat, setChat] = useState([]);
    const [connected, setConnected] = useState(false);
    const seenVersion = useRef(-1);

    useEffect(() => {
        const username = localStorage.getItem('monopoly.username') || 'Player';
        const color = localStorage.getItem('monopoly.color') || '#EF4444';
        const s = connectSocket({ userId, roomCode: code, username, color });
        s.on('connect', () => setConnected(true));
        s.on('disconnect', () => setConnected(false));

        const offState = onState(({ room: r, events: evs }) => {
            setRoom(r);
            setChat(r.chat || []);
            if (evs?.length && r.version > seenVersion.current) {
                seenVersion.current = r.version;
                setEvents(prev => prev.concat(evs.map((e, i) => ({ ...e, _k: `${r.version}_${i}` }))));
                playEvents(evs);
            }
        });
        const offChat = onChat((msg) => setChat(c => c.concat(msg)));

        return () => {
            offState();
            offChat();
            disconnectSocket();
        };
    }, [code, userId]);

    const act = useCallback((type, payload) => emit(type, payload), []);
    const sendChat = useCallback((text) => emit('chat', { text }), []);

    return { roomCode: code, room, events, chat, connected, act, sendChat };
}
