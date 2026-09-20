import React, { useEffect } from 'react';
import { X, Hammer, Trash2, Lock, Unlock } from 'lucide-react';
import { liquidValue } from './playerStatus';
import './menus.css';

// Your deeds, laid out on the felt by colour set, each with its build / sell
// / mortgage buttons. The fast way to raise cash for a debt, or to build
// before rolling. The server has the final say; disabled states here only
// avoid obvious no-ops.
export default function AssetsModal({ room, me, act, onClose }) {
    const tiles = room.board.tiles;
    const debt = room.debts?.find(d => d.userId === me.userId);
    const inDebt = !!debt;
    // Building and selling are turn actions. The exception is owing money:
    // settling a debt is exactly when you have to be able to raise cash.
    const myTurn = room.players[room.turnIndex]?.userId === me.userId;
    const canAct = myTurn || inDebt;

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const groups = [];
    const byKey = {};
    for (const pos of [...me.owned].sort((a, b) => a - b)) {
        const d = tiles[pos];
        const key = d.type === 'property' ? d.group : d.type;
        if (!byKey[key]) { byKey[key] = { key, label: groupLabel(room, d), items: [] }; groups.push(byKey[key]); }
        byKey[key].items.push(pos);
    }

    return (
        <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 85 }}>
            <div onClick={e => e.stopPropagation()} className="felt tray dealt" style={{ width: 760 }}>
                <div className="tray-head">
                    <h2 className="print tray-title">Your deeds</h2>
                    {!canAct && <span className="note tray-wait">Building and selling wait for your turn</span>}
                    <div style={{ flex: 1 }} />
                    <span className="note">${me.cash.toLocaleString()}</span>
                    <button className="btn sm ghost" onClick={onClose} aria-label="Close"><X size={15} /></button>
                </div>
                {debt && (
                    <div className="tray-debt">
                        You owe <b className="mono">${debt.amount.toLocaleString()}</b>.{' '}
                        {me.cash >= debt.amount
                            ? <button className="btn sm primary" onClick={() => { act('pay-debt'); onClose(); }}>Pay it now</button>
                            : <>Raise <b className="mono">${(debt.amount - me.cash).toLocaleString()}</b> more — up to ${Math.max(0, liquidValue(room, me) - me.cash).toLocaleString()} is available from mortgages and sales below.</>}
                    </div>
                )}
                <div className="tray-body">
                    {groups.length === 0 && <div style={{ color: 'rgba(246,236,210,0.7)', textAlign: 'center', padding: 24 }}>You don't own any property yet.</div>}
                    {groups.map(g => {
                        const d0 = tiles[g.items[0]];
                        const setSize = d0.type === 'property' ? room.board.groupSizes[d0.group] : null;
                        const full = setSize != null && g.items.length === setSize;
                        const anyMortgaged = g.items.some(p => room.tileState[p].mortgaged);
                        const houses = g.items.map(p => room.tileState[p].houses || 0);
                        const minH = Math.min(...houses), maxH = Math.max(...houses);
                        return (
                            <section key={g.key} style={{ marginBottom: 18 }}>
                                <div className="tray-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {d0.color && <span className="dot" style={{ background: d0.color }} />}
                                    {g.label}
                                    {setSize != null && <span style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                                        · {full ? 'full set — you can build' : `${g.items.length} of ${setSize}`}
                                    </span>}
                                </div>
                                <div className="hand" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                                    {g.items.map(pos => {
                                        const d = tiles[pos], st = room.tileState[pos];
                                        const h = st.houses || 0;
                                        const even = !room.rules.evenBuild;
                                        const canBuild = canAct && full && !anyMortgaged && !st.mortgaged && h < 5 && (even || h === minH) && !inDebt && me.cash >= d.houseCost;
                                        const canSell = canAct && d.type === 'property' && h > 0 && (even || h === maxH);
                                        const canMortgage = canAct && !st.mortgaged && !(d.type === 'property' && maxH > 0);
                                        const unCost = Math.ceil(d.mortgage * room.rules.mortgageRebuyRate);
                                        const canUnmortgage = canAct && st.mortgaged && !inDebt && me.cash >= unCost;
                                        return (
                                            <div key={pos} className={`mini-deed${st.mortgaged ? ' mortgaged' : ''}`}>
                                                <div className="mini-band" style={{ background: d.color || 'var(--ink)' }} />
                                                <div className="mini-body">
                                                    <div className="mini-name" title={d.name}>{d.name}</div>
                                                    <div className="mini-meta">
                                                        {st.mortgaged ? <b style={{ color: '#b3261e' }}>Mortgaged</b>
                                                            : h >= 5 ? 'Hotel' : h > 0 ? `${h} house${h > 1 ? 's' : ''}` : d.type === 'property' ? 'No buildings' : `Price $${d.price}`}
                                                    </div>
                                                    {/* Every control, always, disabled when it does not apply.
                                                        Buying a house used to ADD a Sell button, which pushed
                                                        Mortgage down a row — so the card you were clicking
                                                        rearranged itself under the cursor between clicks. A
                                                        control that comes and goes is a control you have to
                                                        re-find; one that greys out stays where you left it. */}
                                                    <div className="mini-actions">
                                                        {d.type === 'property' ? (
                                                            <button className="btn sm ink" disabled={!canBuild} onClick={() => act('build', { pos })}
                                                                title={!full ? 'You need the whole colour set' : h >= 5 ? 'Fully built' : h === 4 ? 'Build a hotel' : 'Build a house'}>
                                                                <Hammer size={12} /> {h >= 5 ? 'Built' : h === 4 ? 'Hotel' : 'House'} ${d.houseCost}
                                                            </button>
                                                        ) : <span className="mini-slot" aria-hidden="true" />}
                                                        {d.type === 'property' ? (
                                                            <button className="btn sm paper-ghost" disabled={!canSell} onClick={() => act('demolish', { pos })}
                                                                title={h > 0 ? 'Sell a building back at half price' : 'Nothing built here'}>
                                                                <Trash2 size={12} /> +${Math.floor(d.houseCost / 2)}
                                                            </button>
                                                        ) : <span className="mini-slot" aria-hidden="true" />}
                                                        {st.mortgaged ? (
                                                            <button className="btn sm ink" disabled={!canUnmortgage} onClick={() => act('unmortgage', { pos })}>
                                                                <Unlock size={12} /> Unmortgage ${unCost}
                                                            </button>
                                                        ) : (
                                                            <button className="btn sm paper-ghost" disabled={!canMortgage} onClick={() => act('mortgage', { pos })}
                                                                title={canMortgage ? 'Mortgage for cash' : 'Sell the buildings in this set first'}>
                                                                <Lock size={12} /> Mortgage +${d.mortgage}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function groupLabel(room, d) {
    if (d.type === 'station') {
        const noun = room.board.stationNoun || 'station';
        return noun === 'railroad' ? 'Railroads' : noun === 'airport' ? 'Airports' : 'Stations';
    }
    if (d.type === 'utility') return 'Utilities';
    return room.board.groupNames?.[d.group] || ({ brown: 'Brown', lblue: 'Light blue', pink: 'Pink', orange: 'Orange', red: 'Red', yellow: 'Yellow', green: 'Green', dblue: 'Dark blue' }[d.group] || d.group);
}
