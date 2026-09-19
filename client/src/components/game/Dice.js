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

// Rotation (in degrees) that brings each value's face to the front of the cube.
// Face layout on the cube: 1=front, 6=back, 3=right, 4=left, 2=top, 5=bottom
// (opposite faces sum to 7, like a real die).
const SHOW = {
    1: [0, 0],
    2: [-90, 0],
    3: [0, -90],
    4: [0, 90],
    5: [90, 0],
    6: [0, 180],
};

// Cycle through random faces while the dice tumble, then freeze on the real
// result a beat before the CSS settle so the pop lands on the actual number.
const CYCLE_MS = 100;
const SHAKE_END_MS = 820;      // stop cycling; freeze on the real result
const TOTAL_MS = 1100;         // matches the roll timing in Game.js

export default function Dice({ dice, rolling }) {
    const [shown, setShown] = useState(dice || [1, 1]);
    // Monotonic spin accumulators (per die) so the cube keeps rotating forward
    // and never unwinds when it settles on the final face.
    const [spin, setSpin] = useState([0, 0]);
    const timerRef = useRef(null);
    const spinRef = useRef([0, 0]);
    const prevDice = useRef(dice);

    useEffect(() => {
        if (!rolling) {
            if (dice) setShown(dice);
            return;
        }
        const start = Date.now();
        const tick = () => {
            const elapsed = Date.now() - start;
            if (elapsed < SHAKE_END_MS) {
                setShown(prev => {
                    let a = 1 + Math.floor(Math.random() * 6);
                    let b = 1 + Math.floor(Math.random() * 6);
                    if (prev && a === prev[0] && b === prev[1]) a = 1 + (a % 6);
                    return [a, b];
                });
                // Add a chunky forward tumble on every tick.
                spinRef.current = [spinRef.current[0] + 1, spinRef.current[1] + 1];
                setSpin([...spinRef.current]);
                timerRef.current = setTimeout(tick, CYCLE_MS);
            } else if (dice) {
                setShown(dice);
                // One last generous spin so the settle visibly rotates in.
                spinRef.current = [spinRef.current[0] + 2, spinRef.current[1] + 3];
                setSpin([...spinRef.current]);
            }
        };
        tick();
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [rolling, dice]);

    useEffect(() => {
        if (!rolling && dice && prevDice.current !== dice) {
            setShown(dice);
            prevDice.current = dice;
        }
    }, [dice, rolling]);

    const a = shown && shown[0] != null ? shown[0] : 1;
    const b = shown && shown[1] != null ? shown[1] : 1;
    const dim = !shown || shown[0] == null;

    return (
        <div className="dice-wrap" style={dim ? { opacity: 0.35 } : undefined}>
            <Die value={a} rolling={rolling} spins={spin[0]} />
            <Die value={b} rolling={rolling} spins={spin[1]} />
        </div>
    );
}

function Die({ value, rolling, spins }) {
    const [sx, sy] = SHOW[value] || SHOW[1];
    // Full-turn multiples (360) on BOTH axes: each tick the cube does a whole
    // extra spin AND reorients to the new face, so it visibly tumbles yet always
    // comes to rest with the rolled face flat toward the viewer.
    const rx = sx + spins * 360;
    const ry = sy + spins * 360;
    return (
        <div className="dice-scene">
            <div
                className={`dice-cube ${rolling ? 'rolling' : ''}`}
                style={{ transform: `translateZ(-0.5em) rotateX(${rx}deg) rotateY(${ry}deg)` }}
            >
                <Face face="front"  value={1} />
                <Face face="back"   value={6} />
                <Face face="right"  value={3} />
                <Face face="left"   value={4} />
                <Face face="top"    value={2} />
                <Face face="bottom" value={5} />
            </div>
        </div>
    );
}

function Face({ face, value }) {
    const pips = PIPS[value] || [];
    return (
        <div className={`dice-face dice-${face}`}>
            {Array.from({ length: 9 }).map((_, i) => {
                const row = Math.floor(i / 3), col = i % 3;
                const on = pips.some(([r, c]) => r === row && c === col);
                return <span key={i} className={on ? 'die-pip' : 'die-pip-off'} />;
            })}
        </div>
    );
}

// Export so Game.js can keep its setTimeout in sync with the CSS total.
export const DICE_TOTAL_MS = TOTAL_MS;
