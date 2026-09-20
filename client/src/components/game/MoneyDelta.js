import React, { useEffect, useRef, useState } from 'react';

/* ============================================================
   What just happened to your money, said loudly enough.

   Rent lands as a silent decrement: the number in the corner
   was $1,500 and now it is $1,050, and unless you were watching
   that exact number you missed it. The bigger the swing the
   less excusable that is — losing half your cash should not be
   quieter than a dice roll.

   So every change floats out of the figure that changed, and
   its weight scales with what the change MEANT to that player:
   $200 is a scratch at $2,000 and a catastrophe at $250. Three
   tiers rather than a continuous scale, because a reader is
   being asked to judge "fine / ouch / disaster" at a glance,
   not to read a percentage.
   ============================================================ */

const TIER = (amount, before) => {
    const share = before > 0 ? amount / before : 1;
    if (share >= 0.5 || amount >= 800) return 'huge';
    if (share >= 0.2 || amount >= 300) return 'big';
    return 'small';
};

export default function MoneyDelta({ cash, align = 'right' }) {
    const prev = useRef(cash);
    const [flashes, setFlashes] = useState([]);
    const seq = useRef(0);

    useEffect(() => {
        const before = prev.current;
        if (typeof cash !== 'number' || typeof before !== 'number' || cash === before) {
            prev.current = cash;
            return undefined;
        }
        const delta = cash - before;
        prev.current = cash;
        const f = {
            id: ++seq.current,
            delta,
            tier: TIER(Math.abs(delta), before),
        };
        setFlashes(list => [...list, f].slice(-3));
        const t = setTimeout(() => setFlashes(list => list.filter(x => x.id !== f.id)), 1800);
        return () => clearTimeout(t);
    }, [cash]);

    if (!flashes.length) return null;
    return (
        <span className={`money-deltas money-deltas--${align}`} aria-hidden="true">
            {flashes.map(f => (
                <span key={f.id} className={`money-delta ${f.delta > 0 ? 'up' : 'down'} t-${f.tier}`}>
                    {f.delta > 0 ? '+' : '−'}${Math.abs(f.delta).toLocaleString()}
                </span>
            ))}
        </span>
    );
}
