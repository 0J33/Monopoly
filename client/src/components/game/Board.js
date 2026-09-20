import React, { useState } from 'react';
import Tile from './Tile';
import PlayerToken from './PlayerToken';
import Dice from './Dice';
import PropertyCard from './PropertyCard';
import BoardOverlay from './BoardOverlay';
import PlayerHoverCard from './PlayerHoverCard';
import ActionBar from './ActionBar';
import './board.css';

export default function Board({ room, userId, diceRolling, events, act, me, isMyTurn, busy, onManage, onTileClick }) {
    const [hovered, setHovered] = useState(null);
    const [hoveredPlayer, setHoveredPlayer] = useState(null);
    const tiles = room?.board?.tiles || [];
    const tileState = room?.tileState || [];
    const players = room?.players || [];
    const active = room?.players?.[room?.turnIndex];

    return (
        <div className="board">
            {tiles.map((t, i) => (
                <Tile
                    key={i}
                    def={t}
                    state={tileState[i]}
                    players={players}
                    board={room?.board}
                    room={room}
                    onClick={() => onTileClick?.(i)}
                    onHover={(e, def) => setHovered(def ? { def, state: tileState[i], e } : null)}
                />
            ))}

            <div className="board-center">
                {/* Felt table + diamond emblem sit behind the dice/actions so the
                    centre reads as a real board, not empty space. */}
                <div className="felt-table" aria-hidden />
                <div className="emblem" aria-hidden>
                    <div className="emblem-diamond"><span>MONOPOLY</span></div>
                </div>
                <div className="center-stack">
                    <Dice
                        dice={room?.lastDice}
                        rolling={diceRolling}
                    />
                    {/* Always rendered, empty or not. The centre is a fixed
                        grid, and a child that comes and goes moves every row
                        below it up and down by its own height. */}
                    <div className="rolled-by">
                        {room?.lastDiceRoller
                            ? `${players.find(p => p.userId === room.lastDiceRoller)?.username || '—'} rolled`
                            : ''}
                    </div>
                    <ActionBar
                        room={room}
                        me={me}
                        isMyTurn={isMyTurn}
                        act={act}
                        busy={busy}
                        onManage={onManage}
                    />
                </div>
            </div>

            {players.filter(p => !p.bankrupt).map((p) => {
                const sharing = players.filter(x => !x.bankrupt && x.position === p.position);
                return (
                    <PlayerToken
                        key={p.userId}
                        player={p}
                        isActive={active?.userId === p.userId && room?.started}
                        stackIndex={sharing.findIndex(x => x.userId === p.userId)}
                        stackCount={sharing.length}
                        events={events}
                        onHover={(e, pl) => setHoveredPlayer(pl ? { player: pl, e } : null)}
                    />
                );
            })}

            <BoardOverlay room={room} events={events} players={players} />

            {hovered && (
                <PropertyCard
                    def={hovered.def}
                    state={hovered.state}
                    players={players}
                    style={floatPos(hovered.e)}
                />
            )}
            {hoveredPlayer && (
                <PlayerHoverCard
                    player={hoveredPlayer.player}
                    room={room}
                    anchor={hoveredPlayer.e}
                />
            )}
        </div>
    );
}

function floatPos(e) {
    if (!e) return {};
    const x = e.clientX || 0;
    const y = e.clientY || 0;
    return {
        position: 'fixed',
        left: Math.min(x + 16, window.innerWidth - 300),
        top:  Math.min(y + 12, window.innerHeight - 220),
        pointerEvents: 'none',
    };
}
