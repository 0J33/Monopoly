import React, { useState } from 'react';
import { Handshake, X, ChevronDown, ChevronUp, Eye } from 'lucide-react';

// Floating button (bottom-left) + expandable list of ALL currently-open
// trades in the room. Players involved in a trade can accept / reject / edit;
// anyone else can peek at the terms. Counts include only trades with
// status === 'open'.
export default function TradesPanel({ room, me, onOpenTrade }) {
    const [expanded, setExpanded] = useState(false);
    const open = (room.trades || []).filter(t => t.status === 'open');
    const count = open.length;
    if (!room.started && count === 0) return null;

    return (
        <>
            {!expanded && (
                <button
                    className="btn"
                    onClick={() => setExpanded(true)}
                    style={{
                        position: 'fixed', left: 16, bottom: 16, zIndex: 70,
                        borderRadius: 999, height: 40, padding: '0 14px',
                        background: count > 0 ? 'var(--accent)' : 'var(--surface-2)',
                        borderColor: count > 0 ? 'var(--accent)' : 'var(--border)',
                        color: count > 0 ? 'white' : 'var(--text-2)',
                        boxShadow: 'var(--shadow)',
                        gap: 8,
                    }}
                    title="Open trades"
                >
                    <Handshake size={16} />
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Trades</span>
                    {count > 0 && (
                        <span style={{
                            background: 'rgba(255,255,255,0.25)', color: 'white',
                            fontSize: 11, fontWeight: 800,
                            minWidth: 20, height: 20, padding: '0 6px',
                            borderRadius: 999,
                            display: 'grid', placeItems: 'center',
                        }}>{count}</span>
                    )}
                </button>
            )}

            {expanded && (
                <div className="fade-in" style={{
                    position: 'fixed', left: 16, bottom: 16, zIndex: 70,
                    width: 340, maxWidth: '92vw',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--border)',
                    }}>
                        <Handshake size={14} color="var(--accent)" />
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Open trades</div>
                        <span className="chip" style={{ fontSize: 10 }}>{count}</span>
                        <div style={{ flex: 1 }} />
                        <button className="btn sm ghost" onClick={() => setExpanded(false)}><X size={13} /></button>
                    </div>
                    <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
                        {open.length === 0 && (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-4)', fontSize: 12 }}>
                                No open trades. Hover a player and click the trade icon to propose one.
                            </div>
                        )}
                        {open.map(t => (
                            <TradeRow key={t.id}
                                t={t}
                                room={room}
                                me={me}
                                onOpen={() => { setExpanded(false); onOpenTrade(t); }} />
                        ))}
                    </div>
                </div>
            )}
        </>
    );
}

function TradeRow({ t, room, me, onOpen }) {
    const [expand, setExpand] = useState(false);
    const from = room.players.find(p => p.userId === t.fromUserId);
    const to   = room.players.find(p => p.userId === t.toUserId);
    const iAmParty = me && (t.fromUserId === me.userId || t.toUserId === me.userId);
    const fromAccepted = t.acceptedBy?.includes(t.fromUserId);
    const toAccepted   = t.acceptedBy?.includes(t.toUserId);

    return (
        <div style={{
            background: 'var(--surface-2)',
            border: `1px solid ${iAmParty ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            padding: 10,
            marginBottom: 6,
            fontSize: 12,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dot" style={{ background: from?.color, width: 10, height: 10 }} />
                <b style={{ color: from?.color }}>{from?.username}</b>
                <span style={{ color: 'var(--text-3)' }}>→</span>
                <span className="dot" style={{ background: to?.color, width: 10, height: 10 }} />
                <b style={{ color: to?.color }}>{to?.username}</b>
                <div style={{ flex: 1 }} />
                <button className="btn sm ghost" onClick={() => setExpand(e => !e)} title={expand ? 'Collapse' : 'Expand'}>
                    {expand ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>
                <span>{fromAccepted ? <b style={{ color: 'var(--success)' }}>✓</b> : '·'} {from?.username}</span>
                <span>·</span>
                <span>{toAccepted ? <b style={{ color: 'var(--success)' }}>✓</b> : '·'} {to?.username}</span>
                <div style={{ flex: 1 }} />
                <span>v{t.version}</span>
            </div>
            {expand && (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <Bundle label={`${from?.username} gives`} b={t.offer}   tiles={room.board.tiles} />
                    <Bundle label={`${to?.username} gives`}   b={t.request} tiles={room.board.tiles} />
                </div>
            )}
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <button className="btn sm" onClick={onOpen} style={{ flex: 1, justifyContent: 'center' }}>
                    {iAmParty ? 'Open' : <><Eye size={11} /> Peek</>}
                </button>
            </div>
        </div>
    );
}

function Bundle({ label, b, tiles }) {
    const propNames = (b.properties || []).map(pos => tiles[pos]?.name || `#${pos}`);
    const jail = (b.jailCards?.chance || 0) + (b.jailCards?.chest || 0);
    return (
        <div style={{
            padding: 6,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
        }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
            {b.cash > 0 && <div className="money" style={{ fontSize: 12 }}>${b.cash.toLocaleString()}</div>}
            {propNames.map((n, i) => <div key={i} style={{ fontSize: 11 }}>{n}</div>)}
            {jail > 0 && <div style={{ fontSize: 11, color: 'var(--warning)' }}>Jail free × {jail}</div>}
            {!b.cash && propNames.length === 0 && !jail && (
                <div style={{ fontSize: 11, color: 'var(--text-4)' }}>—</div>
            )}
        </div>
    );
}
