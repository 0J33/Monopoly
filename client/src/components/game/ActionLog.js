import React, { useEffect, useRef } from 'react';

// Renders a formatted event history. Log entries have `kind` + varying payload;
// we translate each into a short human string with player colors. Tile names
// are looked up from the board so the log says "Paris" not "#34".
export default function ActionLog({ log, players, tiles }) {
    const ref = useRef(null);
    useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log?.length]);

    const nameOf = (uid) => {
        const p = players.find(x => x.userId === uid);
        return p ? <span style={{ color: p.color, fontWeight: 700 }}>{p.username}</span> : 'someone';
    };
    const tile = (pos) => {
        const t = tiles?.[pos];
        if (!t) return `#${pos}`;
        return <b style={{ color: t.color || 'var(--text)' }}>{t.name}</b>;
    };

    return (
        <div className="card" ref={ref} style={{
            flex: 1, overflowY: 'auto', padding: 12,
            display: 'flex', flexDirection: 'column', gap: 4,
            fontSize: 12, lineHeight: 1.55, color: 'var(--text-2)',
            minHeight: 0,
        }}>
            {(!log || log.length === 0) && <div style={{ color: 'var(--text-4)', textAlign: 'center', paddingTop: 16 }}>Nothing happened yet.</div>}
            {log?.map(e => <LogRow key={e.id} e={e} nameOf={nameOf} tile={tile} />)}
        </div>
    );
}

function LogRow({ e, nameOf, tile }) {
    let body = null;
    switch (e.kind) {
        case 'game-start': body = <em style={{ color: 'var(--text-3)' }}>Game started.</em>; break;
        case 'turn-start': body = <div style={{ color: 'var(--text-3)', marginTop: 4, borderTop: '1px dashed var(--border)', paddingTop: 4 }}>— {nameOf(e.userId)}'s turn</div>; break;
        case 'roll':       body = <>{nameOf(e.userId)} rolled <b className="mono">{e.dice[0]} + {e.dice[1]} = {e.dice[0] + e.dice[1]}</b>{e.isDouble && <span style={{ color: 'var(--warning)', fontWeight: 700 }}> · doubles!</span>}</>; break;
        case 'land':       body = <>{nameOf(e.userId)} landed on {tile(e.pos)}</>; break;
        case 'pass-go':    body = <>{nameOf(e.userId)} passed GO, collected <span className="money">${e.amount}</span></>; break;
        case 'buy':        body = <>{nameOf(e.userId)} bought {tile(e.pos)} for <span className="money">${e.price}</span></>; break;
        case 'rent':       body = <>{nameOf(e.fromUserId)} paid {nameOf(e.toUserId)} <span className="money">${e.amount}</span> rent</>; break;
        case 'tax':        body = <>{nameOf(e.userId)} paid tax <span className="money">${e.amount}</span></>; break;
        case 'go-to-jail': body = <>{nameOf(e.userId)} went to Jail</>; break;
        case 'jail-pay':   body = <>{nameOf(e.userId)} paid to leave jail</>; break;
        case 'jail-card':  body = <>{nameOf(e.userId)} used a Get Out of Jail Free card</>; break;
        case 'parking-payout': body = <>{nameOf(e.userId)} collected <span className="money">${e.amount}</span> from the pot</>; break;
        case 'mortgage':   body = <>{nameOf(e.userId)} mortgaged {tile(e.pos)} for <span className="money">${e.amount}</span></>; break;
        case 'unmortgage': body = <>{nameOf(e.userId)} unmortgaged {tile(e.pos)} (<span className="money">-${e.amount}</span>)</>; break;
        case 'build':      body = <>{nameOf(e.userId)} built on {tile(e.pos)} ({e.houses >= 5 ? 'hotel' : e.houses + ' house' + (e.houses === 1 ? '' : 's')})</>; break;
        case 'sell-house': body = <>{nameOf(e.userId)} sold a building on {tile(e.pos)}</>; break;
        case 'card':       body = <>{nameOf(e.userId)} drew <i style={{ color: e.deck === 'chance' ? 'var(--warning)' : 'var(--accent-2)' }}>{e.deck}</i>: {e.text}</>; break;
        case 'auction-start': body = <>Auction: <b>{e.name}</b></>; break;
        case 'auction-end':   body = e.winnerId ? <>{nameOf(e.winnerId)} won the auction for <span className="money">${e.price}</span></> : <>Auction ended with no bids.</>; break;
        case 'trade-open':    body = <>{nameOf(e.fromUserId)} proposed a trade to {nameOf(e.toUserId)}</>; break;
        case 'trade-update':  body = <>Trade revised.</>; break;
        case 'trade-executed':body = <><b style={{ color: 'var(--success)' }}>Trade completed.</b></>; break;
        case 'trade-close':   body = <>Trade {e.status}.</>; break;
        case 'bankrupt':      body = <><span style={{ color: 'var(--danger)', fontWeight: 700 }}>{nameOf(e.userId)} went bankrupt</span>{e.creditor ? <> to {nameOf(e.creditor)}</> : ''}.</>; break;
        case 'victory':       body = <><b style={{ color: 'var(--success)' }}>🏆 {nameOf(e.userId)} wins!</b></>; break;
        default: body = <em style={{ color: 'var(--text-4)' }}>{e.kind}</em>;
    }
    return <div>{body}</div>;
}
