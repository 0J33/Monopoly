import React from 'react';
import { LogOut, X } from 'lucide-react';
import Puck from '../common/Puck';
import { netWorth } from './playerStatus';
import './menus.css';

// The winner's certificate. Everyone else is ranked by how long they lasted
// (the last one out is second), then by what they're worth.
export default function Victory({ room, me, onLeave, onClose }) {
    const winner = room.players.find(p => p.userId === room.winnerUserId);
    const rest = room.players
        .filter(p => p.userId !== room.winnerUserId)
        .sort((a, b) => {
            if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
            if (a.bankrupt && b.bankrupt) return (b.bankruptAt ?? 0) - (a.bankruptAt ?? 0);
            return netWorth(room, b) - netWorth(room, a);
        });
    const s = winner?.stats || {};

    return (
        <div className="modal-backdrop" style={{ zIndex: 200, background: 'rgba(0,0,0,0.72)' }}>
            <div className="paper framed victory dealt" role="dialog" aria-label="Game over">
                {onClose && <button className="sheet-close" onClick={onClose} aria-label="Look at the board"><X size={16} /></button>}
                {winner && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
                            <Puck color={winner.color} label={(winner.username[0] || '?').toUpperCase()} size={60} />
                        </div>
                        <h2 className="print victory-name">{winner.userId === me?.userId ? 'You win' : `${winner.username} wins`}</h2>
                        <div className="ruled victory-lines">
                            <div><span>Worth</span><b className="mono">${netWorth(room, winner).toLocaleString()}</b></div>
                            <div><span>Deeds held</span><b className="mono">{winner.owned.length}</b></div>
                            <div><span>Rent collected</span><b className="mono">${(s.rentCollected || 0).toLocaleString()}</b></div>
                        </div>
                    </>
                )}
                <div className="ruled victory-rank">
                    {rest.map((p, i) => (
                        <div key={p.userId} className="victory-row">
                            <span className="place">{i + 2}</span>
                            <Puck color={p.color} label={(p.username[0] || '?').toUpperCase()} size={24} />
                            <span className="who" title={p.username}>{p.username}</span>
                            <span className="what">{p.bankrupt ? 'bankrupt' : `$${netWorth(room, p).toLocaleString()}`}</span>
                        </div>
                    ))}
                </div>
                <div style={{ padding: '18px 22px 22px' }}>
                    <button className="btn ink lg" onClick={onLeave} style={{ width: '100%', justifyContent: 'center' }}>
                        <LogOut size={17} /> Back to the table
                    </button>
                </div>
            </div>
        </div>
    );
}
