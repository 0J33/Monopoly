import React from 'react';

const LIGHT = ['#FFFFFF', '#FACC15', '#FEF200', '#84CC16'];

// A token puck — the glossy piece that walks the board — as a swatch, an
// avatar, or a picker button.
export default function Puck({ color, label, size = 34, selected, disabled, onClick, title }) {
    const light = LIGHT.includes(String(color).toUpperCase());
    const style = {
        // 0.52, not 0.42: the border and the inset highlight eat the outer
        // ring, so the letter has to be sized against the ink you can
        // actually see. At 0.42 an initial read as a smudge rather than a
        // name — which is the whole job of the piece.
        width: size, height: size, fontSize: Math.round(size * 0.52),
        background: `radial-gradient(circle at 34% 28%, ${lighten(color)}, ${color} 68%)`,
        color: light ? '#0b0f17' : 'white',
        textShadow: light ? 'none' : '0 1px 2px rgba(0,0,0,0.7)',
        flex: '0 0 auto',
    };
    const cls = `puck${selected ? ' selected' : ''}`;
    if (!onClick) return <span className={cls} style={style} title={title}>{label}</span>;
    return (
        <button type="button" className={cls} style={style} onClick={onClick} disabled={disabled}
            title={title} aria-pressed={!!selected}>{label}</button>
    );
}

function lighten(hex) {
    if (!hex || hex[0] !== '#' || hex.length < 7) return 'rgba(255,255,255,0.6)';
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    const mix = (c) => Math.round(c + (255 - c) * 0.55);
    return `rgb(${mix(n(1))}, ${mix(n(3))}, ${mix(n(5))})`;
}
