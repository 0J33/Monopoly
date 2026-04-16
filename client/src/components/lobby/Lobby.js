import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useRoom from '../../useRoom';
import useIsMobile from '../../useIsMobile';
import TokenPicker from '../home/TokenPicker';
import { Copy, LogOut, Play, X, Users, Settings } from 'lucide-react';

export default function Lobby({ userId, pushToast, onStart }) {
    const nav = useNavigate();
    const isMobile = useIsMobile();
    const [tokens, setTokens] = useState([]);
    const { roomCode, room, connected, act } = useRoom({ userId });

    useEffect(() => {
        fetch('/api/tokens').then(r => r.json()).then(setTokens).catch(() => {});
    }, []);

    // Promote to game view once host starts.
    useEffect(() => {
        if (room?.started) onStart();
    }, [room?.started, onStart]);

    if (!room) {
        return (
            <div className="grid-bg" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                <div style={{ color: 'var(--text-3)' }}>
                    {connected ? 'Loading room…' : 'Connecting…'}
                </div>
            </div>
        );
    }

    const me = room.players.find(p => p.userId === userId);
    const isHost = me?.isHost;
    const takenColors = room.players.map(p => p.color);

    function copyLink() {
        const url = `${window.location.origin}/r/${roomCode}`;
        navigator.clipboard.writeText(url).then(() => pushToast('Link copied', 'success'));
    }

    return (
        <div className="grid-bg" style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '16px 12px' : '32px 24px' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                    <button className="btn ghost sm" onClick={() => nav('/')}>
                        <LogOut size={14} /> Leave
                    </button>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div className="chip" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                            {roomCode}
                        </div>
                        <button className="btn sm" onClick={copyLink}>
                            <Copy size={13} /> Copy link
                        </button>
                    </div>
                </header>

                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5, marginBottom: 2 }}>
                    Lobby
                </div>
                <div style={{ color: 'var(--text-3)', marginBottom: 28 }}>
                    {isHost ? 'You are the host. Configure rules and start when ready.' : 'Waiting for host to start…'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 340px', gap: isMobile ? 14 : 24 }}>
                    {/* Players */}
                    <div className="card">
                        <SectionHead icon={Users} label="Players" count={`${room.players.length} / 8`} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {room.players.map(p => (
                                <PlayerRow
                                    key={p.userId}
                                    p={p}
                                    isMe={p.userId === userId}
                                    isHost={isHost}
                                    onKick={() => act('kick', { userId: p.userId })}
                                />
                            ))}
                        </div>

                        {me && (
                            <>
                                <div style={{ height: 1, background: 'var(--border)', margin: '18px 0' }} />
                                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>
                                    Your token
                                </div>
                                <TokenPicker
                                    tokens={tokens}
                                    value={me.color}
                                    onChange={(c) => act('set-color', { color: c })}
                                    disabledHexes={takenColors}
                                />
                                <input
                                    style={{ width: '100%', marginTop: 12, fontSize: 14 }}
                                    defaultValue={me.username}
                                    onBlur={(e) => {
                                        const v = e.target.value.trim();
                                        if (v && v !== me.username) act('set-username', { username: v });
                                    }}
                                />
                            </>
                        )}
                    </div>

                    {/* Rules + start */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <RulesCard room={room} isHost={isHost} act={act} />
                        {isHost && (
                            <button
                                className="btn primary lg"
                                disabled={room.players.length < 2}
                                onClick={() => act('start-game')}
                                style={{ width: '100%', justifyContent: 'center' }}
                            >
                                <Play size={16} /> Start game
                            </button>
                        )}
                        {!isHost && (
                            <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                                Waiting for host…
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function SectionHead({ icon: Icon, label, count }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Icon size={14} color="var(--text-3)" />
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>{label}</div>
            {count && <div className="chip" style={{ fontSize: 11 }}>{count}</div>}
        </div>
    );
}

function PlayerRow({ p, isMe, isHost, onKick }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
        }}>
            <span className="dot" style={{ background: p.color, width: 14, height: 14 }} />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.username}
                </div>
                {p.isHost && <span className="chip" style={{ fontSize: 10 }}>Host</span>}
                {isMe && <span className="chip" style={{ fontSize: 10, color: 'var(--accent)', borderColor: 'var(--accent)' }}>You</span>}
                {!p.connected && <span className="chip" style={{ fontSize: 10, color: 'var(--text-4)' }}>Disconnected</span>}
            </div>
            {isHost && !p.isHost && !isMe && (
                <button className="btn sm ghost" onClick={onKick} title="Remove">
                    <X size={13} />
                </button>
            )}
        </div>
    );
}

function RulesCard({ room, isHost, act }) {
    const r = room.rules;
    const set = (k, v) => isHost && act('update-rules', { rules: { [k]: v } });
    return (
        <div className="card">
            <SectionHead icon={Settings} label="Rules" />

            <NumRow label="Starting cash"       value={r.startingCash} step={100} disabled={!isHost} onChange={v => set('startingCash', v)} />
            <NumRow label="GO salary"           value={r.salary}        step={50}  disabled={!isHost} onChange={v => set('salary', v)} />
            <ToggleRow label="Double on GO"                 value={r.doubleOnGo}       disabled={!isHost} onChange={v => set('doubleOnGo', v)} />
            <ToggleRow label="Free parking pot"             value={r.freeParkingPot}   disabled={!isHost} onChange={v => set('freeParkingPot', v)} />
            <ToggleRow label="Auction on declined buy"      value={r.auctionUnbought}  disabled={!isHost} onChange={v => set('auctionUnbought', v)} />
            <ToggleRow label="No rent while owner in jail"  value={r.noRentInJail}     disabled={!isHost} onChange={v => set('noRentInJail', v)} />
            <ToggleRow label="Even building within group"   value={r.evenBuild}        disabled={!isHost} onChange={v => set('evenBuild', v)} />
            <ToggleRow label="Random turn order"            value={r.randomTurnOrder}  disabled={!isHost} onChange={v => set('randomTurnOrder', v)} />
            <NumRow label="Jail fine"           value={r.jailFine}    step={10}  disabled={!isHost} onChange={v => set('jailFine', v)} />
        </div>
    );
}

function ToggleRow({ label, value, onChange, disabled }) {
    return (
        <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0', fontSize: 13, color: 'var(--text-2)',
            opacity: disabled ? 0.7 : 1,
        }}>
            <span>{label}</span>
            <button
                onClick={() => !disabled && onChange(!value)}
                disabled={disabled}
                style={{
                    width: 36, height: 20, borderRadius: 999,
                    background: value ? 'var(--accent)' : 'var(--surface-3)',
                    padding: 2, transition: 'background 0.15s',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                }}
            >
                <span style={{
                    display: 'block', width: 16, height: 16, borderRadius: '50%',
                    background: 'white',
                    transform: value ? 'translateX(16px)' : 'translateX(0)',
                    transition: 'transform 0.15s',
                }} />
            </button>
        </label>
    );
}

function NumRow({ label, value, step = 1, disabled, onChange }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0', fontSize: 13, color: 'var(--text-2)',
            opacity: disabled ? 0.7 : 1,
        }}>
            <span>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button className="btn sm ghost" disabled={disabled} onClick={() => onChange(Math.max(0, value - step))}>−</button>
                <span className="mono" style={{ minWidth: 48, textAlign: 'center', color: 'var(--text)' }}>${value}</span>
                <button className="btn sm ghost" disabled={disabled} onClick={() => onChange(value + step)}>+</button>
            </div>
        </div>
    );
}
