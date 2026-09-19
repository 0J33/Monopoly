# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Groups of friends playing a private game of Monopoly together online, usually on laptops or desktops over a voice call; some join from a phone. One person creates a room and shares the link; everyone else joins by link or six-letter code. No accounts: a name and a token colour are the whole identity.

## Product Purpose

monopoly.ojee.net lets a group play a complete game of Monopoly in the browser: rolling, buying, auctions, trades, houses and hotels, mortgages, jail, debts and bankruptcy, through to a winner. Success is a whole game played to the end without anyone getting stuck, confused about whose turn it is, or unable to read what's happening.

## Positioning

A faithful, full-rules Monopoly for a known group of friends, hosted by one of them — not a public matchmaking service. It plays several boards on the same rules: the classic Atlantic City board, richup.io's default world map, and its own themed boards (World Tour, Classic USA, World Capitals), plus user-made boards from the map editor.

## Operating Context

- A session is one long sitting (often an hour or more) with the game screen open the whole time; the home screen and lobby are brief stops on the way in.
- Players talk over a separate call; the in-game chat and action log are the record of what happened.
- House rules (starting cash, free-parking pot, auctions, even building, jail fine, etc.) are set by the host in the lobby before the game starts.

## Capabilities and Constraints

- React (Create React App) client, Node/Express + socket.io server, deployed on a home server behind nginx. Server is authoritative; the client renders state and animates events.
- Identity is an httpOnly cookie; rooms live in server memory (snapshotted to MongoDB).
- 2–8 players per room; spectators can watch a started game.
- Desktop is the main target; phones must still be fully playable and readable.

## Brand Commitments

- The board is the anchor of the visual identity: dark felt-green table, gold rules, printed tiles with colour bars. New screens and menus should read as part of that same physical game, not as a separate app around it.
- The brand name shown is "Monopoly" with the ojee.net two-dice icon (favicon / touch icons in client/public).

## Evidence on Hand

- Real content only: the boards' tile names, prices and rents (server/game/boards.js), the card decks (server/game/cards.js), house rules (server/game/state.js). No testimonials, player counts or usage claims exist; none should be invented.

## Product Principles

1. Never leave a player stuck: every state shows what's happening and what, if anything, you can do.
2. The game is the interface: controls belong to the table, not to a dashboard around it.
3. Readable at a glance, on the far side of a laptop screen and on a phone.
4. Faithful to the rules people already know; house rules are explicit.

## Accessibility & Inclusion

Text must stay legible on phones (no tiny type in menus); colour is never the only signal for player identity (names and initials accompany token colours).
