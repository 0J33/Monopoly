import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Dice5, Users, Sparkles, PencilRuler } from 'lucide-react';
import TokenPicker from './TokenPicker';
import DieFace from '../common/DieFace';
import useIsMobile from '../../useIsMobile';

export default function Home({ pushToast }) {
    const nav = useNavigate();
    const isMobile = useIsMobile();
    const [username, setUsername] = useState(() => localStorage.getItem('monopoly.username') || '');
    const [color, setColor] = useState(() => localStorage.getItem('monopoly.color') || '#EF4444');
    const [tokens, setTokens] = useState([]);
    const [boards, setBoards] = useState({ builtin: [], community: [] });
    const [boardId, setBoardId] = useState('world-tour');
    const [joinCode, setJoinCode] = useState('');
    const [openRooms, setOpenRooms] = useState([]);

    useEffect(() => { api.tokens().then(setTokens).catch(() => {}); }, []);
    useEffect(() => { api.listBoards().then(setBoards).catch(() => {}); }, []);
    useEffect(() => {
        const t = setInterval(() => api.listRooms().then(setOpenRooms).catch(() => {}), 5000);
        api.listRooms().then(setOpenRooms).catch(() => {});
        return () => clearInterval(t);
    }, []);

    function persist() {
        localStorage.setItem('monopoly.username', username);
        localStorage.setItem('monopoly.color', color);
    }

    async function create() {
        if (!username.trim()) return pushToast('Pick a name first', 'error');
        persist();
        try {
            const { roomCode } = await api.createRoom({ username: username.trim(), color, boardId });
            nav(`/r/${roomCode}`);
        } catch (e) { pushToast(e.message || 'Failed to create'); }
    }
    async function join(code) {
        const trimmed = (code || joinCode).trim().toUpperCase();
        if (!trimmed) return pushToast('Enter a code');
        if (!username.trim()) return pushToast('Pick a name first');
        persist();
        try { await api.getRoom(trimmed); } catch { return pushToast('Room not found'); }
        nav(`/r/${trimmed}`);
    }

    return (
        <div className="grid-bg" style={{ flex: 1, overflowY: 'auto', minHeight: '100%' }}>
            <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '24px 14px' : '48px 24px' }}>
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 24 : 48 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <DieFace value={5} size={44} />
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>Monopoly</div>
                            <div style={{ color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>ojee.net</div>
                        </div>
                    </div>
                    <button className="btn ghost sm" onClick={() => nav('/editor')}>
                        <PencilRuler size={14} /> Map editor
                    </button>
                </header>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 1fr) minmax(280px, 420px)',
                    gap: isMobile ? 16 : 32,
                    alignItems: 'start',
                }}>
                    {/* ─── Create / join panel ─────────────────────────────────── */}
                    <div className="card" style={{ padding: isMobile ? 20 : 32 }}>
                        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>
                            Roll the dice.
                        </div>
                        <div style={{ color: 'var(--text-3)', marginBottom: 28 }}>
                            No accounts. Pick a name, pick a color, start a game.
                        </div>

                        <label style={labelStyle}>Your name</label>
                        <input
                            style={{ ...inputStyle, marginBottom: 16 }}
                            placeholder="e.g. Ojee"
                            value={username}
                            onChange={e => setUsername(e.target.value.slice(0, 24))}
                            onBlur={persist}
                        />

                        <label style={labelStyle}>Color</label>
                        <TokenPicker tokens={tokens} value={color} onChange={setColor} />

                        <label style={{ ...labelStyle, marginTop: 16 }}>Board</label>
                        <select style={{ ...inputStyle, width: '100%' }} value={boardId} onChange={e => setBoardId(e.target.value)}>
                            <optgroup label="Built-in">
                                {boards.builtin.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </optgroup>
                            {boards.community?.length > 0 && (
                                <optgroup label="Community">
                                    {boards.community.map(b => <option key={b.id} value={b.id}>{b.name} — {b.authorUsername}</option>)}
                                </optgroup>
                            )}
                        </select>

                        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                            <button className="btn primary lg" onClick={create} style={{ flex: 1 }}>
                                <Dice5 size={18} /> Create room
                            </button>
                        </div>

                        <div style={{ height: 1, background: 'var(--border)', margin: '28px 0' }} />

                        <label style={labelStyle}>Join with a code</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                style={{ ...inputStyle, flex: 1, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: 2 }}
                                placeholder="XYZABC"
                                maxLength={6}
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && join()}
                            />
                            <button className="btn" onClick={() => join()}>Join</button>
                        </div>
                    </div>

                    {/* ─── Open rooms + hints ──────────────────────────────────── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                <Users size={14} color="var(--text-3)" />
                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Open rooms</div>
                            </div>
                            {openRooms.length === 0 && (
                                <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Nothing public right now. Create one.</div>
                            )}
                            {openRooms.map(r => (
                                <button key={r.roomCode} className="btn" style={{
                                    width: '100%', justifyContent: 'space-between',
                                    marginBottom: 6, padding: '10px 12px',
                                }} onClick={() => join(r.roomCode)}>
                                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.roomCode}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
                                            {r.host} · {r.boardName}
                                        </span>
                                    </span>
                                    <span className="chip">{r.players}/8</span>
                                </button>
                            ))}
                        </div>

                        <div className="card" style={{ padding: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <Sparkles size={14} color="var(--accent)" />
                                <div style={{ fontWeight: 600, fontSize: 13 }}>What's inside</div>
                            </div>
                            <ul style={{ margin: 0, padding: '0 0 0 18px', color: 'var(--text-2)', fontSize: 13, lineHeight: 1.7 }}>
                                <li>Auctions, trades &amp; negotiations</li>
                                <li>Mortgage, houses, hotels</li>
                                <li>Custom boards &amp; rules</li>
                                <li>Chat, live cursors, sound</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const labelStyle = {
    display: 'block',
    fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
    textTransform: 'uppercase', color: 'var(--text-3)',
    marginBottom: 6,
};
const inputStyle = { width: '100%', fontSize: 14 };
