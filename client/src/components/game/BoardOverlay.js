import React, { useEffect, useRef, useState } from 'react';
import { tileCenter } from './layout';

// Renders transient in-board animations driven by the events stream:
//   money pops, go-bursts, jail flashes, buy sparkles, and banner effects
//   (auction hammer, trade executed, victory).
// Each effect has a unique key and auto-removes after its CSS animation ends.
const LIFESPAN_MS = 2200;

export default function BoardOverlay({ room, events, players }) {
    const [effects, setEffects] = useState([]);
    const seenRef = useRef(new Set());

    useEffect(() => {
        if (!events) return;
        const added = [];
        for (const e of events) {
            if (seenRef.current.has(e._k)) continue;
            seenRef.current.add(e._k);
            const spawned = spawn(e, room, players);
            if (spawned) added.push(...spawned);
        }
        if (added.length) {
            setEffects(prev => [...prev, ...added]);
            for (const fx of added) {
                setTimeout(() => setEffects(prev => prev.filter(x => x.id !== fx.id)), fx.ttl || LIFESPAN_MS);
            }
        }
    }, [events, room, players]);

    return (
        <div className="board-overlay">
            {effects.map(fx => renderEffect(fx))}
        </div>
    );
}

let _id = 0;
const nid = () => `fx${_id++}`;

function spawn(e, room, players) {
    if (!e) return null;
    const out = [];

    if (e.type === 'money' && e.amount > 0 && e.reason !== 'pass-go') {
        const pos = anchorPos(e, room, players);
        if (pos != null) out.push({ id: nid(), kind: 'money', pos, amount: e.amount, sign: e.from === 'bank' || e.from === 'pot' ? '+' : (e.to === 'bank' || e.to === 'pot' ? '-' : '+') });
    }

    if (e.type === 'money' && e.reason === 'pass-go') {
        out.push({ id: nid(), kind: 'go-burst', amount: e.amount, ttl: 1900 });
    }

    if (e.type === 'buy') {
        const color = players.find(p => p.userId === e.userId)?.color || 'var(--success)';
        out.push({ id: nid(), kind: 'buy-sparkle', pos: e.pos, color, ttl: 950 });
    }

    if (e.type === 'jail') {
        out.push({ id: nid(), kind: 'jail-flash', ttl: 900 });
        out.push({ id: nid(), kind: 'banner', text: 'BUSTED', color: 'var(--danger)', ttl: 1800 });
    }

    if (e.type === 'jail-escape') {
        const label = e.method === 'doubles' ? 'DOUBLES!' : e.method === 'card' ? 'FREE!' : 'OUT';
        out.push({ id: nid(), kind: 'banner', text: label, color: 'var(--success)', ttl: 1400 });
    }

    if (e.type === 'auction-start') {
        out.push({ id: nid(), kind: 'banner', text: 'AUCTION', color: 'var(--warning)', ttl: 1300 });
    }
    if (e.type === 'trade-executed') {
        out.push({ id: nid(), kind: 'banner', text: 'DEAL!', color: 'var(--success)', ttl: 1400 });
    }

    return out;
}

function anchorPos(e, room) {
    // Prefer anchoring a money pop on the paying player's current tile so
    // you see the number float off them.
    const p = room?.players.find(pl => pl.userId === e.from || pl.userId === e.to);
    return p ? p.position : null;
}

function renderEffect(fx) {
    if (fx.kind === 'money') {
        const [x, y] = tileCenter(fx.pos);
        return (
            <div key={fx.id}
                className={`money-pop ${fx.sign === '+' ? 'positive' : 'negative'}`}
                style={{ left: x + '%', top: y + '%' }}>
                {fx.sign}${fx.amount.toLocaleString()}
            </div>
        );
    }
    if (fx.kind === 'go-burst') {
        const [x, y] = tileCenter(0);  // GO tile center
        return (
            <div key={fx.id} className="go-burst" style={{ left: x + '%', top: y + '%' }}>
                +${fx.amount}
            </div>
        );
    }
    if (fx.kind === 'buy-sparkle') {
        const [x, y] = tileCenter(fx.pos);
        return (
            <div key={fx.id} className="buy-sparkle"
                style={{ left: x + '%', top: y + '%', color: fx.color }} />
        );
    }
    if (fx.kind === 'jail-flash') {
        return <div key={fx.id} className="jail-flash" />;
    }
    if (fx.kind === 'banner') {
        return (
            <div key={fx.id} className="banner" style={{ color: fx.color || 'white' }}>
                {fx.text}
            </div>
        );
    }
    return null;
}
