import React, { useEffect, useRef } from 'react';
import { HelpCircle, Package } from 'lucide-react';
import './menus.css';

// Card draw reveal. Your own card takes the screen for a moment (click to
// dismiss); someone else's slides in as a small card at the top that doesn't
// block the board or your buttons.
export default function CardModal({ deck, deckName, text, who, isMe, onClose }) {
    // The parent re-renders constantly during play; keep one timer per card.
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const t = setTimeout(() => close.current(), isMe ? 4000 : 3500);
        return () => clearTimeout(t);
    }, [isMe]);

    const isChance = deck === 'chance';
    const Icon = isChance ? HelpCircle : Package;
    const title = deckName || (isChance ? 'Chance' : 'Community Chest');

    const card = (
        <div className={`paper framed drawn-card ${isMe ? 'mine dealt' : 'theirs slide-up'}`}>
            <div className={`band ${isChance ? 'chance' : 'chest'}`}>
                <Icon size={isMe ? 24 : 18} />
                <h2 className="print" style={{ margin: 0, fontSize: isMe ? 30 : 22, minWidth: 0 }}>{title}</h2>
                {who && !isMe && (
                    <span className="print-sm" style={{ marginLeft: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who.username}</span>
                )}
            </div>
            <p className="drawn-text">{text}</p>
            {isMe && <div className="drawn-hint">Tap to put it away</div>}
        </div>
    );

    if (!isMe) {
        return (
            <div onClick={onClose} className="drawn-toast" role="status">{card}</div>
        );
    }
    return (
        <div onClick={onClose} className="modal-backdrop" style={{ zIndex: 100 }}>
            <div onClick={e => { e.stopPropagation(); onClose(); }}>{card}</div>
        </div>
    );
}
