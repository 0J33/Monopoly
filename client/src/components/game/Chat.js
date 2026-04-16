import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';

export default function Chat({ chat, sendChat, me }) {
    const [text, setText] = useState('');
    const scrollRef = useRef(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [chat]);

    function submit(e) {
        e.preventDefault();
        const v = text.trim();
        if (!v) return;
        sendChat(v);
        setText('');
    }

    return (
        <div className="card" style={{ flex: 1, padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chat.length === 0 && (
                    <div style={{ color: 'var(--text-4)', fontSize: 12, textAlign: 'center', paddingTop: 16 }}>No messages yet.</div>
                )}
                {chat.map(m => (
                    <div key={m.id} style={{
                        fontSize: 13, lineHeight: 1.4,
                        color: m.system ? 'var(--text-3)' : 'var(--text)',
                        fontStyle: m.system ? 'italic' : 'normal',
                    }}>
                        {!m.system && (
                            <span style={{
                                fontWeight: 700, fontSize: 12,
                                color: m.userId === me?.userId ? 'var(--accent)' : 'var(--text-2)',
                            }}>{m.username}: </span>
                        )}
                        <span>{m.text}</span>
                    </div>
                ))}
            </div>
            <form onSubmit={submit} style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--border)' }}>
                <input
                    style={{ flex: 1, fontSize: 13 }}
                    placeholder="Say something…"
                    value={text}
                    onChange={e => setText(e.target.value.slice(0, 500))}
                />
                <button type="submit" className="btn primary sm"><Send size={14} /></button>
            </form>
        </div>
    );
}
