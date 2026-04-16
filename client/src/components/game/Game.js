import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useRoom from '../../useRoom';
import useIsMobile from '../../useIsMobile';
import Board from './Board';
import PlayerPanel from './PlayerPanel';
import PlayerStrip from './PlayerStrip';
import ChatPanel from './ChatPanel';
import TradesPanel from './TradesPanel';
import LogDrawer from './LogDrawer';
import ActionLog from './ActionLog';
import CardModal from './CardModal';
import AuctionModal from './AuctionModal';
import TradeModal from './TradeModal';
import PropertyModal from './PropertyModal';
import SoundToggle from './SoundToggle';
import Victory from './Victory';
import DieFace from '../common/DieFace';
import { LogOut, Copy, ScrollText } from 'lucide-react';

export default function Game({ userId, pushToast }) {
    const nav = useNavigate();
    const isMobile = useIsMobile();
    const { roomCode, room, events, chat, connected, act, sendChat } = useRoom({ userId });

    const [diceRolling, setDiceRolling] = useState(false);
    const [tradeWith, setTradeWith] = useState(null);
    const [peekTradeId, setPeekTradeId] = useState(null);
    const [openPropertyPos, setOpenPropertyPos] = useState(null);
    const [drawnCard, setDrawnCard] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [logOpen, setLogOpen] = useState(false);

    useEffect(() => {
        const last = events[events.length - 1];
        if (!last) return;
        if (last.type === 'roll') {
            setDiceRolling(true);
            const t = setTimeout(() => setDiceRolling(false), 1150);
            return () => clearTimeout(t);
        }
        if (last.type === 'draw-card') {
            setDrawnCard({ deck: last.deck, cardId: last.cardId, text: last.text });
        }
    }, [events]);

    if (!room) {
        return <div className="grid-bg" style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
            {connected ? 'Loading…' : 'Connecting…'}
        </div>;
    }

    const me = room.players.find(p => p.userId === userId);
    const active = room.players[room.turnIndex];
    const isMyTurn = active?.userId === userId && !room.ended;
    const openTrade = peekTradeId
        ? room.trades?.find(t => t.id === peekTradeId)
        : room.trades?.find(t =>
            t.status === 'open' && (t.fromUserId === userId || t.toUserId === userId)
          );

    function copyLink() {
        navigator.clipboard.writeText(`${window.location.origin}/r/${roomCode}`).then(() => pushToast('Link copied', 'success'));
    }

    const modals = (
        <>
            {drawnCard && (
                <CardModal deck={drawnCard.deck} text={drawnCard.text} onClose={() => setDrawnCard(null)} />
            )}
            {room.auction && <AuctionModal room={room} me={me} act={act} />}
            {(tradeWith || openTrade) && (
                <TradeModal
                    room={room}
                    me={me}
                    counterpartyUserId={openTrade
                        ? (openTrade.fromUserId === userId ? openTrade.toUserId : openTrade.fromUserId)
                        : tradeWith}
                    existingTrade={openTrade}
                    onClose={() => { setTradeWith(null); setPeekTradeId(null); }}
                    act={act}
                />
            )}
            {openPropertyPos != null && (
                <PropertyModal pos={openPropertyPos} room={room} me={me} act={act} onClose={() => setOpenPropertyPos(null)} />
            )}
            <TradesPanel room={room} me={me} onOpenTrade={(t) => setPeekTradeId(t.id)} />
            <ChatPanel chat={chat} sendChat={sendChat} me={me}
                open={chatOpen} onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)} />
            {room.ended && <Victory room={room} onLeave={() => nav('/')} />}
        </>
    );

    if (isMobile) {
        return (
            <div style={{
                display: 'grid',
                gridTemplateRows: 'auto auto 1fr',
                height: '100vh',
                overflow: 'hidden',
                background: 'var(--bg)',
            }}>
                <header style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px' }}>
                    <button className="btn ghost sm" onClick={() => nav('/')}><LogOut size={13} /></button>
                    <DieFace value={5} size={22} />
                    <div className="chip" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{roomCode}</div>
                    <button className="btn sm ghost" onClick={copyLink}><Copy size={12} /></button>
                    <div style={{ flex: 1 }} />
                    <SoundToggle />
                </header>

                <PlayerStrip room={room} me={me} onTrade={(uid) => setTradeWith(uid)} />

                <main style={{ display: 'grid', placeItems: 'center', padding: 10, minHeight: 0 }}>
                    <div style={{ width: 'min(100%, 100vw - 20px)', maxHeight: '100%', aspectRatio: '1 / 1' }}>
                        <Board
                            room={room}
                            userId={userId}
                            diceRolling={diceRolling}
                            events={events}
                            me={me}
                            isMyTurn={isMyTurn}
                            act={act}
                            onTileClick={(pos) => setOpenPropertyPos(pos)}
                        />
                    </div>
                </main>

                <LogDrawer open={logOpen} onOpen={() => setLogOpen(true)} onClose={() => setLogOpen(false)} room={room} />
                {modals}
            </div>
        );
    }

    // Desktop layout
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 300px) 1fr minmax(280px, 340px)', gap: 16, padding: 16, height: '100vh', overflow: 'hidden' }}>
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn ghost sm" onClick={() => nav('/')}><LogOut size={13} /></button>
                    <DieFace value={5} size={22} />
                    <div className="chip" style={{ fontFamily: 'var(--font-mono)' }}>{roomCode}</div>
                    <button className="btn sm ghost" onClick={copyLink}><Copy size={12} /></button>
                    <div style={{ flex: 1 }} />
                    <SoundToggle />
                </header>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingRight: 4, flex: 1 }}>
                    {room.players.map(p => (
                        <PlayerPanel
                            key={p.userId}
                            p={p}
                            isMe={p.userId === userId}
                            isActive={active?.userId === p.userId}
                            room={room}
                            onTrade={() => setTradeWith(p.userId)}
                        />
                    ))}
                </div>
            </aside>

            <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
                    <div style={{ width: 'min(100%, 100vh - 32px)', aspectRatio: '1 / 1', maxHeight: 'calc(100vh - 32px)' }}>
                        <Board
                            room={room}
                            userId={userId}
                            diceRolling={diceRolling}
                            events={events}
                            me={me}
                            isMyTurn={isMyTurn}
                            act={act}
                            onTileClick={(pos) => setOpenPropertyPos(pos)}
                        />
                    </div>
                </div>
            </main>

            <aside style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 0' }}>
                    <ScrollText size={14} color="var(--text-3)" />
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Action Log</div>
                </header>
                <ActionLog log={room.actionLog} players={room.players} tiles={room.board.tiles} />
            </aside>

            {modals}
        </div>
    );
}
