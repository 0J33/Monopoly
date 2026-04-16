import React from 'react';
import { ScrollText, X } from 'lucide-react';
import ActionLog from './ActionLog';

// Mobile-only floating Log button that opens a bottom-sheet drawer with the
// action log. On desktop the log is always visible in the sidebar instead.
export default function LogDrawer({ open, onOpen, onClose, room }) {
    return (
        <>
            {!open && (
                <button
                    className="btn"
                    onClick={onOpen}
                    style={{
                        position: 'fixed', right: 16, bottom: 76, zIndex: 70,
                        borderRadius: 999, height: 40, padding: '0 14px',
                        background: 'var(--surface-2)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-2)',
                        boxShadow: 'var(--shadow)',
                        gap: 6,
                    }}
                >
                    <ScrollText size={14} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Log</span>
                </button>
            )}
            {open && (
                <>
                    <div onClick={onClose} style={{
                        position: 'fixed', inset: 0, zIndex: 70,
                        background: 'rgba(0,0,0,0.55)',
                        animation: 'fadeIn 0.15s ease-out',
                    }} />
                    <div className="slide-up" style={{
                        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 75,
                        maxHeight: '72vh',
                        background: 'var(--surface)',
                        borderTop: '1px solid var(--border-2)',
                        borderRadius: '14px 14px 0 0',
                        boxShadow: 'var(--shadow-lg)',
                        display: 'flex', flexDirection: 'column',
                    }}>
                        <div style={{
                            padding: 12, borderBottom: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <ScrollText size={14} color="var(--text-3)" />
                            <div style={{ fontWeight: 700, fontSize: 14 }}>Action Log</div>
                            <div style={{ flex: 1 }} />
                            <button className="btn sm ghost" onClick={onClose}><X size={14} /></button>
                        </div>
                        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 8 }}>
                            <ActionLog log={room.actionLog} players={room.players} tiles={room.board.tiles} />
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
