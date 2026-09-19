import React, { useEffect, useRef, useState } from 'react';
import { tokenCenter, tileRect } from './layout';

// Stagger tokens that share a tile so they don't overlap. The offset axis
// runs along the tile's long edge so tokens fan out ALONG the side of the
// board rather than stacking through the tile's text area.
function stackOffset(side, idx) {
    const step = 12;
    const offs = [0, step, -step, 2 * step, -2 * step, 3 * step, -3 * step];
    const d = offs[idx] ?? 0;
    if (side === 'top' || side === 'bottom') return [d, 0];
    if (side === 'left' || side === 'right') return [0, d];
    return [d, 0];
}

// Tile-by-tile walk. Watches incoming events for this player's `move` events
// and steps the displayed position along the `path` so the token visibly
// walks across each tile instead of teleporting.
const STEP_MS = 160;

export default function PlayerToken({ player, isActive, stackIndex, events, onHover }) {
    const [displayPos, setDisplayPos] = useState(player.position);
    const [isJailShaking, setJailShaking] = useState(false);
    const [walking, setWalking] = useState(false);
    const queueRef = useRef([]);
    const runningRef = useRef(false);
    const lastSeenVersion = useRef(null);

    // Feed new move events for this player into the queue.
    useEffect(() => {
        if (!events) return;
        for (const e of events) {
            if (e._k === lastSeenVersion.current) break;
        }
        const idx = events.findIndex(e => e._k === lastSeenVersion.current);
        const newEvents = idx === -1 ? events : events.slice(idx + 1);
        if (newEvents.length) lastSeenVersion.current = newEvents[newEvents.length - 1]._k;
        for (const e of newEvents) {
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
        } else if (next.kind === 'jail-escape') {
            // Small bounce before continuing.
            setTimeout(() => { runningRef.current = false; drain(); }, 300);
        }
    }

    const [xPct, yPct] = tokenCenter(displayPos);
    const side = tileRect(displayPos).side;
    const off = stackOffset(side, stackIndex);
    const initial = (player.username || '?').trim()[0]?.toUpperCase() || '?';
    const isLight = ['#FFFFFF', '#FACC15', '#FEF200'].includes(player.color?.toUpperCase());

    return (
        <div
            className="token"
            style={{
                left: `calc(${xPct}% + ${off[0]}px)`,
                top:  `calc(${yPct}% + ${off[1]}px)`,
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
