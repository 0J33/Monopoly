---
name: Monopoly
description: Printed game components dealt onto a felt table — decks, title deeds and place cards instead of dashboard panels.
colors:
  paper: "#f3ead3"
  paper-2: "#e6dabb"
  paper-3: "#d8caa6"
  ink: "#1d1911"
  ink-2: "#4b4333"
  ink-3: "#6f6450"
  rule: "rgba(29, 25, 17, 0.2)"
  rule-2: "rgba(29, 25, 17, 0.1)"
  chance: "#f08a1c"
  chance-ink: "#3a1d00"
  chest: "#2f78d0"
  chest-ink: "#f3f7ff"
  felt-hi: "#1a5236"
  felt-mid: "#10351f"
  felt-lo: "#081a10"
  gold: "#f6c445"
  gold-2: "#ffd968"
  gold-deep: "#c8971f"
  bg: "#0c1210"
  bg-1: "#111813"
  surface: "#15201a"
  surface-2: "#1c2a22"
  surface-3: "#26362c"
  border: "#2c3b31"
  border-2: "#3d5142"
  text: "#eef2ec"
  text-2: "#b6c2b6"
  text-3: "#869382"
  money: "#46d38a"
  success: "#34d399"
  danger: "#f87171"
  info: "#4c8dff"
  stamp-red: "#b3261e"
  note-green: "#d9ecd0"
  note-green-ink: "#173a16"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.02em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.08em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  emblem:
    fontFamily: "Fredoka, Inter, system-ui, sans-serif"
    fontSize: "2.6vmin"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "1px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  card: "12px"
  lg: "14px"
  tray: "16px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "26px"
  xxl: "34px"
components:
  card-stock:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px 22px 22px"
  band-chance:
    backgroundColor: "{colors.chance}"
    textColor: "{colors.chance-ink}"
    rounded: "12px 12px 0 0"
    padding: "16px 20px 14px"
  band-chest:
    backgroundColor: "{colors.chest}"
    textColor: "{colors.chest-ink}"
    rounded: "12px 12px 0 0"
    padding: "16px 20px 14px"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ink-hover:
    backgroundColor: "#000000"
    textColor: "#ffffff"
  button-paper-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-gold:
    backgroundColor: "{colors.gold}"
    textColor: "#2a1e05"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  field:
    backgroundColor: "rgba(255,255,255,0.35)"
    textColor: "{colors.ink}"
    rounded: "4px 4px 0 0"
    padding: "8px 10px 7px"
  field-focus:
    backgroundColor: "rgba(255,255,255,0.7)"
  puck:
    rounded: "{rounded.pill}"
    size: "34px"
  mini-deed:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "8px"
    padding: "7px 9px 8px"
  tray:
    textColor: "{colors.text}"
    rounded: "{rounded.tray}"
    padding: "16px 18px"
  note-chip:
    backgroundColor: "{colors.note-green}"
    textColor: "{colors.note-green-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
---

# Design System: Monopoly

## Overview

**Creative North Star: "Components Dealt Onto the Felt"**

Every surface outside the board is a printed object from the box lying on a green felt table: a deck with two cards peeking out from under the top one, a title deed with its colour band and rent table, a place card you write your name on, a bank note, a bill. The felt is lit from above-centre and falls off toward the table edge; card stock carries a paper grain, an inset highlight on its top edge and a printed hairline frame 7px in from its own edge. Nothing here is a panel with a border; everything is a thing with a shadow under it.

The system is deliberately two-layered, and the split is real rather than an accident to be cleaned up. The **table layer** (`table.css`) — paper, ink, Chance orange, Chest blue, felt — owns the home screen, the lobby and every in-game menu. The **table-chrome layer** (`theme.css`) — the dark green-black surface ramp with gold accents — owns the board, the player panels, the action log and the chat/trades drawers, and it is the settled world the paper menus were built to sit on. Menus are cream objects; the app around the board is dark felt and gold. Both are correct; mixing them inside a single element is not.

Density is generous on the way in (two decks and a place card fill a 1080px column) and tight once play starts (the board is the screen; menus arrive as cards over it). The refused reference is explicit and visible in the diff: the dark-dashboard card grid the home and lobby screens used to be.

**Key Characteristics:**
- Cream card stock on dark felt, never a flat surface panel.
- A printed hairline frame inside every card edge.
- Condensed uppercase for anything printed; Inter for prose; mono for every number.
- Chance orange and Chest blue as the two menu voices, taken from the deck backs.
- One authored motion per screen: the card is dealt.

## Colors

Two palettes in one product: warm printed card stock for menus, deep felt green and gold for the board and its chrome.

### Primary
- **Chance Orange** (`chance`): the "start / act / mine" voice. It bands the Start-a-game deck and the auction card, tints the selected board row, and is the focus-ring colour anywhere inside paper.
- **Chest Blue** (`chest`): the "join / receive / info" voice. It bands the Join-a-game deck and the house-rules card, and tints open-table row hover.
- **Table Gold** (`gold`, with `gold-2` / `gold-deep`): the brand accent of the board layer — wordmark, board hairline, active token halo, tray borders, primary CTA on dark, and the focus ring on felt.

### Secondary
- **Felt Green** (`felt-hi` / `felt-mid` / `felt-lo`): the table. A radial lit centre at 50% 18% falling to the edge, over a fine SVG turbulence nap, fixed to the viewport so the cards move and the table doesn't.

### Tertiary
- **Stamp Red** (`stamp-red`): only for cancellation and pressure — the MORTGAGED stamp (multiply-blended, rotated -14°), the hot auction clock, the debt band.
- **Bank Note Green** (`note-green` on `note-green-ink`): money quoted as a printed slip inside menus. Distinct from `money`, which is the on-screen cash colour in the dark layer.

### Neutral
- **Card Stock** (`paper`, `paper-2`, `paper-3`): the top card, the card under it, the card under that. `paper-3` doubles as the mortgaged mini-deed body.
- **Ink** (`ink`, `ink-2`, `ink-3`): printed type at three strengths; `ink-3` is the lightest that still clears 4.5:1 on paper and is the floor for secondary text.
- **Printed Rule** (`rule`, `rule-2`): hairlines. `rule` is a printed frame or a section divider; `rule-2` is a ruled row inside a list.
- **Dark Ramp** (`bg` → `surface-3`, `border`, `border-2`, `text` → `text-3`): the board layer's surfaces, strokes and type.

### Named Rules
**The Two-Table Rule.** Paper tokens and dark-ramp tokens never meet inside one element. A menu is card stock with ink type; the board and its chrome are dark surfaces with gold. A tray is the one sanctioned seam: felt shell, paper cards inside it.

**The Deck-Back Rule.** Orange means start/act/yours; blue means join/receive/theirs. A band colour is chosen from that meaning, never for variety.

**The Ink-Three Floor Rule.** No printed text goes lighter than `ink-3` on paper. If a label feels too loud at `ink-3`, shrink it or letterspace it — do not fade it.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow) — weights 600/700 only
**Body Font:** Inter (with system-ui) — 400–900
**Label/Mono Font:** JetBrains Mono (with ui-monospace) — 500/700
**Legacy Display:** Fredoka — survives only inside the board's centre emblem and banners

**Character:** Condensed caps do all the printing — wordmark, deck titles, deed names, tile names, button faces, field labels — exactly as lettering does on a board and its cards. Inter carries every sentence a player actually reads. Mono carries every number, tabular, so rent columns line up.

### Hierarchy
- **Display** (700, 40–50px, 0.95): screen wordmark, deck titles, deed names on the full title deed, the victory name. Uppercase, 0.02em.
- **Headline** (700, 26px, 0.95): the head of a card or tray — "The board", "House rules", tray titles. Uppercase.
- **Title** (700, 15–19px): seat names, board names in the chooser, rent values. Sentence case, Inter.
- **Body** (400–600, 13–15px, 1.35–1.5): descriptions, hints, deed footer text, log-free prose. Notes and hints sit at 13px in `ink-3`.
- **Label** (700, 11–14px, 0.06–0.08em, uppercase): the `print-sm` stamp — field labels, section headers on felt, seat tags. This is the only uppercase Inter-free small type in the system.
- **Mono** (500–700, 13–22px, tabular): money, room codes (22px at 0.35em tracking, centred), auction bids, rank rows.

### Named Rules
**The Printed-Type Rule.** Anything that would be printed on a physical component is Barlow Condensed uppercase. Anything a player reads as a sentence is Inter. There is no third option.

**The Tabular Money Rule.** Every currency figure is JetBrains Mono with tabular numerals, so a rent table reads as a column and not as ragged prose.

**The Fit-The-Tile Rule.** Tile names size themselves to the tile in container units and hyphenate rather than truncate mid-word ("PENNSYL-VANIA"), clamped at three lines. Never chop a name at an arbitrary letter.

## Layout

Both entry screens are a single centred column capped at 1080px: home at `28px 28px 48px` padding, lobby at `24px 28px 48px`. Home is a two-column deck grid (`1fr 1fr`, 36px gutter) with the place card spanning beneath; lobby is `minmax(0,1fr) minmax(0,420px)` at a 34px gutter, seats in a two-up grid.

The spacing rhythm is coarse and card-like rather than a strict 4/8 scale: 6 and 10 inside a row, 16 and 22 inside a card, 26 and 34 between cards. Inside paper, horizontal padding always exceeds vertical at the foot of a card (`16px 22px 22px`) so type never crowds the printed frame.

Responsive behaviour is authored, not just reflowed. At ≤820px home collapses to one column and the place card moves to the top (`order: 0`) — you name yourself before you pick a table; at ≤420px the place card's avatar puck is dropped and the header wraps. Lobby collapses at ≤860px, seats go single-column at ≤440px. Menus have their own breaks: the auction's rotated deed is dropped below 720px, the trade table's two sides stack at 640px with the dashed divider moving from left border to top border, and the mini-deed hand reflows on `auto-fill, minmax(132px→120px, 1fr)`. Trays cap at `calc(100dvh - 24px)` and scroll their body, never the page.

The board itself is a 1:1 `container-type: inline-size` square; everything inside it sizes in `vmin` or `cqw` so the board scales as one object.

## Elevation & Depth

Hybrid, and physical in both layers. Cards are lifted objects: a three-part shadow (`--card-shadow`) gives a 1px contact line, a 10px body shadow and a 24px diffuse table shadow, plus an inset top highlight that reads as the lit edge of stock. The dark layer uses tonal stacking (`bg` → `surface-3`) with gold inset hairlines instead, and reserves glow (`--shadow-glow`) for the gold CTA and the active token.

### Shadow Vocabulary
- **Card on table** (`0 1px 1px rgba(0,0,0,0.35), 0 10px 24px -6px rgba(0,0,0,0.6), 0 24px 48px -18px rgba(0,0,0,0.55)`): any `.paper` surface.
- **Card under card** (`0 1px 1px rgba(0,0,0,0.3), 0 8px 18px -6px rgba(0,0,0,0.5)`): the deck-under layers.
- **Mini-deed in hand** (`0 1px 1px rgba(0,0,0,0.35), 0 6px 14px -6px rgba(0,0,0,0.6)`): a deed small enough to hold.
- **Tray on felt** (`inset 0 0 0 1px rgba(0,0,0,0.4), 0 30px 60px -20px rgba(0,0,0,0.8)`): full-menu shells.
- **Puck gloss** (`0 2px 5px rgba(0,0,0,0.55), inset 0 -2px 3px rgba(0,0,0,0.35), inset 0 2px 3px rgba(255,255,255,0.45)`): tokens, as moulded plastic.
- **Panel** (`--shadow` / `--shadow-lg`) and **glow** (`--shadow-glow`): dark-layer surfaces and gold state only.

### Named Rules
**The Lifted-Stock Rule.** Card stock always carries the card shadow and the inset top highlight. A `.paper` element with a flat drop shadow reads as a div, which is the thing this system exists to refuse.

**The One-Dealt-Moment Rule.** Each screen gets exactly one authored motion: `.dealt` (0.42s, rise 18px out of a -1.5° tilt), staggered 0/70/140ms across at most three elements. Hover motion is limited to ±2–4px lifts and the deck fanning wider. Everything is disabled under `prefers-reduced-motion`.

## Shapes

Radii are card-derived: 12px for a full card, 8px for a mini-deed, 10px for a button or seat, 6px for a hoverable row, 4px for a stamp, chip or field top, 16px for a tray, 50% for pucks. The printed frame is the signature form: `inset: 7px`, 1.5px solid `rule`, 7px radius — a smaller rounded rectangle nested inside the card's own 12px corner. Colour bands cap a card with `12px 12px 0 0` and a 1.5px black-alpha underline, as ink printed onto the stock before cutting.

Borders are hairlines that describe printing, not containment: 1px `rule-2` between ruled rows, 1px `rule` under a section, 1.5px dashed `ink-3` around a room code, 1px dashed gold-alpha between the two sides of a trade. The only heavy stroke in the system is the 2px `ink` underline of a fill-in field, and the 2px white rim of a puck.

## Components

### Buttons
- **Shape:** softly rounded (10px); `sm` 6/10px padding, `lg` 14/24px.
- **Ink (primary on paper):** solid `ink` on `paper`, Barlow Condensed 700 uppercase 18px at 0.06em, with an inset top highlight and a 3px lift shadow. Hover goes to pure black on white. Disabled drops to 0.35 opacity.
- **Paper ghost (secondary on paper):** transparent with a `rule` hairline and ink type; hover fills 6% ink and darkens the stroke to `ink-3`.
- **Gold (primary on dark):** the legacy CTA — a `gold-2 → gold` vertical gradient with a `gold-deep` 2px bottom edge that compresses to 1px on press. Board layer only.
- **Focus:** 2px gold outline at 2px offset on felt; the same ring switches to Chance orange inside paper.

### Chips
- **Note chip:** money quoted inside a menu — bank-note green stock, mono 700, 4px corners, 1px black-alpha stroke.
- **Seat tag:** condensed uppercase 11px in `ink-2` inside a 1px `rule` box with 4px corners; the away variant goes burnt orange (`#8a3a12`).
- **Legacy chip:** on dark surfaces, a pill (999px) on `surface-2` with a `border` stroke at 12px.

### Cards / Containers
- **Corner Style:** 12px, with the printed frame inset 7px at 7px.
- **Background:** `paper` plus a fractal-noise paper grain; `paper-2` / `paper-3` for the cards stacked beneath.
- **Shadow Strategy:** card-on-table, always (see Elevation).
- **Border:** none on the outside — the frame is inside.
- **Internal Padding:** 16–22px; ruled rows 4–10px.

### Inputs / Fields
- **Style:** fill-in-the-blank, not a box — translucent white wash, no side or top borders, a 2px `ink` baseline, 4px top corners, Inter 600 at 17px.
- **Focus:** the wash brightens to 70% white and the baseline turns Chance orange; no outline.
- **Code variant:** JetBrains Mono, 22px, 0.35em tracking, uppercase, centred — a code written into a blank.
- **Dark-layer inputs:** `surface-2` with a `border` stroke at 6px, focusing to gold.

### Navigation
There is no nav bar. Each screen carries one header row: wordmark left, a single ghost action right (Map editor / Leave table), in warm off-white at 85% over felt. At ≤420px the header wraps rather than dropping its label.

### Deck (signature)
Two `deck-under` cards sit behind the top card at `translate(7px,8px) rotate(1.8deg)` and `translate(-4px,5px) rotate(-1.2deg)`; hovering the deck fans them further out over 0.25s. Used for the two home choices and the lobby's board and house-rules cards.

### Title Deed (signature)
Card stock, framed, capped at 300px, with a property-colour band inset 12px inside the card (its own 1.5px black-alpha stroke, band text auto-switching to ink on light groups), the deed name in condensed 30px, a rent ladder of ruled rows where the live row inverts to ink-on-paper, and a footer rule carrying house cost and mortgage value in mono. A `compact` variant drops the name to 22px. Mortgaged deeds desaturate 60% and take the rotated multiply-blend stamp.

### Token Puck (signature)
A 34px circle with a radial gloss highlight at 34%/28%, a 2px white rim and inset shadows, label text auto-inverting on light colours. As a picker it lifts 2px on hover and, when selected, lifts and scales to 1.08 inside a double ring of ink then gold.

### Tray (signature)
The full-menu shell for assets and trades: felt background, 16px corners, a 1px gold-alpha border, gold-alpha hairlines under the head and over the foot, a dark-washed foot bar, and a scrolling body holding mini-deeds in an auto-fill hand.

## Do's and Don'ts

### Do:
- **Do** build a new menu from an existing printed object — card stock, a deed, a slip, a bill — before reaching for a generic panel.
- **Do** put the printed frame (`inset 7px`, 1.5px `rule`, 7px radius) on every full card; it is the system's signature.
- **Do** pick band colour by meaning: Chance orange for start/act/yours, Chest blue for join/receive/theirs, property colour for a deed.
- **Do** set every number in JetBrains Mono with tabular numerals.
- **Do** let condensed uppercase carry printed labels and Inter carry sentences.
- **Do** keep the focus ring gold on felt and Chance orange inside paper.
- **Do** give a new screen exactly one `.dealt` moment, staggered over at most three elements, and honour `prefers-reduced-motion`.
- **Do** size anything inside the board in `vmin`/`cqw` so it scales with the board as one object.

### Don't:
- **Don't** mix the paper palette and the dark ramp inside one element; a tray's felt shell holding paper cards is the only sanctioned seam.
- **Don't** put a visible outer border on card stock — depth comes from the shadow and the inner frame.
- **Don't** take printed text below `ink-3` on paper, or below `text-3` on the dark ramp.
- **Don't** box an input inside a menu; fields are a translucent wash over a 2px ink baseline.
- **Don't** add a second animated moment to a screen that already has its deal.
- **Don't** introduce a new accent hue. Orange, blue, gold, property colours, stamp red and bank-note green are the whole vocabulary.
- **Don't** truncate a property name mid-word; hyphenate and clamp at three lines instead.
- **Don't** use Fredoka on any new surface — it is legacy, confined to the board's centre emblem and banners.
