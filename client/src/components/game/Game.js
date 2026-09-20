import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useIsMobile from '../../useIsMobile';
import Board from './Board';
import PlayerPanel from './PlayerPanel';
import PlayerStrip from './PlayerStrip';
import ChatPanel from './ChatPanel';
import TradesPanel from './TradesPanel';
import ActionLog from './ActionLog';
import CardModal from './CardModal';
import AuctionModal from './AuctionModal';
import TradeModal from './TradeModal';
import PropertyModal from './PropertyModal';
import AssetsModal from './AssetsModal';
import SoundToggle from './SoundToggle';
import Victory from './Victory';
import Logo from '../common/Logo';
import { DICE_TOTAL_MS } from './Dice';
import { STEP_MS, CARD_PAUSE_MS } from './PlayerToken';
import { LogOut, Copy, ScrollText, Building2, Flag, Eye, Trophy } from 'lucide-react';

const OWNABLE = ['property', 'station', 'utility'];

// Works out how long the animations for a batch of events take: the dice
// tumble, then each token walk (one tile per STEP_MS), with a pause while a
// drawn card is on screen. Returns the total, and when the card appears.
function timeline(evs) {
    let t = 0, cardAt = null;
    for (const e of evs) {
        if (e.type === 'roll') t += DICE_TOTAL_MS;
        else if (e.type === 'move') t += (e.animate === false ? 1 : (e.path?.length || 0)) * STEP_MS;
        else if (e.type === 'draw-card') { cardAt = t; t += CARD_PAUSE_MS; }
    }
    return { total: t, cardAt };
}

/** userId -> cash, for the delayed snapshot the panels read. */
function cashOf(room) {
    const out = {};
    for (const p of room?.players || []) out[p.userId] = p.cash;
    return out;
}

export default function Game({ userId, pushToast, roomState }) {
    const nav = useNavigate();
    const isMobile = useIsMobile();
    const { roomCode, room, events, chat, connected, act, sendChat } = roomState;

    const [diceRolling, setDiceRolling] = useState(false);
    const [tradeWith, setTradeWith] = useState(null);
    const [openTradeId, setOpenTradeId] = useState(null);
    const [dismissedTrades, setDismissedTrades] = useState({});
    const [openPropertyPos, setOpenPropertyPos] = useState(null);
    const [assetsOpen, setAssetsOpen] = useState(false);
    const [drawnCard, setDrawnCard] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [victoryHidden, setVictoryHidden] = useState(false);
    const [shownLog, setShownLog] = useState(() => room?.actionLog || []);
    // Cash follows the animation too. The server settles rent the instant the
    // move resolves, so the panel used to drop $200 while the token was still
    // three tiles from the property that charged it — the money moved before
    // the thing that caused it had finished happening. Released on the same
    // beat as the log entry that explains it.
    const [shownCash, setShownCash] = useState(() => cashOf(room));
    const [, setTick] = useState(0);

    // Play each new batch of events in order, and hold the log back until the
    // animation catches up — otherwise the log announces "paid $200 rent"
    // while the dice are still tumbling. Each batch's log snapshot appears when
    // its own animation ends, in order, and never more than a few seconds
    // behind (fast play mustn't leave the log stuck).
    // Event keys are `${version}_${i}`; everything up to this version has been played.
    const seenVersion = useRef(events.length ? parseInt(events[events.length - 1]._k, 10) : -1);
    const busyUntil = useRef(0);
    const showAt = useRef(0);
    const shownVersion = useRef(-1);
    const timers = useRef([]);
    useEffect(() => {
        if (!room) return;
        const now = Date.now();
        const version = room.version;
        const log = room.actionLog;
        const fresh = events.filter(e => parseInt(e._k, 10) > seenVersion.current);
        if (fresh.length) seenVersion.current = parseInt(fresh[fresh.length - 1]._k, 10);

        const { total, cardAt } = timeline(fresh);
        const hold = Math.min(total, 6000);
        const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); };
        if (fresh.some(e => e.type === 'roll')) {
            setDiceRolling(true);
            later(() => setDiceRolling(false), DICE_TOTAL_MS);
        }
        const card = fresh.find(e => e.type === 'draw-card');
        if (card) later(() => setDrawnCard({ deck: card.deck, text: card.text, userId: card.userId, key: card._k }), cardAt);

        if (hold > 0) {
            busyUntil.current = Math.max(busyUntil.current, now + hold);
            setBusy(true);
            later(() => { if (Date.now() >= busyUntil.current - 5) setBusy(false); }, busyUntil.current - now);
        }
        const at = Math.min(Math.max(now + hold, showAt.current), now + 4000);
        showAt.current = at;
        const show = () => {
            if (version <= shownVersion.current) return;
            shownVersion.current = version;
            setShownLog(log);
            setShownCash(cashOf(room));
        };
        if (at <= now) show(); else later(show, at - now);
        timers.current = timers.current.slice(-50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room?.version]);
    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    // Re-render now and then while someone is offline, so the "Remove" button
    // appears once they've been gone long enough.
    const anyOffline = !!room?.players.some(p => !p.connected && !p.bankrupt);
    useEffect(() => {
        if (!anyOffline) return;
        const t = setInterval(() => setTick(x => x + 1), 5000);
        return () => clearInterval(t);
    }, [anyOffline]);

    if (!room) {
        return <div className="grid-bg" style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
            {connected ? 'Loading…' : 'Connecting…'}
        </div>;
    }

    const me = room.players.find(p => p.userId === userId);
    const active = room.players[room.turnIndex];
    const isMyTurn = active?.userId === userId && !room.ended;
    const playing = me && !me.bankrupt && !room.ended;

    // Which trade (if any) to show: one I'm composing, one I opened from the
    // trades list, or one waiting on my answer that I haven't dismissed.
    const waitingOnMe = room.trades?.find(t =>
        t.status === 'open' && (t.fromUserId === userId || t.toUserId === userId)
        && !t.acceptedBy?.includes(userId) && dismissedTrades[t.id] !== t.version);
    const pickedTrade = openTradeId ? room.trades?.find(t => t.id === openTradeId) : null;
    const shownTrade = tradeWith ? null : (pickedTrade || waitingOnMe || null);

    function closeTrade() {
        if (shownTrade) setDismissedTrades(d => ({ ...d, [shownTrade.id]: shownTrade.version }));
        setTradeWith(null);
        setOpenTradeId(null);
    }
    function startTrade(uid) {
        const existing = room.trades?.find(t => t.status === 'open'
            && ((t.fromUserId === userId && t.toUserId === uid) || (t.toUserId === userId && t.fromUserId === uid)));
        if (existing) { setOpenTradeId(existing.id); setTradeWith(null); }
        else { setOpenTradeId(null); setTradeWith(uid); }
    }
    function openTile(pos) {
        if (OWNABLE.includes(room.board.tiles[pos]?.type)) setOpenPropertyPos(pos);
    }
    function removePlayer(p) {
        if (window.confirm(`Remove ${p.username}? They've been offline a while. Their properties go back to the bank and they're out of the game.`)) {
            act('remove-player', { userId: p.userId });
        }
    }
    function resign() {
        if (window.confirm('Leave the game? Your properties go back to the bank and you are out.')) act('bankrupt');
    }
    function copyLink() {
        navigator.clipboard.writeText(`${window.location.origin}/r/${roomCode}`).then(() => pushToast('Link copied', 'success'));
    }

    const modals = (
        <>
            {drawnCard && (
                <CardModal
                    key={drawnCard.key}
                    deck={drawnCard.deck}
                    deckName={room.board.deckNames?.[drawnCard.deck]}
                    text={drawnCard.text}
                    who={room.players.find(p => p.userId === drawnCard.userId)}
                    isMe={drawnCard.userId === userId}
                    onClose={() => setDrawnCard(null)}
                />
            )}
            {room.auction && <AuctionModal room={room} me={me} act={act} />}
            {(tradeWith || shownTrade) && me && (
                <TradeModal
                    key={shownTrade ? shownTrade.id : `new-${tradeWith}`}
                    room={room}
                    me={me}
                    counterpartyUserId={shownTrade
                        ? (shownTrade.fromUserId === userId ? shownTrade.toUserId : shownTrade.fromUserId)
                        : tradeWith}
                    existingTrade={shownTrade}
                    onSent={() => { setTradeWith(null); pushToast('Trade offer sent', 'success'); }}
                    onClose={closeTrade}
                    act={act}
                />
            )}
            {openPropertyPos != null && (
                <PropertyModal pos={openPropertyPos} room={room} me={me} act={act} onClose={() => setOpenPropertyPos(null)} />
            )}
            {assetsOpen && me && <AssetsModal room={room} me={me} act={act} onClose={() => setAssetsOpen(false)} />}
            <TradesPanel room={room} me={me} onOpenTrade={(t) => { setTradeWith(null); setOpenTradeId(t.id); }} />
            <ChatPanel chat={chat} sendChat={sendChat} me={me} players={room.players}
                open={chatOpen} onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)} />
            {room.ended && !victoryHidden && <Victory room={room} me={me} onLeave={() => nav('/')} onClose={() => setVictoryHidden(true)} />}
        </>
    );

    const board = (
        <Board
            room={room}
            userId={userId}
            diceRolling={diceRolling}
            events={events}
            me={me}
            isMyTurn={isMyTurn}
            act={act}
            busy={busy}
            onManage={() => setAssetsOpen(true)}
            onTileClick={openTile}
        />
    );

    const headerButtons = (
        <>
            {playing && me.owned.length > 0 && (
                <button className="btn sm ghost" onClick={() => setAssetsOpen(true)} title="My properties — build, sell, mortgage">
                    <Building2 size={13} />{!isMobile && ' Properties'}
                </button>
            )}
            {playing && (
                <button className="btn sm ghost" onClick={resign} title="Leave the game (resign)">
                    <Flag size={13} />
                </button>
            )}
            {!me && <span className="chip" style={{ fontSize: 11 }}><Eye size={11} /> Watching</span>}
            {room.ended && victoryHidden && (
                <button className="btn sm primary" onClick={() => setVictoryHidden(false)}><Trophy size={13} /> Results</button>
            )}
            <SoundToggle />
        </>
    );

    if (isMobile) {
        return (
            <div style={{
                display: 'grid',
                gridTemplateRows: 'auto auto 1fr',
                height: '100dvh',
                overflow: 'hidden',
                background: 'var(--bg)',
                // A phone's viewport is not its usable area: the status bar
                // and camera cut into the top, the home indicator into the
                // bottom. Without these the header sat under the notch and
                // the log ran beneath the gesture bar.
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                paddingLeft: 'env(safe-area-inset-left, 0px)',
                paddingRight: 'env(safe-area-inset-right, 0px)',
                boxSizing: 'border-box',
            }}>
                <header style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px 4px' }}>
                    <button className="btn ghost sm" onClick={() => nav('/')} title="Back to home"><LogOut size={13} /></button>
                    <Logo size={22} />
                    <div className="chip" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{roomCode}</div>
                    <button className="btn sm ghost" onClick={copyLink} title="Copy invite link"><Copy size={12} /></button>
                    <div style={{ flex: 1 }} />
                    {headerButtons}
                </header>

                <PlayerStrip room={room} me={me} shownCash={shownCash} onTrade={startTrade} onRemove={removePlayer} />

                {/* Board pinned near the top, live log fills the rest so a portrait
                    phone doesn't waste the vertical space below a square board. */}
                <main style={{ display: 'flex', flexDirection: 'column', padding: '4px 10px 10px', minHeight: 0, gap: 8 }}>
                    <div style={{ display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: 'min(100%, 100vw - 20px, 54vh)', aspectRatio: '1 / 1' }}>
                            {board}
                        </div>
                    </div>
                    <div style={{ flex: 1, minHeight: 72, display: 'flex', flexDirection: 'column' }}>
                        {/* Leaves room at the bottom for the floating Trades / chat buttons. */}
                        <ActionLog log={shownLog} players={room.players} tiles={room.board.tiles} board={room.board} padBottom={52} />
                    </div>
                </main>

                {modals}
            </div>
        );
    }

    // Desktop layout
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 300px) 1fr minmax(280px, 340px)', gap: 16, padding: 16, height: '100vh', overflow: 'hidden' }}>
            <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                <header style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="btn ghost sm" onClick={() => nav('/')} title="Back to home"><LogOut size={13} /></button>
                    <Logo size={22} />
                    <div className="chip" style={{ fontFamily: 'var(--font-mono)' }}>{roomCode}</div>
                    <button className="btn sm ghost" onClick={copyLink} title="Copy invite link"><Copy size={12} /></button>
                    <div style={{ flex: 1 }} />
                    {headerButtons}
                </header>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingRight: 4, paddingBottom: 64, flex: 1 }}>
                    {room.players.map(p => (
                        <PlayerPanel
                            key={p.userId}
                            p={p}
                            shownCash={shownCash[p.userId]}
                            me={me}
                            isMe={p.userId === userId}
                            isActive={active?.userId === p.userId && room.started && !room.ended}
                            room={room}
                            onTrade={() => startTrade(p.userId)}
                            onRemove={() => removePlayer(p)}
                            onTileClick={openTile}
                        />
                    ))}
                </div>
            </aside>

            <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
                    <div style={{ width: 'min(100%, 100vh - 32px)', aspectRatio: '1 / 1', maxHeight: 'calc(100vh - 32px)' }}>
                        {board}
                    </div>
                </div>
            </main>

            <aside style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 0' }}>
                    <ScrollText size={14} color="var(--text-3)" />
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Action Log</div>
                </header>
                <ActionLog log={shownLog} players={room.players} tiles={room.board.tiles} board={room.board} padBottom={56} />
            </aside>

            {modals}
        </div>
    );
}
