import React, { useEffect, useState } from 'react';
import { Gavel, X } from 'lucide-react';
import Deed from './Deed';
import Puck from '../common/Puck';
import './menus.css';

// The auction block: the deed up for sale beside the bidding card. The clock
// resets on every bid; when it runs out the top bid wins.
export default function AuctionModal({ room, me, act }) {
    const a = room.auction;
    const [bid, setBid] = useState(0);
    const [msLeft, setMsLeft] = useState(8000);

    useEffect(() => {
        if (a) setBid(b => Math.max(Number(b) || 0, a.currentBid + a.minIncrement));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [a?.currentBid]);
    useEffect(() => {
        if (!a) return;
        const tick = () => setMsLeft(Math.max(0, a.endsAt - Date.now()));
        tick();
        const t = setInterval(tick, 100);
        return () => clearInterval(t);
    }, [a]);

    if (!a || !me) return null;

    const def = room.board.tiles[a.pos];
    const minBid    = a.currentBid + a.minIncrement;
    const inAuction = a.participants.includes(me.userId);
    const passed    = a.passed.includes(me.userId);
    const topBidder = a.currentBidder === me.userId;
    const validBid  = Number.isFinite(bid) && bid >= minBid;
    const canBid    = inAuction && !passed && !topBidder && validBid && me.cash >= bid;
    const bidding   = inAuction && !passed && !topBidder;
    const quick = [minBid, minBid + 40, minBid + 90].filter(v => v <= me.cash);
    const leader = room.players.find(p => p.userId === a.currentBidder);
    const secs = Math.ceil(msLeft / 1000);

    return (
        <div className="modal-backdrop" style={{ zIndex: 80 }}>
            <div className="auction dealt">
                <div className="auction-deed"><Deed def={def} state={room.tileState[a.pos]} room={room} compact /></div>

                <div className="paper framed auction-card">
                    <div className="band chance" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <Gavel size={24} style={{ flex: '0 0 auto' }} />
                            <h2 className="print" style={{ fontSize: 30, margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.name}</h2>
                        </div>
                        <div className={`auction-clock mono${secs <= 3 ? ' hot' : ''}`} aria-live="polite">{secs}s</div>
                    </div>
                    <div className="auction-timer"><span style={{ transform: `scaleX(${Math.min(1, msLeft / 8000)})` }} /></div>

                    <div style={{ padding: '14px 20px 18px' }}>
                        <div className="auction-top">
                            <span className="mono auction-amount">${(a.currentBid || 0).toLocaleString()}</span>
                            {leader
                                ? <span className="auction-leader"><Puck color={leader.color} label={(leader.username[0] || '?').toUpperCase()} size={28} /> {leader.userId === me.userId ? 'You' : leader.username}</span>
                                : <span className="auction-leader" style={{ color: 'var(--ink-3)' }}>No bids yet</span>}
                        </div>

                        {bidding && (
                            <>
                                <div className="auction-quick">
                                    {quick.map(v => (
                                        <button key={v} className="btn paper-ghost" onClick={() => act('auction-bid', { amount: v })}>${v}</button>
                                    ))}
                                </div>
                                <div className="auction-custom">
                                    <input
                                        type="number" inputMode="numeric" aria-label="Your bid"
                                        className="field" style={{ fontFamily: 'var(--font-mono)', textAlign: 'center' }}
                                        min={minBid}
                                        value={Number.isFinite(bid) ? bid : ''}
                                        onChange={e => setBid(e.target.value === '' ? NaN : Math.floor(Number(e.target.value)))}
                                        onKeyDown={e => { if (e.key === 'Enter' && canBid) act('auction-bid', { amount: bid }); }}
                                    />
                                    <button className="btn ink" disabled={!canBid} onClick={() => act('auction-bid', { amount: bid })}>
                                        {validBid ? `Bid $${bid}` : `Min $${minBid}`}
                                    </button>
                                </div>
                            </>
                        )}

                        <div className="auction-status">
                            {topBidder && <>You're the top bidder — it's yours if nobody beats it.</>}
                            {!inAuction && <>You're watching this auction.</>}
                            {passed && !topBidder && <>You passed.</>}
                            {bidding && me.cash < minBid && <>You can't afford the next bid (you have ${me.cash.toLocaleString()}).</>}
                        </div>

                        {bidding && (
                            <button className="btn paper-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => act('auction-pass')}>
                                <X size={14} /> Pass
                            </button>
                        )}

                        <div className="auction-list">
                            <span>List price</span><b className="mono">${def.price}</b>
                        </div>

                        <div className="auction-who">
                            {a.participants.map(uid => {
                                const p = room.players.find(x => x.userId === uid);
                                if (!p) return null;
                                const out = a.passed.includes(uid);
                                return (
                                    <span key={uid} className={out ? 'out' : ''} title={out ? `${p.username} passed` : p.username}>
                                        <Puck color={p.color} label={(p.username[0] || '?').toUpperCase()} size={28} /> {p.username}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
