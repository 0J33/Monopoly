import React, { useEffect, useRef, useState } from 'react';
import { readable } from '../../colors';
import { Send, X, MessageSquare } from 'lucide-react';
import { play } from '../../sound';

// Sliding chat overlay. Opens from the right edge with a semi-transparent
// backdrop, stays out of the way until someone clicks the bubble button or
// a new message arrives. Action log occupies its former spot now.
export default function ChatPanel({ chat, sendChat, me, players = [], open, onOpen, onClose }) {
    const [text, setText] = useState('');
    const [unseen, setUnseen] = useState(0);
    const scrollRef = useRef(null);
    const lastSeenLen = useRef(chat.length);

    // New-message ping + unseen counter.
    useEffect(() => {
        if (chat.length <= lastSeenLen.current) return;
        const newMsgs = chat.slice(lastSeenLen.current);
        lastSeenLen.current = chat.length;
        if (open) return;
        const fromOther = newMsgs.some(m => m.userId !== me?.userId && !m.system);
        if (fromOther) { play('chat'); setUnseen(u => u + newMsgs.filter(m => m.userId !== me?.userId && !m.system).length); }
    }, [chat, open, me?.userId]);

    useEffect(() => {
        if (open) setUnseen(0);
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [chat, open]);

    function submit(e) {
        e.preventDefault();
        const v = text.trim();
        if (!v) return;
        sendChat(v);
        setText('');
    }

    return (
        <>
            {/* Toggle bubble — only visible when panel is closed, otherwise
                it sits over the send button inside the panel. When open the
                X in the panel header handles closing. */}
            {!open && (
                <button
                    className="btn"
                    onClick={onOpen}
                    style={{
                        position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 80,
                        borderRadius: 999, width: 48, height: 48, padding: 0,
                        justifyContent: 'center',
                        background: 'var(--accent)',
                        borderColor: 'var(--accent)',
                        color: 'white',
                        boxShadow: 'var(--shadow-lg)',
                    }}
                    title="Open chat"
                >
                    <MessageSquare size={18} />
                    {unseen > 0 && (
                        <span style={{
                            position: 'absolute', top: -4, right: -4,
                            background: 'var(--danger)', color: 'white',
                            fontSize: 10, fontWeight: 800,
                            minWidth: 18, height: 18, padding: '0 5px',
                            borderRadius: 999,
                            display: 'grid', placeItems: 'center',
                            border: '2px solid var(--bg)',
                        }}>{unseen > 99 ? '99+' : unseen}</span>
                    )}
                </button>
            )}

            {/* Slide-in panel */}
            {open && (
                <>
                    <div onClick={onClose} style={{
                        position: 'fixed', inset: 0, zIndex: 70,
                        background: 'rgba(0,0,0,0.35)',
                        animation: 'fadeIn 0.15s ease-out',
                    }} />
                    <div className="slide-in-right felt" style={{
                        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 75,
                        width: 380, maxWidth: '92vw',
                        borderLeft: '1px solid rgba(246,196,69,0.35)',
                        boxShadow: 'var(--shadow-lg)',
                        display: 'flex', flexDirection: 'column',
                    }}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(246,196,69,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <MessageSquare size={18} color="var(--gold)" />
                            <h2 className="print" style={{ margin: 0, fontSize: 26, color: 'var(--gold)' }}>Table talk</h2>
                            <div style={{ flex: 1 }} />
                            <button className="btn sm ghost" onClick={onClose} aria-label="Close chat"><X size={15} /></button>
                        </div>
                        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {chat.length === 0 && (
                                <div style={{ color: 'rgba(246,236,210,0.6)', fontSize: 14, textAlign: 'center', paddingTop: 20 }}>Nothing said yet. Say hi.</div>
                            )}
                            {chat.map(m => (
                                <div key={m.id} style={{
                                    fontSize: 14, lineHeight: 1.45,
                                    color: m.system ? 'rgba(246,236,210,0.62)' : 'var(--text)',
                                    fontStyle: m.system ? 'italic' : 'normal',
                                    overflowWrap: 'anywhere',
                                }}>
                                    {!m.system && (
                                        <span style={{
                                            fontWeight: 700,
                                            color: readable(players.find(p => p.userId === m.userId)?.color) || 'var(--text-2)',
                                        }}>{m.userId === me?.userId ? 'You' : m.username}: </span>
                                    )}
                                    <span>{m.text}</span>
                                </div>
                            ))}
                        </div>
                        <form onSubmit={submit} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(246,196,69,0.2)', background: 'rgba(0,0,0,0.2)' }}>
                            <input
                                autoFocus
                                style={{ flex: 1, fontSize: 15, minWidth: 0 }}
                                aria-label="Message"
                                placeholder="Say something to the table…"
                                value={text}
                                onChange={e => setText(e.target.value.slice(0, 500))}
                            />
                            <button type="submit" className="btn primary sm"><Send size={14} /></button>
                        </form>
                    </div>
                </>
            )}
        </>
    );
}
