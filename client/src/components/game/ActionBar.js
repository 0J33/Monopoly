import React from 'react';
import { Dice5, ShoppingCart, X, Check, Gavel, Coins, Key, Wallet, Building2, Flag } from 'lucide-react';
import { liquidValue } from './playerStatus';

// Lives inside the board's center area. Tall, full-width so button text never
// truncates. Always renders a status line so the player knows what's happening
// even when no buttons apply to them.
//
// `busy` is true while the dice / token animation for the last roll is still
// playing — the buttons wait for it, so nobody is offered "Buy Boardwalk"
// before their token has visibly arrived there.
/** Where a knocked-out player finished: last out is 2nd, and so on. */
function ordinalOut(room, me) {
    const out = room.players.filter(p => p.bankrupt).sort((a, b) => (b.bankruptAt || 0) - (a.bankruptAt || 0));
    const idx = out.findIndex(p => p.userId === me.userId);
    if (idx < 0) return '';
    const place = room.players.length - idx;
    const suffix = place % 10 === 1 && place % 100 !== 11 ? 'st'
        : place % 10 === 2 && place % 100 !== 12 ? 'nd'
        : place % 10 === 3 && place % 100 !== 13 ? 'rd' : 'th';
    return `${place}${suffix}`;
}

export default function ActionBar({ room, me, isMyTurn, act, busy, onManage }) {
    if (!room || !me) return null;

    const phase = room.turnPhase;
    const def = room.board.tiles[me.position];
    const price = def?.price;
    const nameOf = (uid) => room.players.find(p => p.userId === uid)?.username || 'someone';
    const active = room.players[room.turnIndex];
    const firstDebt = room.debts?.[0];
    const myDebt = firstDebt && firstDebt.userId === me.userId ? firstDebt : null;

    const actions = [];
    let note = null;

    if (me.bankrupt && !room.ended) {
        // Being out of the game is a state the screen has to state. It used to
        // be an empty action area and a greyed-out panel, which reads as the
        // UI having broken rather than as the game having ended for you — and
        // left the obvious question unanswered, so people waited for a way
        // back that does not exist.
        const entry = [...(room.actionLog || [])].reverse().find(e => e.kind === 'bankrupt' && e.userId === me.userId);
        const took = entry?.creditor ? nameOf(entry.creditor) : null;
        return (
            <div className="action-slot">
            <div className="action-status" />
            <div className="action-buttons action-buttons--bill">
            <div className="paper framed bill" role="status" aria-label="You are out">
                <div className="bill-band bill-band--out">
                    <span className="print">Out of the game</span>
                    <span className="mono bill-amount">{ordinalOut(room, me)}</span>
                </div>
                <div className="bill-body">
                    <p className="bill-text">
                        You went bankrupt{took ? <> to <b>{took}</b>, who took everything you owned</> : <>, and everything you owned went back to the bank</>}.
                        {' '}There's no way back in — bankruptcy is final, and money can't be earned from the rail.
                    </p>
                    <div className="bill-short">You're watching the rest play out. The board, the log and chat all stay live.</div>
                </div>
            </div>
            </div>
            </div>
        );
    }

    if (room.ended || me.bankrupt) {
        // nothing to do
    } else if (myDebt) {
        const short = myDebt.amount - me.cash;
        const canRaise = liquidValue(room, me) >= myDebt.amount;
        const bankrupt = () => {
            const to = firstDebt.payees.length === 1 && firstDebt.payees[0].to !== 'bank' && firstDebt.payees[0].to !== 'pot'
                ? nameOf(firstDebt.payees[0].to) : 'the bank';
            if (window.confirm(`Go bankrupt? Everything you own goes to ${to} and you're out of the game.`)) act('bankrupt');
        };
        return (
            <div className="action-slot">
            <div className="action-status" />
            <div className="action-buttons action-buttons--bill">
            <div className="paper framed bill" role="alertdialog" aria-label="Payment due">
                <div className="bill-band">
                    <span className="print">{billTitle(myDebt)}</span>
                    <span className="mono bill-amount">${myDebt.amount.toLocaleString()}</span>
                </div>
                <div className="bill-body">
                    <p className="bill-text">
                        You owe {debtWhat(myDebt, nameOf)}.{' '}
                        {short > 0
                            ? (canRaise ? <>You're <b>${short.toLocaleString()}</b> short — mortgage, sell buildings or trade to raise it.</>
                                        : <>Selling everything won't cover it. Trade for cash, or go bankrupt.</>)
                            : <>You have the cash.</>}
                    </p>
                    {short > 0
                        ? <div className="bill-short">Pay unlocks at ${myDebt.amount.toLocaleString()} · you have ${me.cash.toLocaleString()}</div>
                        : <button className="btn ink lg bill-btn" onClick={() => act('pay-debt')}><Wallet size={18} /> Pay ${myDebt.amount.toLocaleString()}</button>}
                    <div className="bill-row">
                        {me.owned.length > 0 && <button className={`btn ${short > 0 ? 'ink' : 'paper-ghost'} bill-btn`} onClick={onManage}><Building2 size={16} /> Mortgage / sell</button>}
                        <button className="btn paper-ghost bill-btn bill-danger" onClick={bankrupt}><Flag size={16} /> Go bankrupt</button>
                    </div>
                </div>
            </div>
            </div>
            </div>
        );
    } else if (busy) {
        // animation still playing — buttons appear when it lands
    } else if (me.inJail && isMyTurn && phase === 'awaiting-roll') {
        const fine = room.rules.jailFine;
        actions.push({ key: 'roll', icon: Dice5, label: 'Roll for doubles', primary: true, on: () => act('roll') });
        actions.push({ key: 'jail-pay', icon: Coins, label: `Pay $${fine} to get out`, disabled: me.cash < fine, on: () => act('jail-pay') });
        if ((room.jailFreeLedger[me.userId]?.chance || 0) + (room.jailFreeLedger[me.userId]?.chest || 0) > 0) {
            actions.push({ key: 'jail-card', icon: Key, label: 'Use Get Out Free card', on: () => act('jail-card') });
        }
        note = <div className="jail-note">Attempt {Math.min(me.jailTurns + 1, room.rules.jailTurnsMax)} of {room.rules.jailTurnsMax}{me.jailTurns + 1 >= room.rules.jailTurnsMax ? ` — no doubles means paying $${fine} and moving` : ''}</div>;
    } else if (isMyTurn && phase === 'awaiting-roll') {
        actions.push({ key: 'roll', icon: Dice5, label: me.hasRolled ? 'Doubles — roll again' : 'Roll dice', primary: true, on: () => act('roll') });
    } else if (isMyTurn && phase === 'buying') {
        const afford = me.cash >= (price || 0);
        actions.push({ key: 'buy', icon: ShoppingCart, label: afford ? `Buy ${def?.name} — $${price}` : `Can't afford $${price}`, primary: afford, disabled: !afford, on: () => act('buy') });
        actions.push({ key: 'skip', icon: room.rules.auctionUnbought ? Gavel : X, label: room.rules.auctionUnbought ? 'Auction it' : 'Don’t buy', primary: !afford, on: () => act('decline-buy') });
    } else if (isMyTurn && phase === 'awaiting-end-turn') {
        actions.push({ key: 'end', icon: Check, label: 'End turn', primary: true, on: () => act('end-turn') });
    }

    const status = (() => {
        if (room.ended) return 'Game over';
        if (me.bankrupt) return `You're out — watching`;
        if (myDebt) return 'Settle your debt';
        if (firstDebt) return `Waiting for ${nameOf(firstDebt.userId)} to pay $${firstDebt.amount.toLocaleString()}…`;
        // Nothing during an auction: the auction card is already on the table
        // saying so, in more detail, over this very spot.
        if (phase === 'auctioning') return '';
        if (busy) return isMyTurn ? 'Rolling…' : `${active?.username} is rolling…`;
        if (isMyTurn) {
            if (phase === 'buying') return 'Your decision';
            if (me.inJail && phase === 'awaiting-roll') return `You're in ${room.board.jailNoun || 'Jail'}`;
            return 'Your turn';
        }
        if (phase === 'buying') return `${active?.username} is deciding on ${room.board.tiles[active?.position]?.name}…`;
        return `Waiting for ${active?.username}…`;
    })();

    // `display: contents` so the status and the buttons are laid out by the
    // centre stack itself. As one block they moved together: the line of text
    // rode up and down with however many buttons happened to be showing, and
    // at rest it settled straight across the emblem's wordmark.
    return (
        <div className="action-slot">
            <div className="action-status">{status}</div>
            <div className="action-buttons">
            {note}

            {actions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {actions.map(a => (
                        <button
                            key={a.key}
                            className={`btn lg ${a.primary ? 'primary' : a.danger ? 'danger' : ''}`}
                            disabled={a.disabled}
                            onClick={a.on}
                            style={{
                                width: '100%',
                                justifyContent: 'center',
                                fontSize: 'clamp(13px, 1.7vmin, 18px)',
                                padding: 'clamp(9px, 1.4vmin, 14px) clamp(12px, 2vmin, 24px)',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            <a.icon size={18} style={{ flex: '0 0 auto' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</span>
                        </button>
                    ))}
                </div>
            )}
            </div>
        </div>
    );
}

function billTitle(debt) {
    return {
        rent: 'Rent due', 'card-rent': 'Rent due', tax: 'Tax due', 'jail-fine': 'Jail fine',
        repairs: 'Repairs due', 'card-to-each': 'Pay each player', 'card-from-each': 'Pay up', card: 'Payment due',
    }[debt.reason] || 'Payment due';
}

function debtWhat(debt, nameOf) {
    const players = debt.payees.filter(p => p.to !== 'bank' && p.to !== 'pot');
    const to = players.length === 0 ? 'the bank'
        : players.length === 1 ? nameOf(players[0].to)
        : 'the other players';
    const why = {
        rent: ' in rent', 'card-rent': ' in rent', tax: ' in tax',
        'jail-fine': ' for your jail fine', repairs: ' for repairs',
    }[debt.reason] || '';
    return <><b>{to}</b> ${debt.amount.toLocaleString()}{why}</>;
}
