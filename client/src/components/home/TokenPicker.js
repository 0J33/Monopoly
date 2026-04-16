import React from 'react';

export default function TokenPicker({ tokens, value, onChange, disabledHexes = [] }) {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tokens.map(t => {
                const disabled = disabledHexes.includes(t.hex) && t.hex !== value;
                const selected = value === t.hex;
                return (
                    <button
                        key={t.id}
                        onClick={() => !disabled && onChange(t.hex)}
                        disabled={disabled}
                        title={disabled ? `${t.name} (taken)` : t.name}
                        style={{
                            width: 40, height: 40, borderRadius: 10,
                            background: t.hex,
                            border: selected ? '3px solid white' : '3px solid transparent',
                            outline: selected ? '2px solid var(--accent)' : 'none',
                            opacity: disabled ? 0.25 : 1,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            transition: 'transform 0.1s ease, border-color 0.1s ease',
                            transform: selected ? 'scale(1.08)' : 'scale(1)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}
                    />
                );
            })}
        </div>
    );
}
