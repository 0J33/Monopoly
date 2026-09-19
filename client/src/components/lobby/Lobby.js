import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Puck from '../common/Puck';
import BoardList from '../common/BoardList';
import { Copy, LogOut, Play, X, Check, Minus, Plus, WifiOff } from 'lucide-react';
import './lobby.css';

// The table before the deal: who's sitting down, your place card, the board
// and the house rules the host has written in.
export default function Lobby({ userId, pushToast, roomState }) {
    const nav = useNavigate();
    const [tokens, setTokens] = useState([]);
    const [boards, setBoards] = useState([]);
    const { roomCode, room, connected, act } = roomState;

    useEffect(() => { api.tokens().then(setTokens).catch(() => {}); }, []);
    useEffect(() => { api.listBoards().then(b => setBoards(b.builtin || [])).catch(() => {}); }, []);

    if (!room) {
        return (
            <div className="felt" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                <div className="print" style={{ color: 'rgba(246,236,210,0.7)', fontSize: 22 }}>
                    {connected ? 'Pulling up a chair…' : 'Connecting…'}
                </div>
            </div>
        );
    }

    const me = room.players.find(p => p.userId === userId);
    const isHost = !!me?.isHost;
    const host = room.players.find(p => p.isHost);
    const takenColors = room.players.filter(p => p.userId !== userId).map(p => p.color);
    const boardRows = boards.some(b => b.id === room.board.id)
        ? boards
        : [{ id: room.board.id, name: room.board.name, description: 'Custom board' }, ...boards];
    const empty = Math.max(0, Math.min(8, Math.max(4, room.players.length + 1)) - room.players.length);

    function copyLink() {
        const url = `${window.location.origin}/r/${roomCode}`;
        navigator.clipboard.writeText(url).then(() => pushToast('Invite link copied', 'success'));
    }

    return (
        <div className="felt" style={{ flex: 1, overflowY: 'auto' }}>
            <div className="lobby-wrap">
                <header className="lobby-head">
                    <button className="btn sm ghost lobby-leave" onClick={() => nav('/')}>
                        <LogOut size={14} /> Leave
                    </button>
                    <div className="paper ticket">
                        <span className="print-sm" style={{ color: 'var(--ink-3)' }}>Room</span>
                        <span className="mono ticket-code">{roomCode}</span>
                        <button className="btn sm paper-ghost" onClick={copyLink}><Copy size={13} /> Copy invite link</button>
                    </div>
                </header>

                <div className="lobby-title">
                    <h1 className="print">{room.board.name}</h1>
                    <p>{isHost
                        ? 'You’re the host. Set the house rules, then deal when everyone’s seated.'
                        : `Waiting for ${host?.username || 'the host'} to deal. Pick your token while you wait.`}</p>
                </div>

                <div className="lobby-grid">
                    <div className="lobby-col">
                        {me && (
                            <section className="paper framed my-place dealt" aria-label="Your place card">
                                <Puck color={me.color} label={(me.username[0] || '?').toUpperCase()} size={52} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <label className="print-sm" htmlFor="lobby-name" style={{ color: 'var(--ink-3)' }}>Your name</label>
                                    <input
                                        id="lobby-name"
                                        key={me.username}
                                        className="field"
                                        defaultValue={me.username}
                                        maxLength={24}
                                        onBlur={(e) => {
                                            const v = e.target.value.trim();
                                            if (v && v !== me.username) { act('set-username', { username: v }); localStorage.setItem('monopoly.username', v); }
                                            else e.target.value = me.username;
                                        }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    />
                                    <div className="puck-row" style={{ marginTop: 12 }} role="radiogroup" aria-label="Token colour">
                                        {tokens.map(t => (
                                            <Puck key={t.id} color={t.hex} size={30} title={takenColors.includes(t.hex) ? `${t.name} (taken)` : t.name}
                                                selected={me.color === t.hex} disabled={takenColors.includes(t.hex)}
                                                onClick={() => { act('set-color', { color: t.hex }); localStorage.setItem('monopoly.color', t.hex); }} />
                                        ))}
                                    </div>
                                </div>
                            </section>
                        )}

                        <section aria-label="Players">
                            <div className="felt-label">At the table · {room.players.length} of 8</div>
                            <div className="seats">
                                {room.players.map(p => (
                                    <div key={p.userId} className={`paper seat${p.connected ? '' : ' away'}`}>
                                        <Puck color={p.color} label={(p.username[0] || '?').toUpperCase()} size={34} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="seat-name" title={p.username}>{p.username}</div>
                                            <div className="seat-tags">
                                                {p.isHost && <span>Host</span>}
                                                {p.userId === userId && <span>You</span>}
                                                {!p.connected && <span className="away-tag"><WifiOff size={11} /> Away</span>}
                                            </div>
                                        </div>
                                        {isHost && !p.isHost && p.userId !== userId && (
                                            <button className="btn sm paper-ghost" onClick={() => act('kick', { userId: p.userId })} title={`Remove ${p.username}`} aria-label={`Remove ${p.username}`}>
                                                <X size={13} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {Array.from({ length: empty }).map((_, i) => (
                                    <div key={`e${i}`} className="seat empty-seat">Empty seat</div>
                                ))}
                            </div>
                        </section>

                        <div className="start-zone">
                            {isHost ? (
                                <>
                                    <button className="btn primary lg start-btn" disabled={room.players.length < 2} onClick={() => act('start-game')}>
                                        <Play size={18} /> Deal &amp; start
                                    </button>
                                    {room.players.length < 2 && <div className="start-hint">Send the invite link — you need at least 2 players.</div>}
                                </>
                            ) : (
                                <div className="start-hint">{host?.username || 'The host'} starts the game.</div>
                            )}
                        </div>
                    </div>

                    <div className="lobby-col">
                        <section className="deck dealt d2" aria-label="Board">
                            <div className="deck-under" />
                            <div className="paper">
                                <div className="band chance"><h2 className="print card-h">The board</h2></div>
                                <div style={{ padding: '10px 16px 14px' }}>
                                    <BoardList boards={boardRows} value={room.board.id} disabled={!isHost}
                                        onChange={(id) => act('set-board', { boardId: id })} />
                                </div>
                            </div>
                        </section>

                        <section className="deck dealt d3" aria-label="House rules">
                            <div className="deck-under" />
                            <div className="paper">
                                <div className="band chest"><h2 className="print card-h">House rules</h2></div>
                                <RulesCard room={room} isHost={isHost} act={act} />
                            </div>
                        </section>

                    </div>
                </div>
            </div>
        </div>
    );
}

function RulesCard({ room, isHost, act }) {
    const r = room.rules;
    const set = (k, v) => isHost && act('update-rules', { rules: { [k]: v } });
    return (
        <div className="ruled rules">
            <NumRow label="Starting cash"   value={r.startingCash} step={100} min={0}  disabled={!isHost} onChange={v => set('startingCash', v)} />
            <NumRow label="Salary for passing GO" value={r.salary} step={50} min={0} disabled={!isHost} onChange={v => set('salary', v)} />
            <NumRow label="Jail fine"       value={r.jailFine}    step={10}  min={0}  disabled={!isHost} onChange={v => set('jailFine', v)} />
            <ToggleRow label="Auction a property nobody buys" value={r.auctionUnbought} disabled={!isHost} onChange={v => set('auctionUnbought', v)} />
            <ToggleRow label="Taxes and fines go to a Free Parking pot" value={r.freeParkingPot} disabled={!isHost} onChange={v => set('freeParkingPot', v)} />
            <ToggleRow label="Double salary for landing on GO" value={r.doubleOnGo} disabled={!isHost} onChange={v => set('doubleOnGo', v)} />
            <ToggleRow label="No rent while the owner is in jail" value={r.noRentInJail} disabled={!isHost} onChange={v => set('noRentInJail', v)} />
            <ToggleRow label="Build evenly across a colour set" value={r.evenBuild} disabled={!isHost} onChange={v => set('evenBuild', v)} />
            <ToggleRow label="Random turn order" value={r.randomTurnOrder} disabled={!isHost} onChange={v => set('randomTurnOrder', v)} />
        </div>
    );
}

function ToggleRow({ label, value, onChange, disabled }) {
    return (
        <button type="button" className="rule-row" role="switch" aria-checked={!!value}
            onClick={() => !disabled && onChange(!value)} disabled={disabled}>
            <span className={`board-check${value ? ' on' : ''}`} style={value ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}>
                {value && <Check size={14} strokeWidth={3} />}
            </span>
            <span style={{ flex: 1 }}>{label}</span>
        </button>
    );
}

function NumRow({ label, value, step = 1, min = 0, disabled, onChange }) {
    return (
        <div className="rule-row">
            <span style={{ flex: 1 }}>{label}</span>
            {!disabled && <button type="button" className="btn sm paper-ghost stepper" onClick={() => onChange(Math.max(min, value - step))} aria-label={`Less ${label}`}><Minus size={13} /></button>}
            <span className="mono rule-value">${value.toLocaleString()}</span>
            {!disabled && <button type="button" className="btn sm paper-ghost stepper" onClick={() => onChange(value + step)} aria-label={`More ${label}`}><Plus size={13} /></button>}
        </div>
    );
}
