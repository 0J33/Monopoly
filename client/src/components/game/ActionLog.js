import React, { useEffect, useRef } from 'react';

// Renders a formatted event history. Log entries have `kind` + varying payload;
// we translate each into a short human string with player colors. Tile names
// are looked up from the board so the log says "Paris" not "#34".
//
// Follows the newest entry unless the reader has scrolled up to look at
// something older.
export default function ActionLog({ log, players, tiles, board, padBottom = 0 }) {
    const ref = useRef(null);
    const pinned = useRef(true);
    const lastId = log?.[log.length - 1]?.id;

    useEffect(() => {
        const el = ref.current;
        if (el && pinned.current) el.scrollTop = el.scrollHeight;
    }, [lastId]);

    function onScroll() {
        const el = ref.current;
        if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }

    const nameOf = (uid) => {
        const p = players.find(x => x.userId === uid);
        return p ? <span className="log-name" style={{ color: p.color }}>{p.username}</span> : 'someone';
    };
    const tile = (pos) => {
        const t = tiles?.[pos];
        if (!t) return `#${pos}`;
        return <b style={{ color: t.color || 'var(--text)' }}>{t.name}</b>;
    };
    const money = (n) => <span className="money">${Number(n || 0).toLocaleString()}</span>;
    const ctx = { nameOf, tile, money, board };

    return (
        <div className="card log-card" ref={ref} onScroll={onScroll} style={{
            flex: 1, overflowY: 'auto', padding: 12, paddingBottom: 12 + padBottom,
            display: 'flex', flexDirection: 'column', gap: 4,
            fontSize: 12, lineHeight: 1.55, color: 'var(--text-2)',
            minHeight: 0,
        }}>
            {(!log || log.length === 0) && <div style={{ color: 'var(--text-4)', textAlign: 'center', paddingTop: 16 }}>Nothing happened yet.</div>}
            {log?.map(e => <LogRow key={e.id} e={e} {...ctx} />)}
        </div>
    );
}

function bundleText(b, tiles, money) {
    const parts = [];
    for (const pos of b?.properties || []) parts.push(<b key={pos} style={{ color: tiles?.[pos]?.color || 'var(--text)' }}>{tiles?.[pos]?.name}</b>);
    if (b?.cash) parts.push(<React.Fragment key="c">{money(b.cash)}</React.Fragment>);
    const jail = (b?.jailCards?.chance || 0) + (b?.jailCards?.chest || 0);
    if (jail) parts.push(<React.Fragment key="j">{jail} jail card{jail > 1 ? 's' : ''}</React.Fragment>);
    if (!parts.length) return 'nothing';
    return parts.map((p, i) => <React.Fragment key={i}>{i > 0 && (i === parts.length - 1 ? ' and ' : ', ')}{p}</React.Fragment>);
}

function LogRow({ e, nameOf, tile, money, board }) {
    const jail = board?.jailNoun || 'Jail';
    const deck = e.deckName || board?.deckNames?.[e.deck] || (e.deck === 'chance' ? 'Chance' : 'Community Chest');
    const creditor = (c) => (!c || c === 'bank' ? 'the bank' : nameOf(c));
    let body = null;
    switch (e.kind) {
        case 'game-start': body = <em style={{ color: 'var(--text-3)' }}>Game started.</em>; break;
        case 'turn-start': body = <div className="log-turn">— {nameOf(e.userId)}'s turn</div>; break;
        case 'roll':       body = <>{nameOf(e.userId)} rolled <b className="mono">{e.dice[0]} + {e.dice[1]} = {e.dice[0] + e.dice[1]}</b>{e.isDouble && <span style={{ color: 'var(--warning)', fontWeight: 700 }}> · doubles!</span>}</>; break;
        case 'land':       body = e.viaCard ? <>{nameOf(e.userId)} moved to {tile(e.pos)}</> : <>{nameOf(e.userId)} landed on {tile(e.pos)}</>; break;
        case 'pass-go':    body = e.landed
                                ? <>{nameOf(e.userId)} collected {money(e.amount)} salary</>
                                : <>{nameOf(e.userId)} passed {board?.tiles?.[0]?.name || 'GO'}, collected {money(e.amount)}</>; break;
        case 'buy':        body = <>{nameOf(e.userId)} bought {tile(e.pos)} for {money(e.price)}</>; break;
        case 'decline-buy':body = <>{nameOf(e.userId)} didn't buy {tile(e.pos)}</>; break;
        case 'rent':       body = <>{nameOf(e.fromUserId)} paid {nameOf(e.toUserId)} {money(e.amount)} rent</>; break;
        case 'no-rent':    body = <>No rent: {tile(e.pos)} {e.why === 'mortgaged' ? 'is mortgaged' : <>— {nameOf(e.toUserId)} is in {jail}</>}</>; break;
        case 'tax':        body = <>{nameOf(e.userId)} paid {money(e.amount)} {e.pos != null ? tile(e.pos) : 'tax'}</>; break;
        case 'repairs':    body = e.amount ? <>{nameOf(e.userId)} paid {money(e.amount)} for repairs ({e.houses} house{e.houses === 1 ? '' : 's'}, {e.hotels} hotel{e.hotels === 1 ? '' : 's'})</> : <>{nameOf(e.userId)} has no buildings to repair</>; break;
        case 'utility-roll': body = <>{nameOf(e.userId)} rolled <b className="mono">{e.dice[0]} + {e.dice[1]}</b> for the utility</>; break;
        case 'go-to-jail': body = <>{nameOf(e.userId)} went to {jail}{e.why === 'doubles' ? ' for rolling three doubles' : ''}</>; break;
        case 'jail-stay':  body = <>{nameOf(e.userId)} stays in {jail} (attempt {e.attempt} of {e.of})</>; break;
        case 'jail-escape':body = e.method === 'doubles'
                                ? <>{nameOf(e.userId)} rolled doubles and got out of {jail}</>
                                : <>{nameOf(e.userId)} paid {money(e.amount)} and left {jail}</>; break;
        case 'jail-pay':   body = <>{nameOf(e.userId)} paid {e.amount ? money(e.amount) : 'the fine'} to leave {jail}</>; break;
        case 'jail-card':  body = <>{nameOf(e.userId)} used a Get Out of {jail} Free card</>; break;
        case 'parking-payout': body = <>{nameOf(e.userId)} collected {money(e.amount)} from the pot</>; break;
        case 'mortgage':   body = <>{nameOf(e.userId)} mortgaged {tile(e.pos)} for {money(e.amount)}</>; break;
        case 'unmortgage': body = <>{nameOf(e.userId)} unmortgaged {tile(e.pos)} for {money(e.amount)}</>; break;
        case 'build':      body = <>{nameOf(e.userId)} built {e.houses >= 5 ? 'a hotel' : 'a house'} on {tile(e.pos)}{e.houses < 5 ? ` (${e.houses})` : ''}</>; break;
        case 'sell-house': body = <>{nameOf(e.userId)} sold a building on {tile(e.pos)}{e.amount ? <> for {money(e.amount)}</> : null}</>; break;
        case 'card':       body = <>{nameOf(e.userId)} drew <i style={{ color: e.deck === 'chance' ? 'var(--warning)' : 'var(--accent-2)' }}>{deck}</i>: {e.text}</>; break;
        case 'debt':       body = <span style={{ color: 'var(--danger)' }}>{nameOf(e.userId)} can't pay {money(e.amount)} to {creditor(e.creditor)} — must raise cash or go bankrupt</span>; break;
        case 'debt-paid':  body = <>{nameOf(e.userId)} settled {money(e.amount)} owed to {creditor(e.creditor)}</>; break;
        case 'auction-start': body = <>Auction: {e.pos != null ? tile(e.pos) : <b>{e.name}</b>}</>; break;
        case 'auction-end':   body = e.winnerId ? <>{nameOf(e.winnerId)} won the auction for {tile(e.pos)} at {money(e.price)}</> : <>Auction for {tile(e.pos)} ended with no bids.</>; break;
        case 'auction-void-bid': body = <>{nameOf(e.userId)}'s bid of {money(e.amount)} no longer stands — they can't pay it</>; break;
        case 'trade-open':    body = <>{nameOf(e.fromUserId)} proposed a trade to {nameOf(e.toUserId)}</>; break;
        case 'trade-update':  body = <>{nameOf(e.by)} changed the {e.fromUserId ? <>{nameOf(e.fromUserId)} ↔ {nameOf(e.toUserId)} </> : ''}trade</>; break;
        case 'trade-executed':body = e.offer
                                ? <><b style={{ color: 'var(--success)' }}>Trade:</b> {nameOf(e.fromUserId)} gave {bundleText(e.offer, board?.tiles, money)} to {nameOf(e.toUserId)} for {bundleText(e.request, board?.tiles, money)}</>
                                : <><b style={{ color: 'var(--success)' }}>Trade completed.</b></>; break;
        case 'trade-close':   body = e.status === 'failed'
                                ? <>The {nameOf(e.fromUserId)} ↔ {nameOf(e.toUserId)} trade fell through ({tradeFail(e.reason)})</>
                                : <>{nameOf(e.by)} {e.status === 'cancelled' ? 'withdrew' : 'turned down'} {e.status === 'cancelled' ? 'their trade offer' : <>{nameOf(e.fromUserId)}'s trade</>}</>; break;
        case 'bankrupt':      body = <><span style={{ color: 'var(--danger)', fontWeight: 700 }}>{nameOf(e.userId)} {e.resigned ? 'left the game' : 'went bankrupt'}</span>{e.creditor ? <> — everything goes to {nameOf(e.creditor)}</> : ''}.</>; break;
        case 'victory':       body = <><b style={{ color: 'var(--success)' }}>🏆 {nameOf(e.userId)} wins!</b></>; break;
        default: body = <em style={{ color: 'var(--text-4)' }}>{e.kind}</em>;
    }
    return <div>{body}</div>;
}

function tradeFail(reason) {
    return {
        'from-insufficient': 'not enough cash', 'to-insufficient': 'not enough cash',
        'from-not-owner': 'a property changed hands', 'to-not-owner': 'a property changed hands',
        'sell-buildings-first': 'buildings went up', 'from-no-card': 'jail card gone', 'to-no-card': 'jail card gone',
    }[reason] || 'no longer possible';
}
