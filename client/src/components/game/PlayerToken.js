import React, { useEffect, useRef, useState } from 'react';
import { tokenCenter, tileRect } from './layout';
import { DICE_TOTAL_MS } from './Dice';

// Tokens sharing a tile fan out so none hides another. On a side tile they
// spread across the tile's width inside the token strip; on a corner they
// sit in a small grid. Offsets are in % of the board, so they scale with it.
// Three or more on one tile also shrink a little so the row still fits.
const SIDE_PCT = 8.22;      // matches layout.js
function stackOffset(side, idx, count) {
    if (count <= 1) return [0, 0];
    if (side === 'corner') {
        const cols = count <= 4 ? 2 : 3;
        const rows = Math.ceil(count / cols);
        const step = 3.4;
        const col = idx % cols, row = Math.floor(idx / cols);
        return [(col - (cols - 1) / 2) * step, (row - (rows - 1) / 2) * step];
    }
    const step = Math.min(3.2, (SIDE_PCT * 0.92) / count);
    const d = (idx - (count - 1) / 2) * step;
    if (side === 'top' || side === 'bottom') return [d, 0];
    return [0, d];
}
function stackScale(count) {
    return count >= 4 ? 0.72 : count === 3 ? 0.85 : 1;
}

// Tile-by-tile walk. Watches incoming events for this player's `move` events
// and steps the displayed position along the `path` so the token visibly
// walks across each tile instead of teleporting.
export const STEP_MS = 160;
// A token waits for the dice to settle before walking, and pauses on a
// Chance / Chest square while the card is read.
export const CARD_PAUSE_MS = 1400;

export default function PlayerToken({ player, isActive, stackIndex, stackCount = 1, events, onHover }) {
    const [displayPos, setDisplayPos] = useState(player.position);
    const [isJailShaking, setJailShaking] = useState(false);
    const [walking, setWalking] = useState(false);
    const queueRef = useRef([]);
    const runningRef = useRef(false);
    const lastSeenVersion = useRef(null);

    // Feed new move events for this player into the queue.
    useEffect(() => {
        if (!events) return;
        const idx = events.findIndex(e => e._k === lastSeenVersion.current);
        const newEvents = idx === -1 ? events : events.slice(idx + 1);
        if (newEvents.length) lastSeenVersion.current = newEvents[newEvents.length - 1]._k;
        for (const e of newEvents) {
            if (e.type === 'roll' && e.userId === player.userId) {
                queueRef.current.push({ kind: 'wait', ms: DICE_TOTAL_MS });
            }
            if (e.type === 'draw-card' && e.userId === player.userId) {
                queueRef.current.push({ kind: 'wait', ms: CARD_PAUSE_MS });
            }
            if (e.type === 'move' && e.userId === player.userId) {
                queueRef.current.push({ kind: 'walk', path: e.path });
            }
            if (e.type === 'jail' && e.userId === player.userId) {
                queueRef.current.push({ kind: 'jail' });
            }
            if (e.type === 'jail-escape' && e.userId === player.userId) {
                queueRef.current.push({ kind: 'jail-escape' });
            }
        }
        drain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, player.userId]);

    // If the server snapshot diverges from our display (reconnect, etc.),
    // catch up without the walk.
    useEffect(() => {
        if (queueRef.current.length === 0 && !runningRef.current) {
            setDisplayPos(player.position);
        }
    }, [player.position]);

    function drain() {
        if (runningRef.current) return;
        const next = queueRef.current.shift();
        if (!next) return;
        runningRef.current = true;

        if (next.kind === 'walk') {
            const path = next.path || [];
            let i = 0;
            setWalking(true);
            const step = () => {
                if (i >= path.length) {
                    setWalking(false);
                    runningRef.current = false;
                    drain();
                    return;
                }
                setDisplayPos(path[i]);
                i++;
                setTimeout(step, STEP_MS);
            };
            step();
        } else if (next.kind === 'jail') {
            setJailShaking(true);
            setTimeout(() => { setJailShaking(false); runningRef.current = false; drain(); }, 600);
        } else if (next.kind === 'wait') {
            setTimeout(() => { runningRef.current = false; drain(); }, next.ms);
        } else if (next.kind === 'jail-escape') {
            // Small bounce before continuing.
            setTimeout(() => { runningRef.current = false; drain(); }, 300);
        }
    }

    const [xPct, yPct] = tokenCenter(displayPos);
    const side = tileRect(displayPos).side;
    // While walking, a token is alone on each tile it passes.
    const settled = !walking && displayPos === player.position;
    const off = settled ? stackOffset(side, stackIndex, stackCount) : [0, 0];
    const initial = (player.username || '?').trim()[0]?.toUpperCase() || '?';
    const isLight = ['#FFFFFF', '#FACC15', '#FEF200'].includes(player.color?.toUpperCase());

    return (
        <div
            className="token"
            style={{
                left: `${xPct + off[0]}%`,
                top:  `${yPct + off[1]}%`,
                '--token-scale': settled ? stackScale(stackCount) : 1,
                zIndex: isActive ? 22 : 20,
            }}
            onMouseEnter={(e) => onHover?.(e, player)}
            onMouseLeave={() => onHover?.(null, null)}
        >
            {/* Inner body carries every effect transform (pulse / hop / shake)
                so they never fight the outer element's positioning transform. */}
            <div
                className={`token-body ${isActive ? 'active' : ''} ${isJailShaking ? 'shake' : ''} ${walking ? 'walking' : ''}`}
                style={{
                    background: `radial-gradient(circle at 34% 28%, ${lighten(player.color)}, ${player.color} 68%)`,
                    color: isLight ? '#0b0f17' : 'white',
                    textShadow: isLight ? 'none' : '0 1px 2px rgba(0,0,0,0.7)',
                }}
            >{initial}</div>
        </div>
    );
}

// Quick perceptual lighten for the token's glossy highlight — just blends the
// colour toward white so every token reads as a rounded 3D puck.
function lighten(hex) {
    if (!hex || hex[0] !== '#' || hex.length < 7) return 'rgba(255,255,255,0.6)';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const mix = (c) => Math.round(c + (255 - c) * 0.55);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
