import React, { useEffect, useMemo, useState } from 'react';
import { Handshake, Send, X, Check, Eye, Lock } from 'lucide-react';
import Puck from '../common/Puck';
import './menus.css';

// Two-sided editor with a read-only "peek" mode for non-party observers.
// Each side picks properties + cash + jail cards. Proposing or changing the
// offer counts as agreeing to it; the other side then accepts (the trade
// happens) or changes it back. Closing the window just hides it — the
// offer stays open in the Trades list.
export default function TradeModal({ room, me, counterpartyUserId, existingTrade, onClose, onSent, act }) {
    const iAmParty = !existingTrade || existingTrade.fromUserId === me.userId || existingTrade.toUserId === me.userId;
    const peek = !iAmParty || (existingTrade && existingTrade.status !== 'open') || me.bankrupt;

    // "Mine" is the left column: me, or the proposer when peeking.
    const myId    = !iAmParty ? existingTrade.fromUserId : me.userId;
    const theirId = !iAmParty ? existingTrade.toUserId
        : existingTrade ? (existingTrade.fromUserId === me.userId ? existingTrade.toUserId : existingTrade.fromUserId)
        : counterpartyUserId;
    const mine = room.players.find(p => p.userId === myId);
    const them = room.players.find(p => p.userId === theirId);

    // offer = what `fromUserId` gives; request = what `toUserId` gives.
    // Normalise into "my side gives" / "their side gives". Keyed on the trade
    // version, not the object: every broadcast brings a fresh copy, and that
    // mustn't wipe what's being edited.
    const serverSides = useMemo(() => {
        if (!existingTrade) return null;
        const iAmSender = existingTrade.fromUserId === myId;
        return {
            give: iAmSender ? existingTrade.offer : existingTrade.request,
            get:  iAmSender ? existingTrade.request : existingTrade.offer,
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existingTrade?.id, existingTrade?.version, myId]);

    const [give, setGive] = useState(serverSides?.give || empty());
    const [get, setGet]   = useState(serverSides?.get || empty());
    const [msg, setMsg] = useState('');
    // A new version from the other side replaces whatever was being edited.
    useEffect(() => {
        if (!serverSides) return;
        setGive(serverSides.give);
        setGet(serverSides.get);
    }, [serverSides]);

    const dirty = existingTrade && (!same(give, serverSides.give) || !same(get, serverSides.get));
    const isEmpty = isBlank(give) && isBlank(get);

    function submit() {
        const iAmSender = !existingTrade || existingTrade.fromUserId === me.userId;
        if (!existingTrade) {
            act('trade-propose', { toUserId: counterpartyUserId, offer: give, request: get });
            onSent?.();
        } else {
            act('trade-update', iAmSender
                ? { tradeId: existingTrade.id, offer: give, request: get }
                : { tradeId: existingTrade.id, offer: get, request: give });
        }
    }
    function sendMsg() {
        const text = msg.trim();
        if (!text || !existingTrade) return;
        act('trade-msg', { tradeId: existingTrade.id, text });
        setMsg('');
    }

    const iAccepted    = existingTrade?.acceptedBy?.includes(me.userId);
    const theyAccepted = existingTrade?.acceptedBy?.includes(theirId);
    const iAmProposer  = existingTrade?.fromUserId === me.userId;
    const nameOf = (uid) => room.players.find(p => p.userId === uid)?.username || '?';
    const statusText = existingTrade && existingTrade.status !== 'open'
        ? { accepted: 'Trade completed', rejected: 'Turned down', cancelled: 'Withdrawn', failed: 'Fell through' }[existingTrade.status] || existingTrade.status
        : null;

    return (
        <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 90 }}>
            <div onClick={e => e.stopPropagation()} className="felt tray dealt" style={{ width: 820 }}>
                <div className="tray-head">
                    {peek ? <Eye size={18} color="var(--gold)" /> : <Handshake size={20} color="var(--gold)" />}
                    <h2 className="print tray-title">
                        {iAmParty ? <>Trade with <span style={{ color: them?.color }}>{them?.username}</span></> : <>{mine?.username} ↔ {them?.username}</>}
                    </h2>
                    {statusText && <span className="chip" style={{ fontSize: 12 }}>{statusText}</span>}
                    <div style={{ flex: 1 }} />
                    <button className="btn sm ghost" onClick={onClose} title="Close (the offer stays open)" aria-label="Close"><X size={15} /></button>
                </div>

                <div className="tray-body trade-sides">
                    <Side room={room} title={`${iAmParty && !peek ? 'You give' : `${mine?.username} gives`}`} owner={mine} bundle={give} setBundle={setGive} readOnly={peek} />
                    <Side room={room} title={`${them?.username} gives`} owner={them} bundle={get} setBundle={setGet} readOnly={peek} />
                </div>

                {existingTrade?.messages?.length > 0 && (
                    <div className="trade-thread">
                        {existingTrade.messages.map(m => (
                            <div key={m.id}>
                                <b style={{ color: room.players.find(p => p.userId === m.userId)?.color }}>{nameOf(m.userId)}:</b> {m.text}
                            </div>
                        ))}
                    </div>
                )}

                {existingTrade && existingTrade.status === 'open' && (
                    <div className="trade-agree">
                        <span className={(peek ? existingTrade.acceptedBy.includes(myId) : iAccepted) ? 'yes' : ''}>
                            {(peek ? existingTrade.acceptedBy.includes(myId) : iAccepted) ? <Check size={13} /> : null} {peek ? mine?.username : 'You'}: {(peek ? existingTrade.acceptedBy.includes(myId) : iAccepted) ? 'agreed' : 'deciding'}
                        </span>
                        <span className={theyAccepted ? 'yes' : ''}>
                            {theyAccepted ? <Check size={13} /> : null} {them?.username}: {theyAccepted ? 'agreed' : 'deciding'}
                        </span>
                    </div>
                )}

                {existingTrade && !peek && (
                    <div className="trade-msg">
                        <input
                            placeholder="Say something about this deal…" style={{ flex: 1, fontSize: 14, minWidth: 0 }}
                            value={msg} onChange={e => setMsg(e.target.value.slice(0, 300))}
                            onKeyDown={e => { if (e.key === 'Enter') sendMsg(); }}
                        />
                        <button className="btn sm" onClick={sendMsg} disabled={!msg.trim()} aria-label="Send message"><Send size={13} /></button>
                    </div>
                )}

                {!peek && (
                    <div className="tray-foot">
                        {!existingTrade && (
                            <button className="btn primary" onClick={submit} disabled={isEmpty}>
                                <Send size={15} /> Send offer
                            </button>
                        )}
                        {existingTrade && dirty && (
                            <button className="btn primary" onClick={submit} disabled={isEmpty}>
                                <Send size={15} /> Send changes
                            </button>
                        )}
                        {existingTrade && !dirty && !iAccepted && (
                            <button className="btn primary" onClick={() => act('trade-accept', { tradeId: existingTrade.id })}>
                                <Check size={15} /> Accept deal
                            </button>
                        )}
                        {existingTrade && !dirty && iAccepted && (
                            <span style={{ fontSize: 14, color: 'rgba(246,236,210,0.8)' }}>Waiting for {them?.username} to answer…</span>
                        )}
                        {!existingTrade && isEmpty && <span style={{ fontSize: 13, color: 'rgba(246,236,210,0.7)' }}>Pick deeds or add cash on either side.</span>}
                        <div style={{ flex: 1 }} />
                        {existingTrade && (
                            <button className="btn danger" onClick={() => { act('trade-reject', { tradeId: existingTrade.id }); onClose(); }}>
                                <X size={15} /> {iAmProposer ? 'Withdraw offer' : 'Decline'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function empty() { return { cash: 0, properties: [], jailCards: { chance: 0, chest: 0 } }; }
function isBlank(b) { return !b.cash && !b.properties.length && !b.jailCards?.chance && !b.jailCards?.chest; }
function same(a, b) {
    return (a.cash || 0) === (b.cash || 0)
        && [...a.properties].sort().join() === [...b.properties].sort().join()
        && (a.jailCards?.chance || 0) === (b.jailCards?.chance || 0)
        && (a.jailCards?.chest || 0) === (b.jailCards?.chest || 0);
}

function Side({ room, title, owner, bundle, setBundle, readOnly }) {
    const cashLimit = owner?.cash || 0;
    const tiles = room.board.tiles;
    const props = [...(owner?.owned || [])].sort((a, b) => a - b);
    const ledger = room.jailFreeLedger?.[owner?.userId] || { chance: 0, chest: 0 };
    const groupBuilt = (g) => tiles.some((t, i) => t.type === 'property' && t.group === g && room.tileState[i].houses > 0);
    const setCash = (v) => setBundle(b => ({ ...b, cash: Math.max(0, Math.min(cashLimit, Math.floor(v) || 0)) }));
    const toggle = (pos) => setBundle(b => ({
        ...b,
        properties: b.properties.includes(pos) ? b.properties.filter(p => p !== pos) : [...b.properties, pos],
    }));
    const toggleCard = (deck) => setBundle(b => ({
        ...b,
        jailCards: { ...b.jailCards, [deck]: (b.jailCards?.[deck] || 0) > 0 ? 0 : 1 },
    }));

    return (
        <section className="trade-side" aria-label={title}>
            <div className="trade-side-head">
                {owner && <Puck color={owner.color} label={(owner.username[0] || '?').toUpperCase()} size={26} />}
                <h3 className="print" style={{ margin: 0, fontSize: 22, color: 'var(--paper)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
            </div>

            <div className="trade-cash">
                <span className="tray-label" style={{ margin: 0 }}>Cash</span>
                <label className="paper cash-slip">
                    <span className="mono">$</span>
                    <input
                        type="number" min={0} max={cashLimit} inputMode="numeric"
                        aria-label={`${title}: cash`}
                        value={bundle.cash}
                        disabled={readOnly}
                        onChange={e => setCash(Number(e.target.value || 0))}
                    />
                </label>
                {!readOnly && (
                    <>
                        <button type="button" className="btn sm" onClick={() => setCash(bundle.cash - 50)} disabled={bundle.cash <= 0} aria-label="50 less">−50</button>
                        <button type="button" className="btn sm" onClick={() => setCash(bundle.cash + 50)} disabled={bundle.cash >= cashLimit} aria-label="50 more">+50</button>
                        <button type="button" className="btn sm" onClick={() => setCash(cashLimit)} disabled={bundle.cash >= cashLimit}>All</button>
                    </>
                )}
                <span className="trade-has">has ${cashLimit.toLocaleString()}</span>
            </div>

            <div className="tray-label" style={{ marginTop: 14 }}>Deeds</div>
            {props.length === 0 && <div style={{ fontSize: 14, color: 'rgba(246,236,210,0.6)' }}>No deeds.</div>}
            <div className="hand">
                {props.map(pos => {
                    const def = tiles[pos], st = room.tileState[pos];
                    const on = bundle.properties.includes(pos);
                    const locked = def.type === 'property' && groupBuilt(def.group);
                    if (readOnly && !on) return null;
                    return (
                        <button key={pos} type="button"
                            className={`mini-deed${on ? ' picked' : ''}${st.mortgaged ? ' mortgaged' : ''}`}
                            onClick={() => !readOnly && !locked && toggle(pos)}
                            disabled={readOnly ? false : (locked && !on)}
                            aria-pressed={on}
                            title={locked ? 'Sell the buildings in this colour set before trading it' : def.name}>
                            <span className="mini-band" style={{ background: def.color || 'var(--ink)' }} />
                            <span className="mini-body">
                                <span className="mini-name" style={{ display: 'block' }}>{def.name}</span>
                                <span className="mini-meta">
                                    <span className="mono">${def.price}</span>
                                    {st.mortgaged && <b style={{ color: '#b3261e' }}>mortgaged</b>}
                                    {locked && <Lock size={11} />}
                                    {on && <Check size={13} style={{ marginLeft: 'auto', color: 'var(--ink)' }} />}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            {(ledger.chance > 0 || ledger.chest > 0) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {['chance', 'chest'].filter(d => ledger[d] > 0).map(d => {
                        const on = (bundle.jailCards?.[d] || 0) > 0;
                        if (readOnly && !on) return null;
                        return (
                            <button key={d} type="button" className={`mini-deed${on ? ' picked' : ''}`} style={{ width: 'auto' }}
                                disabled={readOnly} onClick={() => toggleCard(d)} aria-pressed={on}>
                                <span className="mini-band" style={{ background: d === 'chance' ? 'var(--chance)' : 'var(--chest)' }} />
                                <span className="mini-body"><span className="mini-name" style={{ display: 'block', fontSize: 14 }}>Get out of {room.board.jailNoun || 'jail'} free</span></span>
                            </button>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
