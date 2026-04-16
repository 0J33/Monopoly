import React from 'react';
import { X, Hammer, Trash2, Lock, Unlock, Train, Lightbulb, Droplet } from 'lucide-react';

// Click a tile → open this. Renders inline (not via PropertyCard — that one's
// positioned absolutely for hover popups and breaks flex layout).
export default function PropertyModal({ pos, room, me, act, onClose }) {
    const def = room.board.tiles[pos];
    const state = room.tileState[pos];
    if (!def || (def.type !== 'property' && def.type !== 'station' && def.type !== 'utility')) {
        onClose();
        return null;
    }
    const isOwner = state.owner === me?.userId;
    const owner = state.owner ? room.players.find(p => p.userId === state.owner) : null;
    const canBuild = def.type === 'property' && isOwner && !state.mortgaged && state.houses < 5;

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 70,
            background: 'rgba(0,0,0,0.55)',
            display: 'grid', placeItems: 'center',
            animation: 'fadeIn 0.15s ease-out',
        }}>
            <div onClick={e => e.stopPropagation()} className="fade-in" style={{
                width: 380, maxWidth: '90vw',
                background: 'var(--surface)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {/* Color stripe + header */}
                <div style={{
                    background: def.color || 'var(--surface-3)',
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    padding: '0 6px',
                }}>
                    <button className="btn sm ghost" onClick={onClose}
                        style={{ background: 'rgba(0,0,0,0.35)', color: 'white', padding: '4px 8px' }}>
                        <X size={14} />
                    </button>
                </div>

                {/* Title */}
                <div style={{ padding: '14px 18px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {def.type === 'station' && <Train size={16} color="var(--text-3)" />}
                        {def.type === 'utility' && (def.name.toLowerCase().includes('electric')
                            ? <Lightbulb size={16} color="var(--warning)" />
                            : <Droplet size={16} color="var(--accent-2)" />)}
                        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>{def.name}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span>Price <b className="mono" style={{ color: 'var(--text-2)' }}>${def.price}</b></span>
                        <span>Mortgage <b className="mono" style={{ color: 'var(--text-2)' }}>${def.mortgage}</b></span>
                        {def.houseCost != null && <span>House <b className="mono" style={{ color: 'var(--text-2)' }}>${def.houseCost}</b></span>}
                    </div>
                </div>

                {/* Rent table */}
                <div style={{ padding: '0 18px 14px' }}>
                    {def.type === 'property' && <RentTable rent={def.rent} currentHouses={state?.houses ?? 0} />}
                    {def.type === 'station' && <StationRent />}
                    {def.type === 'utility' && <UtilityRent />}
                </div>

                {/* Owner info */}
                {owner && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px',
                        borderTop: '1px solid var(--border)',
                        fontSize: 13, color: 'var(--text-2)',
                    }}>
                        <span className="dot" style={{ background: owner.color, width: 10, height: 10 }} />
                        Owned by <b style={{ color: owner.color }}>{owner.username}</b>
                        {state.mortgaged && <span className="chip" style={{ fontSize: 10, color: 'var(--warning)', borderColor: 'var(--warning)' }}>Mortgaged</span>}
                    </div>
                )}

                {/* Actions */}
                {isOwner && (
                    <div style={{ display: 'flex', gap: 6, padding: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                        {canBuild && (
                            <button className="btn sm" disabled={me.cash < def.houseCost} onClick={() => act('build', { pos })}>
                                <Hammer size={13} /> Build (${def.houseCost})
                            </button>
                        )}
                        {def.type === 'property' && state.houses > 0 && (
                            <button className="btn sm" onClick={() => act('demolish', { pos })}>
                                <Trash2 size={13} /> Sell building
                            </button>
                        )}
                        {!state.mortgaged && (
                            <button className="btn sm" onClick={() => act('mortgage', { pos })}>
                                <Lock size={13} /> Mortgage
                            </button>
                        )}
                        {state.mortgaged && (
                            <button className="btn sm" onClick={() => act('unmortgage', { pos })}>
                                <Unlock size={13} /> Unmortgage
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function RentTable({ rent, currentHouses }) {
    const rows = [
        { label: 'Base rent',  val: rent[0] },
        { label: '1 house',    val: rent[1] },
        { label: '2 houses',   val: rent[2] },
        { label: '3 houses',   val: rent[3] },
        { label: '4 houses',   val: rent[4] },
        { label: 'Hotel',      val: rent[5] },
    ];
    return (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
                {rows.map((r, i) => {
                    const on = i === currentHouses;
                    return (
                        <tr key={i} style={{
                            background: on ? 'var(--accent-soft)' : 'transparent',
                            color: on ? 'var(--accent-2)' : 'var(--text-2)',
                            fontWeight: on ? 700 : 400,
                        }}>
                            <td style={{ padding: '4px 8px', borderRadius: on ? 4 : 0 }}>{r.label}</td>
                            <td className="mono" style={{ padding: '4px 8px', textAlign: 'right' }}>${r.val}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function StationRent() {
    return (
        <table style={{ width: '100%', fontSize: 13 }}>
            <tbody>
                <tr><td style={{ padding: '3px 8px' }}>1 owned</td><td className="mono" style={{ textAlign: 'right', padding: '3px 8px' }}>$25</td></tr>
                <tr><td style={{ padding: '3px 8px' }}>2 owned</td><td className="mono" style={{ textAlign: 'right', padding: '3px 8px' }}>$50</td></tr>
                <tr><td style={{ padding: '3px 8px' }}>3 owned</td><td className="mono" style={{ textAlign: 'right', padding: '3px 8px' }}>$100</td></tr>
                <tr><td style={{ padding: '3px 8px' }}>4 owned</td><td className="mono" style={{ textAlign: 'right', padding: '3px 8px' }}>$200</td></tr>
            </tbody>
        </table>
    );
}

function UtilityRent() {
    return (
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
            One owned: pay <b className="mono">4×</b> dice roll.<br />
            Both owned: pay <b className="mono">10×</b> dice roll.
        </div>
    );
}
