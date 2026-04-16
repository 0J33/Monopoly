import React, { useEffect, useState } from 'react';
import { Gavel, X } from 'lucide-react';

export default function AuctionModal({ room, me, act }) {
    const a = room.auction;
    const [bid, setBid] = useState(0);
    const [secLeft, setSecLeft] = useState(8);

    useEffect(() => { if (a) setBid(Math.max(bid, a.currentBid + a.minIncrement)); /* eslint-disable-next-line */ }, [a?.currentBid]);
    useEffect(() => {
        if (!a) return;
        const t = setInterval(() => {
            setSecLeft(Math.max(0, Math.ceil((a.endsAt - Date.now()) / 1000)));
        }, 200);
        return () => clearInterval(t);
    }, [a]);

    if (!a || !me) return null;

    const def = room.board.tiles[a.pos];
    const inAuction = a.participants.includes(me.userId);
    const passed    = a.passed.includes(me.userId);
    const topBidder = a.currentBidder === me.userId;
    const canBid    = inAuction && !passed && !topBidder && me.cash >= bid;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(0,0,0,0.65)',
            display: 'grid', placeItems: 'center',
            animation: 'fadeIn 0.15s ease-out',
        }}>
            <div className="fade-in" style={{
                width: 460, background: 'var(--surface)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
            }}>
                <div style={{ background: def.color || 'var(--accent)', height: 6 }} />
                <div style={{ padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Gavel size={20} color="var(--warning)" />
                        <div style={{ fontSize: 20, fontWeight: 800 }}>Auction: {def.name}</div>
                        <div style={{ flex: 1 }} />
                        <div className="chip mono" style={{
                            color: secLeft < 3 ? 'var(--danger)' : 'var(--text-2)',
                            fontSize: 13, fontWeight: 700,
                        }}>{secLeft}s</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 20 }}>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>List price</div>
                            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>${def.price}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Top bid</div>
                            <div className="money" style={{ fontSize: 22, fontWeight: 700 }}>
                                ${a.currentBid || 0}
                                {a.currentBidder && (
                                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>
                                        by {room.players.find(p => p.userId === a.currentBidder)?.username}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {inAuction && !passed && !topBidder && (
                        <div style={{ marginTop: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button className="btn sm" onClick={() => setBid(b => Math.max(a.currentBid + a.minIncrement, b - 10))}>−10</button>
                            <input
                                type="number"
                                style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, textAlign: 'center' }}
                                min={a.currentBid + a.minIncrement}
                                value={bid}
                                onChange={e => setBid(Number(e.target.value))}
                            />
                            <button className="btn sm" onClick={() => setBid(b => b + 10)}>+10</button>
                            <button className="btn sm" onClick={() => setBid(b => b + 50)}>+50</button>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <button
                            className="btn primary"
                            style={{ flex: 1, justifyContent: 'center' }}
                            disabled={!canBid}
                            onClick={() => act('auction-bid', { amount: bid })}
                        >Bid ${bid}</button>
                        <button
                            className="btn"
                            disabled={!inAuction || passed}
                            onClick={() => act('auction-pass')}
                        ><X size={14} /> Pass</button>
                    </div>

                    <div style={{ marginTop: 18, fontSize: 12, color: 'var(--text-3)' }}>
                        Participants: {a.participants.map(uid => {
                            const p = room.players.find(x => x.userId === uid);
                            const pass = a.passed.includes(uid);
                            return p ? <span key={uid} style={{
                                color: pass ? 'var(--text-4)' : p.color,
                                textDecoration: pass ? 'line-through' : 'none',
                                marginRight: 8, fontWeight: 600,
                            }}>{p.username}</span> : null;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
