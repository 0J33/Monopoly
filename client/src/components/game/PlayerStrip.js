import React from 'react';
import { Handshake, Lock } from 'lucide-react';

// Compact horizontal player list for mobile. Each chip shows color dot, name,
// cash, and a trade button for other players. Active turn is highlighted.
export default function PlayerStrip({ room, me, onTrade }) {
    const active = room.players[room.turnIndex];
    return (
        <div style={{
            display: 'flex', gap: 6, overflowX: 'auto',
            padding: '6px 8px',
            scrollSnapType: 'x proximity',
        }}>
            {room.players.map(p => {
                const isActive = active?.userId === p.userId && room.started;
                const isMe = me?.userId === p.userId;
                return (
                    <div key={p.userId} style={{
                        flex: '0 0 auto',
                        minWidth: 128,
                        padding: '6px 8px',
                        background: 'var(--surface)',
                        border: `1.5px solid ${isActive ? p.color : 'var(--border)'}`,
                        boxShadow: isActive ? `0 0 0 2px ${p.color}33` : 'none',
                        borderRadius: 'var(--radius)',
                        display: 'flex', flexDirection: 'column', gap: 2,
                        opacity: p.bankrupt ? 0.45 : 1,
                        scrollSnapAlign: 'start',
                        position: 'relative',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                                width: 16, height: 16, borderRadius: 4,
                                background: p.color,
                                display: 'grid', placeItems: 'center',
                                fontSize: 10, fontWeight: 800,
                                color: ['#FFFFFF', '#FACC15'].includes(p.color?.toUpperCase()) ? '#0b0f17' : 'white',
                            }}>{(p.username || '?')[0]?.toUpperCase()}</span>
                            <span style={{
                                fontSize: 12, fontWeight: 700,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                flex: 1, minWidth: 0,
                            }}>{p.username}</span>
                            {p.inJail && <Lock size={10} color="var(--warning)" />}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span className="money" style={{ fontSize: 13 }}>${p.cash.toLocaleString()}</span>
                            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>· {p.owned?.length || 0}</span>
                            {isMe && <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 'auto' }}>you</span>}
                        </div>
                        {!isMe && !p.bankrupt && room.started && (
                            <button
                                onClick={() => onTrade(p.userId)}
                                style={{
                                    position: 'absolute', top: 4, right: 4,
                                    background: 'transparent', border: 'none',
                                    padding: 2, borderRadius: 4,
                                    color: 'var(--text-3)',
                                }}
                                title="Propose trade"
                            ><Handshake size={11} /></button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
