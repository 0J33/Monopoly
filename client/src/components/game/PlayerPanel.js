import React from 'react';
import { Handshake, Lock } from 'lucide-react';

export default function PlayerPanel({ p, isMe, isActive, room, onTrade }) {
    const ownedCount = p.owned?.length || 0;
    const jailCards = (room.jailFreeLedger?.[p.userId]?.chance || 0) + (room.jailFreeLedger?.[p.userId]?.chest || 0);

    return (
        <div className="card" style={{
            padding: 12,
            borderColor: isActive ? p.color : 'var(--border)',
            boxShadow: isActive ? `0 0 0 2px ${p.color}55, var(--shadow)` : 'var(--shadow)',
            opacity: p.bankrupt ? 0.4 : 1,
            transition: 'border-color 0.2s, box-shadow 0.2s',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: p.color,
                    border: '2px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    display: 'grid', placeItems: 'center',
                    color: 'white', fontSize: 13, fontWeight: 800,
                }}>{(p.username || '?')[0]?.toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.username}
                        </span>
                        {isMe && <span className="chip" style={{ fontSize: 9 }}>You</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-3)' }}>
                        {p.inJail && <span style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Lock size={10} /> Jail</span>}
                        {p.bankrupt && <span style={{ color: 'var(--danger)' }}>Bankrupt</span>}
                        {!p.connected && <span style={{ color: 'var(--text-4)' }}>Offline</span>}
                    </div>
                </div>
                {!isMe && !p.bankrupt && room.started && (
                    <button className="btn sm ghost" onClick={onTrade} title="Propose trade">
                        <Handshake size={13} />
                    </button>
                )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 12 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cash</div>
                    <div className="money" style={{ fontSize: 15 }}>${p.cash.toLocaleString()}</div>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Assets</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{ownedCount}</div>
                </div>
                {jailCards > 0 && (
                    <div>
                        <div style={{ color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Jail free</div>
                        <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{jailCards}</div>
                    </div>
                )}
            </div>
        </div>
    );
}
