import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api';
import Home from './components/home/Home';
import Lobby from './components/lobby/Lobby';
import Game from './components/game/Game';
import MapEditor from './components/editor/MapEditor';
import Toasts from './components/common/Toasts';
import { onError } from './socket';
import { installGlobalClickSound, play as playSound } from './sound';

export default function App() {
    const [userId, setUserId] = useState(null);
    const [toasts, setToasts] = useState([]);

    useEffect(() => {
        api.me().then(r => setUserId(r.userId)).catch(() => setUserId(null));
    }, []);

    useEffect(() => {
        installGlobalClickSound();
    }, []);

    useEffect(() => {
        return onError((err) => { pushToast(err); playSound('error'); });
    }, []);

    function pushToast(text, kind = 'error') {
        const id = Math.random().toString(36).slice(2);
        setToasts(t => [...t, { id, text, kind }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
    }

    if (userId === null) {
        return (
            <div className="grid-bg" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                <div style={{ color: 'var(--text-3)' }}>Loading…</div>
            </div>
        );
    }

    return (
        <>
            <Routes>
                <Route path="/" element={<Home userId={userId} pushToast={pushToast} />} />
                <Route path="/r/:code" element={<RoomRouter userId={userId} pushToast={pushToast} />} />
                <Route path="/editor" element={<MapEditor userId={userId} pushToast={pushToast} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toasts toasts={toasts} />
        </>
    );
}

// Switches between Lobby (before game start) and Game (after) based on
// room.started. Both mount the same socket connection.
function RoomRouter({ userId, pushToast }) {
    const [phase, setPhase] = useState('lobby');
    return phase === 'lobby'
        ? <Lobby userId={userId} pushToast={pushToast} onStart={() => setPhase('game')} />
        : <Game  userId={userId} pushToast={pushToast} onBackToLobby={() => setPhase('lobby')} />;
}
