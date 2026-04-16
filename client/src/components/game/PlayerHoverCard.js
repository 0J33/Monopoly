import React from 'react';
import { Lock } from 'lucide-react';

// Floating mini-profile shown when hovering a player token on the board.
// Cheap read-only view: name, cash, owned count, jail status.
export default function PlayerHoverCard({ player, room, anchor }) {
    if (!player || !anchor) return null;
    const ownedNames = (player.owned || [])
        .map(pos => room.board.tiles[pos])
        .filter(Boolean)
        .slice(0, 10);
    const hidden = Math.max(0, (player.owned?.length || 0) - ownedNames.length);
    const jailCards = (room.jailFreeLedger?.[player.userId]?.chance || 0)
                    + (room.jailFreeLedger?.[player.userId]?.chest  || 0);

    const left = Math.min(anchor.clientX + 14, window.innerWidth - 260);
    const top  = Math.min(anchor.clientY + 10, window.innerHeight - 240);

    return (
        <div className="fade-in" style={{
            position: 'fixed', left, top, zIndex: 60, pointerEvents: 'none',
            width: 240,
            background: 'var(--surface)',
            border: `1px solid ${player.color}`,
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
        }}>
            <div style={{ height: 4, background: player.color }} />
            <div style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: player.color,
                        display: 'grid', placeItems: 'center',
                        fontSize: 13, fontWeight: 800,
                        color: ['#FFFFFF', '#FACC15'].includes(player.color?.toUpperCase()) ? '#0b0f17' : 'white',
                        border: '2px solid white',
                    }}>{(player.username || '?')[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{player.username}</div>
                        <div style={{ display: 'flex', gap: 6, fontSize: 11, color: 'var(--text-3)' }}>
                            {player.inJail && <span style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Lock size={10} /> Jail</span>}
                            {player.bankrupt && <span style={{ color: 'var(--danger)' }}>Bankrupt</span>}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <Stat label="Cash"   value={`$${(player.cash || 0).toLocaleString()}`} color="var(--money)" />
                    <Stat label="Assets" value={player.owned?.length || 0} />
                    {jailCards > 0 && <Stat label="Jail free" value={jailCards} />}
                </div>

                {ownedNames.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Properties</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {ownedNames.map(t => (
                                <span key={t.pos} className="chip" style={{
                                    fontSize: 10, padding: '2px 6px',
                                    borderColor: t.color || 'var(--border)',
                                    color: t.color ? 'var(--text)' : 'var(--text-2)',
                                }}>
                                    {t.color && <span className="dot" style={{ width: 6, height: 6, background: t.color, boxShadow: 'none' }} />}
                                    {t.name}
                                </span>
                            ))}
                            {hidden > 0 && <span className="chip" style={{ fontSize: 10, padding: '2px 6px' }}>+{hidden}</span>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value, color }) {
    return (
        <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
        </div>
    );
}
