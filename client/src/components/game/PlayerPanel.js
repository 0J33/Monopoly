import React from 'react';
import { Handshake, Lock, WifiOff, AlertTriangle, UserX } from 'lucide-react';
import { canRemove, netWorth } from './playerStatus';

export default function PlayerPanel({ p, me, isMe, isActive, room, onTrade, onRemove, onTileClick }) {
    const jailCards = (room.jailFreeLedger?.[p.userId]?.chance || 0) + (room.jailFreeLedger?.[p.userId]?.chest || 0);
    const owes = room.debts?.find(d => d.userId === p.userId);
    const removable = canRemove(room, p, me);
    const light = ['#FFFFFF', '#FACC15'].includes(p.color?.toUpperCase());
    // Owned tiles in board order, so colour groups sit together.
    const owned = [...(p.owned || [])].sort((a, b) => a - b);

    return (
        <div className="card" style={{
            padding: 12,
            borderColor: isActive ? p.color : 'var(--border)',
            boxShadow: isActive ? `0 0 0 2px ${p.color}55, var(--shadow)` : 'var(--shadow)',
            opacity: p.bankrupt ? 0.45 : 1,
            transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                    flex: '0 0 auto',
                    width: 32, height: 32, borderRadius: 8,
                    background: p.color,
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    display: 'grid', placeItems: 'center',
                    color: light ? '#0b0f17' : 'white', fontSize: 13, fontWeight: 800,
                }}>{(p.username || '?')[0]?.toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
                        <span title={p.username} style={{
                            fontSize: 13, fontWeight: 700, minWidth: 0,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            textDecoration: p.bankrupt ? 'line-through' : 'none',
                        }}>
                            {p.username}
                        </span>
                        {isMe && <span className="chip" style={{ fontSize: 9, flex: '0 0 auto' }}>You</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                        {isActive && !p.bankrupt && !room.ended && <span style={{ color: p.color, fontWeight: 700 }}>Playing</span>}
                        {p.inJail && <span style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Lock size={10} /> {room.board.jailNoun || 'Jail'}</span>}
                        {owes && <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><AlertTriangle size={10} /> Owes ${owes.amount.toLocaleString()}</span>}
                        {p.bankrupt && <span style={{ color: 'var(--danger)' }}>Bankrupt</span>}
                        {!p.connected && !p.bankrupt && <span style={{ color: 'var(--text-4)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><WifiOff size={10} /> Offline</span>}
                    </div>
                </div>
                {removable ? (
                    <button className="btn sm ghost" onClick={onRemove} title="They've been offline a while — remove them so the game can go on" style={{ color: 'var(--danger)' }}>
                        <UserX size={13} /> Remove
                    </button>
                ) : !isMe && !p.bankrupt && room.started && !room.ended && me && !me.bankrupt && (
                    <button className="btn sm ghost" onClick={onTrade} title={`Trade with ${p.username}`}>
                        <Handshake size={13} />
                    </button>
                )}
            </div>
            {!p.bankrupt && (
                <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 12 }}>
                    <Stat label="Cash"><span className="money" style={{ fontSize: 15 }}>${p.cash.toLocaleString()}</span></Stat>
                    <Stat label="Worth"><span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>${netWorth(room, p).toLocaleString()}</span></Stat>
                    {jailCards > 0 && <Stat label="Jail free"><span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{jailCards}</span></Stat>}
                </div>
            )}
            {owned.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 8 }}>
                    {owned.map(pos => {
                        const d = room.board.tiles[pos], st = room.tileState[pos];
                        return (
                            <button key={pos} onClick={() => onTileClick?.(pos)} title={`${d.name}${st.mortgaged ? ' (mortgaged)' : ''}${st.houses >= 5 ? ' · hotel' : st.houses > 0 ? ` · ${st.houses} house${st.houses > 1 ? 's' : ''}` : ''}`}
                                style={{
                                    width: 14, height: 18, padding: 0, borderRadius: 3,
                                    background: d.color || 'var(--surface-3)',
                                    border: `1px solid ${st.houses > 0 ? 'white' : 'rgba(0,0,0,0.4)'}`,
                                    opacity: st.mortgaged ? 0.3 : 1,
                                    position: 'relative', cursor: 'pointer',
                                }}>
                                {st.houses > 0 && (
                                    <span style={{
                                        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                                        fontSize: 9, fontWeight: 800, color: '#0b0f17', textShadow: '0 0 2px white',
                                    }}>{st.houses >= 5 ? 'H' : st.houses}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Stat({ label, children }) {
    return (
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            {children}
        </div>
    );
}
