import React, { useState } from 'react';
import Tile from './Tile';
import PlayerToken from './PlayerToken';
import Dice from './Dice';
import PropertyCard from './PropertyCard';
import BoardOverlay from './BoardOverlay';
import PlayerHoverCard from './PlayerHoverCard';
import ActionBar from './ActionBar';
import './board.css';

export default function Board({ room, userId, diceRolling, events, act, me, isMyTurn, onTileClick }) {
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
                    onClick={() => onTileClick?.(i)}
                    onHover={(e, def) => setHovered(def ? { def, state: tileState[i], e } : null)}
                />
            ))}

            <div className="board-center">
                <div className="brand">MONOPOLY</div>
                <div className="center-stack">
                    <Dice
                        dice={room?.lastDice}
                        rolling={diceRolling}
                    />
                    {room?.lastDiceRoller && (
                        <div style={{ fontSize: '1.1vmin', color: 'var(--text-3)' }}>
                            {players.find(p => p.userId === room.lastDiceRoller)?.username || '—'} rolled
                        </div>
                    )}
                    <ActionBar
                        room={room}
                        me={me}
                        isMyTurn={isMyTurn}
                        act={act}
                    />
                </div>
            </div>

            {players.filter(p => !p.bankrupt).map((p) => {
                const stackIdx = players.filter(x => !x.bankrupt && x.position === p.position)
                    .findIndex(x => x.userId === p.userId);
                return (
                    <PlayerToken
                        key={p.userId}
                        player={p}
                        isActive={active?.userId === p.userId && room?.started}
                        stackIndex={stackIdx}
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
