import React from 'react';
import { rentLabel } from './rent';
import { readable, wash } from '../../colors';
import { tileRect, innerEdge, BAR_PCT, TOKEN_STRIP_END_PCT } from './layout';
import { Train, Plane, Lightbulb, Droplet, HelpCircle, Package, Coins, Car, PlayCircle, Lock, Palmtree, Siren } from 'lucide-react';

// Tile renderer — all text upright regardless of side. Layout:
//   • color bar (if property) pinned to the inner edge (facing board center)
//   • houses also on the inner edge (above/next to the color bar)
//   • name + price stacked in the tile body, horizontally centered
//   • a reserved strip on the inner edge holds houses + token slot so they
//     never overlap the name
export default function Tile({ def, state, players, board, room, onClick, onHover }) {
    const rect = tileRect(def.pos);
    const inner = innerEdge(rect.side);
    const mortgaged = state?.mortgaged;
    const isClickable = ['property', 'station', 'utility'].includes(def.type);
    const ownerPlayer = state?.owner ? players.find(p => p.userId === state.owner) : null;
    // Two colours: the true one is for the corner flag, which has its own
    // backing; the lifted one is for the stripe and the wash, which are drawn
    // straight onto dark felt where Black and Brown disappeared entirely.
    const ownerColor = ownerPlayer ? readable(ownerPlayer.color) : null;
    const ownerInitial = ownerPlayer ? (ownerPlayer.username || '?').trim()[0]?.toUpperCase() : null;

    const baseStyle = {
        position: 'absolute',
        left: rect.left + '%',
        top: rect.top + '%',
        width: rect.width + '%',
        height: rect.height + '%',
        // A wash across the whole tile. A 3px stripe on the outer edge was the
        // only mark of ownership, and next to a street's colour bar nobody saw
        // it — "non airports and companies don't show owner".
        ...(ownerColor ? { background: wash(ownerColor, 0.17) } : null),
    };

    return (
        <div
            className={`tile ${rect.side} ${mortgaged ? 'mortgaged' : ''} ${isClickable ? 'clickable' : ''}`}
            style={baseStyle}
            onClick={isClickable ? onClick : undefined}
            onMouseEnter={(e) => isClickable && onHover?.(e, def)}
            onMouseLeave={() => onHover?.(null, null)}
        >
            {ownerColor && <OwnerStripe side={rect.side} color={ownerColor} />}
            {ownerPlayer && <OwnerFlag side={rect.side} player={ownerPlayer} initial={ownerInitial} />}

            {rect.side === 'corner'
                ? <CornerContent def={def} board={board} />
                : <SideContent def={def} state={state} side={rect.side} inner={inner} board={board} room={room} />}
        </div>
    );
}

function OwnerStripe({ side, color }) {
    const common = { position: 'absolute', background: color, boxShadow: `0 0 7px ${color}`, zIndex: 2 };
    const w = 6;
    if (side === 'top')    return <div style={{ ...common, left: 0, right: 0, top: 0, height: w }} />;
    if (side === 'bottom') return <div style={{ ...common, left: 0, right: 0, bottom: 0, height: w }} />;
    if (side === 'left')   return <div style={{ ...common, left: 0, top: 0, bottom: 0, width: w }} />;
    if (side === 'right')  return <div style={{ ...common, right: 0, top: 0, bottom: 0, width: w }} />;
    return null;
}

/* The owner's initial, on their own colour, in the outer corner. The stripe
   and the wash say SOMEONE owns this; at a glance across a board of six
   players, only a name says who. */
function OwnerFlag({ side, player, initial }) {
    const light = ['#FFFFFF', '#FACC15', '#FEF200', '#84CC16'].includes((player.color || '').toUpperCase());
    const style = {
        position: 'absolute', zIndex: 3,
        background: player.color,
        color: light ? '#0b0f17' : '#fff',
        border: '1px solid rgba(255,255,255,0.85)',
        display: 'grid', placeItems: 'center', justifyContent: 'center',
        width: '1.5vmin', height: '1.5vmin',
        fontSize: '0.95vmin', fontWeight: 800, lineHeight: 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
    };
    const at = side === 'top'    ? { top: 7, right: 2 }
             : side === 'bottom' ? { bottom: 7, right: 2 }
             : side === 'left'   ? { left: 7, top: 2 }
             :                     { right: 7, top: 2 };
    return <div className="owner-flag" style={{ ...style, ...at }} title={`Owned by ${player.username}`}>{initial}</div>;
}

// Side tiles: color-bar strip on inner edge, content stacked upright.
// Proportions chosen so a 9-char name fits comfortably on one line on a
// 700×700 board (~59px tile width for top/bottom).
function SideContent({ def, state, side, inner, board, room }) {
    const isVertical = side === 'left' || side === 'right';

    // Color-bar strip placement.
    const barSide = inner; // 'top' | 'bottom' | 'left' | 'right'
    const barStyle = {
        position: 'absolute',
        background: def.color || 'transparent',
        [barSide]: 0,
        ...(isVertical
            ? { top: 0, bottom: 0, width: BAR_PCT + '%' }
            : { left: 0, right: 0, height: BAR_PCT + '%' }),
    };

    // Body sits past the token strip from the inner edge — that way tokens
    // have their own reserved zone and never sit on top of text.
    const bodyStyle = {
        position: 'absolute',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isVertical ? '3% 6%' : '3%',
        gap: isVertical ? '1px' : '2px',
        ...(isVertical
            ? {
                top: 0, bottom: 0,
                [barSide === 'left' ? 'left' : 'right']: TOKEN_STRIP_END_PCT + '%',
                [barSide === 'left' ? 'right' : 'left']: 0,
              }
            : {
                left: 0, right: 0,
                [barSide === 'top' ? 'top' : 'bottom']: TOKEN_STRIP_END_PCT + '%',
                [barSide === 'top' ? 'bottom' : 'top']: 0,
              }),
    };

    return (
        <>
            {def.type === 'property' && <div style={barStyle}>
                <HouseRow state={state} side={side} />
            </div>}
            <div style={bodyStyle}>
                <TileInnerContent def={def} board={board} room={room} vertical={isVertical} />
            </div>
        </>
    );
}

// The label printed on the tile face: the board's short form if it has one.
// Sized in board widths (the board is a size container), so the longest word
// always fits across a tile at any board size — no browser hyphenation
// dictionary needed. A tile's text column is ~7.6% of the board wide; a
// condensed capital is ~0.54em. Names may carry soft hyphens
// ("Mediter\u00ADranean") where the printed board would break them.
function TileName({ text, color }) {
    const longest = Math.max(...String(text).split(/[\s\u00AD-]+/).map(w => w.length));
    const fontSize = `min(1.42cqw, ${(12.4 / Math.max(longest, 1)).toFixed(2)}cqw)`;
    return (
        <div className="tile-name" lang="en" style={{ fontSize, ...(color ? { color } : {}) }}>
            {text}
        </div>
    );
}

// Stacked icon / name / price, scales with board size, always upright.
function TileInnerContent({ def, board, vertical, room }) {
    // Once a tile is owned, its price is history and the number that matters
    // is what landing on it costs. Same slot, so nothing moves — you just
    // stop being told a figure you can no longer act on.
    const rent = room ? rentLabel(room, def.pos) : null;
    const money = rent
        ? <div className="tile-price tile-rent" title="Rent if you land here">{rent}</div>
        : <div className="tile-price">${def.price}</div>;
    // Left / right tiles are short: smaller icons leave room for two lines.
    const ic = (vmin) => { const v = vertical ? Math.min(vmin, 1.5) : vmin; return { width: `${v}vmin`, height: `${v}vmin`, flex: '0 0 auto' }; };
    const label = def.short || def.name;
    if (def.type === 'property') {
        return (
            <>
                <TileName text={label} />
                {money}
            </>
        );
    }
    if (def.type === 'station') {
        const Icon = board?.stationNoun === 'airport' ? Plane : Train;
        return (
            <>
                <Icon style={ic(1.7)} color="var(--text-2)" />
                <TileName text={label} />
                {money}
            </>
        );
    }
    if (def.type === 'utility') {
        const electric = def.name.toLowerCase().includes('electric');
        const Icon = electric ? Lightbulb : Droplet;
        return (
            <>
                <Icon style={ic(1.4)} color={electric ? 'var(--warning)' : 'var(--accent-2)'} />
                <TileName text={label} />
                {money}
            </>
        );
    }
    if (def.type === 'chance') {
        return (
            <>
                <HelpCircle style={ic(2.6)} color="var(--warning)" />
                <TileName text={def.name} color="var(--warning)" />
            </>
        );
    }
    if (def.type === 'chest') {
        return (
            <>
                <Package style={ic(2.6)} color="var(--accent-2)" />
                <TileName text={def.name} color="var(--accent-2)" />
            </>
        );
    }
    if (def.type === 'tax') {
        return (
            <>
                <Coins style={ic(1.9)} color="var(--danger)" />
                <TileName text={label} />
                <div className="tile-price">-${def.amount}</div>
            </>
        );
    }
    return null;
}

// ─── Corner tiles ────────────────────────────────────────────────────────────
function CornerContent({ def, board }) {
    const wrap = {
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 6, gap: 4, textAlign: 'center',
    };
    const jail = board?.jailNoun || 'Jail';
    if (def.type === 'go') {
        return (
            <div style={wrap}>
                <PlayCircle style={{ width: '4vmin', height: '4vmin' }} color="var(--success)" />
                <div style={{ fontSize: '1.6vmin', fontWeight: 900, color: 'var(--success)', letterSpacing: -0.5, lineHeight: 1, textTransform: 'uppercase' }}>{def.name}</div>
                <div style={{ fontSize: '0.9vmin', color: 'var(--text-3)' }}>Collect salary</div>
            </div>
        );
    }
    if (def.type === 'jail') {
        return (
            <div style={wrap}>
                <Lock style={{ width: '3.2vmin', height: '3.2vmin' }} color="var(--warning)" />
                <div style={{ fontSize: '1.2vmin', fontWeight: 800, color: 'var(--warning)', lineHeight: 1, textTransform: 'uppercase' }}>{jail}</div>
                <div style={{ fontSize: '0.9vmin', color: 'var(--text-3)' }}>Just visiting</div>
            </div>
        );
    }
    if (def.type === 'parking') {
        const vacation = /vacation/i.test(def.name);
        const Icon = vacation ? Palmtree : Car;
        return (
            <div style={wrap}>
                <Icon style={{ width: '3.2vmin', height: '3.2vmin' }} color={vacation ? 'var(--gold)' : 'var(--text-2)'} />
                <div style={{ fontSize: '1.1vmin', fontWeight: 800, lineHeight: 1.1 }}>{def.name}</div>
            </div>
        );
    }
    if (def.type === 'gotojail') {
        return (
            <div style={wrap}>
                <Siren style={{ width: '3.2vmin', height: '3.2vmin' }} color="var(--danger)" />
                <div style={{ fontSize: '1.1vmin', fontWeight: 800, color: 'var(--danger)', lineHeight: 1.1 }}>{def.name}</div>
            </div>
        );
    }
    return null;
}

function HouseRow({ state, side }) {
    if (!state || state.houses === 0) return null;
    const isVertical = side === 'left' || side === 'right';
    const style = {
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        gap: 2,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
    };
    if (state.houses >= 5) return <div style={style}><div className="hotel" title="Hotel" /></div>;
    return (
        <div style={style}>
            {Array.from({ length: state.houses }).map((_, i) => <div key={i} className="house" />)}
        </div>
    );
}
