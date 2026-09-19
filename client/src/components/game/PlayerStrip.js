import React from 'react';
import { Handshake, Lock, WifiOff, AlertTriangle } from 'lucide-react';
import { canRemove } from './playerStatus';

// Compact player grid for mobile. Every player is always on screen — no
// sideways scrolling, however many there are: one row for two players, a
// 2×2 grid for three or four, three / four columns beyond that. Names
// truncate inside their own cell; the trade button has its own slot so it
// never sits on top of a name.
export default function PlayerStrip({ room, me, onTrade, onRemove }) {
    const active = room.players[room.turnIndex];
    const n = room.players.length;
    const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4;
    const compact = cols >= 3;
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: 6,
            padding: '4px 10px 6px',
        }}>
            {room.players.map(p => {
                const isActive = active?.userId === p.userId && room.started && !room.ended;
                const isMe = me?.userId === p.userId;
                const owes = room.debts?.some(d => d.userId === p.userId);
                const removable = canRemove(room, p, me);
                const light = ['#FFFFFF', '#FACC15'].includes(p.color?.toUpperCase());
                return (
                    <div key={p.userId} style={{
                        minWidth: 0,
                        padding: compact ? '5px 6px' : '6px 8px',
                        background: isActive ? 'var(--surface-2)' : 'var(--surface)',
                        border: `1.5px solid ${isActive ? p.color : 'var(--border)'}`,
                        boxShadow: isActive ? `0 0 0 2px ${p.color}33` : 'none',
                        borderRadius: 'var(--radius)',
                        display: 'flex', alignItems: 'center', gap: 6,
                        opacity: p.bankrupt ? 0.45 : 1,
                    }}>
                        <span style={{
                            flex: '0 0 auto',
                            width: 18, height: 18, borderRadius: 5,
                            background: p.color,
                            display: 'grid', placeItems: 'center',
                            fontSize: 10, fontWeight: 800,
                            color: light ? '#0b0f17' : 'white',
                        }}>{(p.username || '?')[0]?.toUpperCase()}</span>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                                <span style={{
                                    fontSize: 12, fontWeight: 700,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    minWidth: 0, textDecoration: p.bankrupt ? 'line-through' : 'none',
                                }}>{p.username}</span>
                                {isMe && <span style={{ flex: '0 0 auto', fontSize: 9, color: 'var(--accent)', fontWeight: 700 }}>you</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                                {p.bankrupt
                                    ? <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>Out</span>
                                    : <span className="money" style={{ fontSize: 12 }}>${p.cash.toLocaleString()}</span>}
                                {!compact && !p.bankrupt && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>· {p.owned?.length || 0}</span>}
                                {p.inJail && <Lock size={10} color="var(--warning)" />}
                                {owes && <AlertTriangle size={10} color="var(--danger)" />}
                                {!p.connected && !p.bankrupt && <WifiOff size={10} color="var(--text-4)" />}
                            </div>
                        </div>
                        {removable ? (
                            <button onClick={() => onRemove(p)} className="btn sm ghost"
                                style={{ flex: '0 0 auto', padding: '2px 6px', fontSize: 10, color: 'var(--danger)' }}
                                title="Remove this offline player">Remove</button>
                        ) : !isMe && !p.bankrupt && room.started && !room.ended && me && !me.bankrupt && (
                            <button
                                onClick={() => onTrade(p.userId)}
                                style={{
                                    flex: '0 0 auto',
                                    background: 'transparent', border: 'none',
                                    padding: 4, borderRadius: 4,
                                    color: 'var(--text-3)',
                                }}
                                title={`Trade with ${p.username}`}
                            ><Handshake size={14} /></button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
