import React from 'react';
import { tileRect, innerEdge, BAR_PCT, TOKEN_STRIP_END_PCT } from './layout';
import { Train, Plane, Lightbulb, Droplet, HelpCircle, Package, Coins, Car, PlayCircle, Lock, Palmtree, Siren } from 'lucide-react';

// Tile renderer — all text upright regardless of side. Layout:
//   • color bar (if property) pinned to the inner edge (facing board center)
//   • houses also on the inner edge (above/next to the color bar)
//   • name + price stacked in the tile body, horizontally centered
//   • a reserved strip on the inner edge holds houses + token slot so they
//     never overlap the name
export default function Tile({ def, state, players, board, onClick, onHover }) {
    const rect = tileRect(def.pos);
    const inner = innerEdge(rect.side);
    const mortgaged = state?.mortgaged;
    const isClickable = ['property', 'station', 'utility'].includes(def.type);
    const ownerColor = state?.owner ? players.find(p => p.userId === state.owner)?.color : null;

    const baseStyle = {
        position: 'absolute',
        left: rect.left + '%',
        top: rect.top + '%',
        width: rect.width + '%',
        height: rect.height + '%',
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

            {rect.side === 'corner'
                ? <CornerContent def={def} board={board} />
                : <SideContent def={def} state={state} side={rect.side} inner={inner} board={board} />}
        </div>
    );
}

function OwnerStripe({ side, color }) {
    const common = { position: 'absolute', background: color, boxShadow: `0 0 8px ${color}`, zIndex: 2 };
    if (side === 'top')    return <div style={{ ...common, left: 0, right: 0, top: 0, height: 3 }} />;
    if (side === 'bottom') return <div style={{ ...common, left: 0, right: 0, bottom: 0, height: 3 }} />;
    if (side === 'left')   return <div style={{ ...common, left: 0, top: 0, bottom: 0, width: 3 }} />;
    if (side === 'right')  return <div style={{ ...common, right: 0, top: 0, bottom: 0, width: 3 }} />;
    return null;
}

// Side tiles: color-bar strip on inner edge, content stacked upright.
// Proportions chosen so a 9-char name fits comfortably on one line on a
// 700×700 board (~59px tile width for top/bottom).
function SideContent({ def, state, side, inner, board }) {
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
                <TileInnerContent def={def} board={board} vertical={isVertical} />
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
function TileInnerContent({ def, board, vertical }) {
    // Left / right tiles are short: smaller icons leave room for two lines.
    const ic = (vmin) => { const v = vertical ? Math.min(vmin, 1.5) : vmin; return { width: `${v}vmin`, height: `${v}vmin`, flex: '0 0 auto' }; };
    const label = def.short || def.name;
    if (def.type === 'property') {
        return (
            <>
                <TileName text={label} />
                <div className="tile-price">${def.price}</div>
            </>
        );
    }
    if (def.type === 'station') {
        const Icon = board?.stationNoun === 'airport' ? Plane : Train;
        return (
            <>
                <Icon style={ic(1.7)} color="var(--text-2)" />
                <TileName text={label} />
                <div className="tile-price">${def.price}</div>
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
                <div className="tile-price">${def.price}</div>
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
