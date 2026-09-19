import React, { useEffect } from 'react';
import { X, Hammer, Trash2, Lock, Unlock } from 'lucide-react';
import Deed from './Deed';
import Puck from '../common/Puck';
import './menus.css';

// Click a tile → its title deed, lifted off the board. The owner can build,
// sell, mortgage and unmortgage right here.
export default function PropertyModal({ pos, room, me, act, onClose }) {
    const def = room.board.tiles[pos];
    const state = room.tileState[pos];
    const ownable = def && ['property', 'station', 'utility'].includes(def.type);
    useEffect(() => { if (!ownable) onClose(); }, [ownable, onClose]);
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    if (!ownable) return null;

    const isOwner = state.owner === me?.userId && !me?.bankrupt && !room.ended;
    const owner = state.owner ? room.players.find(p => p.userId === state.owner) : null;
    const siblings = def.type === 'property'
        ? room.board.tiles.filter(t => t.type === 'property' && t.group === def.group) : [];
    const fullSet = siblings.length > 0 && siblings.every(t => room.tileState[t.pos].owner === state.owner);
    const groupMortgaged = siblings.some(t => room.tileState[t.pos].mortgaged);
    const groupBuilt = siblings.some(t => room.tileState[t.pos].houses > 0);
    const inDebt = room.debts?.some(d => d.userId === me?.userId);
    const canBuild = def.type === 'property' && isOwner && fullSet && !groupMortgaged && !state.mortgaged && state.houses < 5;
    const unCost = Math.ceil(def.mortgage * room.rules.mortgageRebuyRate);

    return (
        <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 70 }}>
            <div onClick={e => e.stopPropagation()} className="dealt" style={{ width: 300, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ position: 'relative' }}>
                    <Deed def={def} state={state} room={room} fullSet={fullSet && state.owner} />
                    <button className="sheet-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
                </div>

                <div className="deed-owner">
                    {owner
                        ? <><Puck color={owner.color} label={(owner.username[0] || '?').toUpperCase()} size={24} />
                            <span>Owned by <b style={{ color: owner.color }}>{owner.userId === me?.userId ? 'you' : owner.username}</b>
                            {def.type === 'property' && state.houses > 0 && <> · {state.houses >= 5 ? 'hotel' : `${state.houses} house${state.houses > 1 ? 's' : ''}`}</>}</span></>
                        : <span>For sale · <b className="mono">${def.price}</b></span>}
                </div>

                {isOwner && (
                    <div className="deed-actions">
                        {canBuild && (
                            <button className="btn primary" disabled={me.cash < def.houseCost || inDebt} onClick={() => act('build', { pos })}>
                                <Hammer size={14} /> {state.houses === 4 ? 'Build hotel' : 'Build house'} · ${def.houseCost}
                            </button>
                        )}
                        {def.type === 'property' && state.houses > 0 && (
                            <button className="btn" onClick={() => act('demolish', { pos })}>
                                <Trash2 size={14} /> Sell building · +${Math.floor(def.houseCost / 2)}
                            </button>
                        )}
                        {!state.mortgaged && (
                            <button className="btn" disabled={def.type === 'property' && groupBuilt} onClick={() => act('mortgage', { pos })}
                                title={def.type === 'property' && groupBuilt ? 'Sell the buildings in this colour set first' : undefined}>
                                <Lock size={14} /> Mortgage · +${def.mortgage}
                            </button>
                        )}
                        {state.mortgaged && (
                            <button className="btn primary" disabled={me.cash < unCost || inDebt} onClick={() => act('unmortgage', { pos })}>
                                <Unlock size={14} /> Unmortgage · ${unCost}
                            </button>
                        )}
                        {def.type === 'property' && !fullSet && (
                            <div className="deed-hint">Own the whole {room.board.groupNames?.[def.group] || 'colour set'} to build houses.</div>
                        )}
                        {def.type === 'property' && fullSet && groupMortgaged && !state.mortgaged && (
                            <div className="deed-hint">Unmortgage the rest of the set to build.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
