import React from 'react';

const KIND_COLORS = {
    error:   'var(--danger)',
    success: 'var(--success)',
    info:    'var(--accent)',
};

export default function Toasts({ toasts }) {
    return (
        <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 1000,
            display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
        }}>
            {toasts.map(t => (
                <div key={t.id} className="slide-up" style={{
                    padding: '10px 14px',
                    background: 'var(--surface-2)',
                    border: `1px solid ${KIND_COLORS[t.kind] || 'var(--border)'}`,
                    borderLeftWidth: 3,
                    borderRadius: 'var(--radius)',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 500,
                    boxShadow: 'var(--shadow-lg)',
                    maxWidth: 360,
                }}>{t.text}</div>
            ))}
        </div>
    );
}
