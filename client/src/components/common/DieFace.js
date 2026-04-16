import React from 'react';

// Single die face rendered as SVG. Used as the app's brand mark — see the
// home-screen header, the board center, and /favicon.svg.
//
// value: 1..6 (defaults to 5, the most iconic face).
// gradient: if true, face fill uses the accent→success gradient; otherwise
// solid white.

const PIPS = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

export default function DieFace({ value = 5, size = 32, gradient = true, color, pipColor, style }) {
    const pips = PIPS[value] || PIPS[5];
    const grad = `gradG_${value}_${size}`;
    return (
        <svg viewBox="0 0 48 48" width={size} height={size} xmlns="http://www.w3.org/2000/svg" style={style} aria-label={`Die face ${value}`}>
            {gradient && !color && (
                <defs>
                    <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%"  stopColor="#4c8dff" />
                        <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                </defs>
            )}
            <rect x="3" y="3" width="42" height="42" rx="8"
                  fill={color || (gradient ? `url(#${grad})` : 'white')}
                  stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
            {pips.map(([r, c], i) => (
                <circle key={i}
                    cx={11 + c * 13}
                    cy={11 + r * 13}
                    r={3.6}
                    fill={pipColor || '#0b0f17'} />
            ))}
        </svg>
    );
}
