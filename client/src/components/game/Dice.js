import React, { useEffect, useRef, useState } from 'react';

// Pip positions for each face (1..6) in a 3x3 grid.
const PIPS = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

// Cycle through random faces while the dice shake. We freeze on the real
// result a bit before the CSS animation ends so the final pop lands on the
// actual number.
const CYCLE_MS = 90;
const SHAKE_END_MS = 800;      // stop cycling; freeze on the real result
const TOTAL_MS = 1100;         // matches diceRoll keyframes in board.css

export default function Dice({ dice, rolling }) {
    const [shown, setShown] = useState(dice || [1, 1]);
    const timerRef = useRef(null);
    const prevDice = useRef(dice);

    useEffect(() => {
        // Not rolling → mirror the real roll result (or keep last shown).
        if (!rolling) {
            if (dice) setShown(dice);
            return;
        }
        const start = Date.now();
        const tick = () => {
            const elapsed = Date.now() - start;
            if (elapsed < SHAKE_END_MS) {
                // Keep flickering — ensure each tick actually changes at least
                // one value so the eye sees motion.
                setShown(prev => {
                    let a = 1 + Math.floor(Math.random() * 6);
                    let b = 1 + Math.floor(Math.random() * 6);
                    if (prev && a === prev[0] && b === prev[1]) a = 1 + (a % 6);
                    return [a, b];
                });
                timerRef.current = setTimeout(tick, CYCLE_MS);
            } else if (dice) {
                // Lock the final value well before the rotation finishes, so
                // the tumble visibly settles on the actual result.
                setShown(dice);
            }
        };
        tick();
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [rolling, dice]);

    // If a new dice value arrives while not rolling (e.g. reconnect), adopt it.
    useEffect(() => {
        if (!rolling && dice && prevDice.current !== dice) {
            setShown(dice);
            prevDice.current = dice;
        }
    }, [dice, rolling]);

    if (!shown || shown[0] == null) {
        return (
            <div className="dice-wrap" style={{ opacity: 0.3 }}>
                <Die value={1} rolling={false} />
                <Die value={1} rolling={false} />
            </div>
        );
    }
    return (
        <div className="dice-wrap">
            <Die value={shown[0]} rolling={rolling} />
            <Die value={shown[1]} rolling={rolling} />
        </div>
    );
}

function Die({ value, rolling }) {
    const pips = PIPS[value] || [];
    const grid = Array.from({ length: 9 }).map((_, i) => {
        const row = Math.floor(i / 3), col = i % 3;
        return pips.some(([r, c]) => r === row && c === col);
    });
    return (
        <div className={`die ${rolling ? 'rolling' : ''}`}>
            {grid.map((on, i) => (
                <div key={i} style={{ padding: 2, display: 'grid', placeItems: 'center' }}>
                    {on && <span className="die-pip" />}
                </div>
            ))}
        </div>
    );
}

// Export so Game.js can keep its setTimeout in sync with the CSS total.
export const DICE_TOTAL_MS = TOTAL_MS;
