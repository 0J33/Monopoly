import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { PencilRuler, ArrowRight, Users, HelpCircle, Package, ChevronDown } from 'lucide-react';
import useIsMobile from '../../useIsMobile';
import Logo from '../common/Logo';
import Puck from '../common/Puck';
import BoardList from '../common/BoardList';
import './home.css';

// The table before a game: two decks — start a game, join a game — and your
// place card with the name and token you'll play as.
export default function Home({ pushToast }) {
    const nav = useNavigate();
    const nameRef = useRef(null);
    const [username, setUsername] = useState(() => localStorage.getItem('monopoly.username') || '');
    const [color, setColor] = useState(() => localStorage.getItem('monopoly.color') || '#EF4444');
    const [tokens, setTokens] = useState([]);
    const [boards, setBoards] = useState({ builtin: [], community: [] });
    const [boardId, setBoardId] = useState(() => localStorage.getItem('monopoly.board') || 'world-tour');
    const [joinCode, setJoinCode] = useState('');
    const [openRooms, setOpenRooms] = useState(null);
    const [busy, setBusy] = useState(false);
    const isMobile = useIsMobile();
    const [showBoards, setShowBoards] = useState(false);

    useEffect(() => { api.tokens().then(setTokens).catch(() => {}); }, []);
    useEffect(() => { api.listBoards().then(setBoards).catch(() => {}); }, []);
    useEffect(() => {
        const load = () => api.listRooms().then(setOpenRooms).catch(() => setOpenRooms([]));
        load();
        const t = setInterval(load, 5000);
        return () => clearInterval(t);
    }, []);

    const allBoards = [...boards.builtin, ...(boards.community || []).map(b => ({ ...b, community: true }))];
    const chosen = allBoards.find(b => b.id === boardId);
    const initial = (username.trim()[0] || '?').toUpperCase();

    function persist() {
        localStorage.setItem('monopoly.username', username.trim());
        localStorage.setItem('monopoly.color', color);
        localStorage.setItem('monopoly.board', boardId);
    }
    function needName() {
        if (username.trim()) return false;
        pushToast('Put your name on your place card first');
        nameRef.current?.focus();
        return true;
    }

    async function create() {
        if (needName() || busy) return;
        persist();
        setBusy(true);
        try {
            const body = chosen?.community
                ? { username: username.trim(), color, customBoardId: boardId }
                : { username: username.trim(), color, boardId: chosen ? boardId : 'world-tour' };
            const { roomCode } = await api.createRoom(body);
            nav(`/r/${roomCode}`);
        } catch (e) {
            pushToast(e.message === 'bad-username' ? 'That name has no usable characters' : (e.message || "Couldn't create the room"));
        } finally { setBusy(false); }
    }
    async function join(code) {
        const trimmed = (code || joinCode).trim().toUpperCase();
        if (needName()) return;
        if (trimmed.length !== 6) return pushToast('Room codes are 6 letters and numbers');
        persist();
        try { await api.getRoom(trimmed); } catch { return pushToast(`No room called ${trimmed}`); }
        nav(`/r/${trimmed}`);
    }

    return (
        <div className="felt home" style={{ flex: 1, overflowY: 'auto' }}>
            <div className="home-wrap">
                <header className="home-head">
                    <div className="wordmark">
                        <Logo size={40} />
                        <div>
                            <div className="print wordmark-text">Monopoly</div>
                            <div className="wordmark-sub">Full rules, no accounts · ojee.net</div>
                        </div>
                    </div>
                    <button className="btn sm ghost home-editor" onClick={() => nav('/editor')}>
                        <PencilRuler size={14} /> <span>Map editor</span>
                    </button>
                </header>

                {/* Place card: who you'll be at the table. */}
                <section className="paper framed place-card dealt" aria-label="Your place card">
                    <Puck color={color} label={initial} size={48} />
                    <div className="place-body">
                        <div>
                            <label className="print-sm" htmlFor="home-name" style={{ color: 'var(--ink-3)' }}>Your name</label>
                            <input
                                id="home-name"
                                ref={nameRef}
                                className="field"
                                placeholder="Who's playing?"
                                autoComplete="nickname"
                                value={username}
                                maxLength={24}
                                onChange={e => setUsername(e.target.value.slice(0, 24))}
                                onBlur={persist}
                                onKeyDown={e => { if (e.key === 'Enter') create(); }}
                            />
                        </div>
                        <div>
                            <div className="print-sm" style={{ color: 'var(--ink-3)' }}>Your token</div>
                            <div className="puck-row" role="radiogroup" aria-label="Token colour">
                                {tokens.map(t => (
                                    <Puck key={t.id} color={t.hex} size={30} title={t.name}
                                        selected={color === t.hex} onClick={() => setColor(t.hex)} />
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <div className="decks">
                    {/* Chance deck: start a game. */}
                    <section className="deck dealt d2" aria-labelledby="start-title">
                        <div className="deck-under" /><div className="deck-under" />
                        <div className="paper framed deck-card">
                            <div className="band chance">
                                <HelpCircle size={30} strokeWidth={2.4} aria-hidden />
                                <h2 id="start-title" className="print deck-title">Start a game</h2>
                            </div>
                            <div className="deck-inner">
                                <div className="print-sm deck-label">Pick a board</div>
                                <BoardList
                                    boards={isMobile && !showBoards ? allBoards.filter(b => b.id === (chosen ? boardId : 'world-tour')) : allBoards}
                                    value={chosen ? boardId : 'world-tour'}
                                    onChange={(id) => { setBoardId(id); if (isMobile) setShowBoards(false); }} />
                                {isMobile && !showBoards && allBoards.length > 1 && (
                                    <button className="btn sm paper-ghost" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => setShowBoards(true)}>
                                        <ChevronDown size={14} /> Other boards ({allBoards.length - 1})
                                    </button>
                                )}
                                <button className="btn ink lg deck-action" onClick={create} disabled={busy}>
                                    Create room <ArrowRight size={18} />
                                </button>
                                <p className="deck-note">You'll get a link and a code to send everyone. House rules are set in the lobby.</p>
                            </div>
                        </div>
                    </section>

                    {/* Chest deck: join a game. */}
                    <section className="deck dealt d3" aria-labelledby="join-title">
                        <div className="deck-under" /><div className="deck-under" />
                        <div className="paper framed deck-card">
                            <div className="band chest">
                                <Package size={30} strokeWidth={2.2} aria-hidden />
                                <h2 id="join-title" className="print deck-title">Join a game</h2>
                            </div>
                            <div className="deck-inner">
                                <label className="print-sm deck-label" htmlFor="home-code">Room code</label>
                                <div className="join-row">
                                    <input
                                        id="home-code"
                                        className="field code"
                                        placeholder="ABC123"
                                        maxLength={6}
                                        autoCapitalize="characters"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={joinCode}
                                        onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                        onKeyDown={e => e.key === 'Enter' && join()}
                                    />
                                    <button className="btn ink" onClick={() => join()} disabled={joinCode.length !== 6}>Join</button>
                                </div>

                                <div className="print-sm deck-label" style={{ marginTop: 22 }}>
                                    <Users size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />Open tables
                                </div>
                                <div className="ruled open-tables">
                                    {openRooms === null && <div className="empty-line">Looking for tables…</div>}
                                    {openRooms?.length === 0 && (
                                        <div className="empty-line">No open tables right now. Start one and send the link round.</div>
                                    )}
                                    {openRooms?.map(r => (
                                        <button key={r.roomCode} className="table-row" onClick={() => join(r.roomCode)}>
                                            <span className="mono table-code">{r.roomCode}</span>
                                            <span className="table-meta">
                                                <b>{r.host || 'Someone'}'s table</b>
                                                <span>{r.boardName} · {r.players} of 8 seated</span>
                                            </span>
                                            <ArrowRight size={16} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
