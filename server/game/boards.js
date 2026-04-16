// Board definitions. The default board is a world-cities theme (richup-style
// so we can dodge Hasbro's US-city trademarks). Custom boards are persisted
// separately and loaded by id at room creation time.
//
// Tile types:
//   go         — start tile, collect salary on passing
//   property   — buyable colored street; rent scales with houses/hotel
//   station    — railroad / airport (rent scales with how many you own)
//   utility    — rent = dice roll * multiplier (2x with 1 owned, 10x with both)
//   tax        — pay a flat amount to the bank
//   chance     — draw a Chance card
//   chest      — draw a Community Chest card
//   jail       — "just visiting" unless you were sent here
//   gotojail   — sends you to jail
//   parking    — free parking (rule-configurable: nothing / collect pot)
//
// All monetary amounts are in game dollars ($1 = 1 integer). Houses max at 4
// per tile; a 5th house becomes a hotel (stored as `houses: 5`).

const GROUPS = {
    brown:   '#955436',
    lblue:   '#AAE0FA',
    pink:    '#D93A96',
    orange:  '#F7941D',
    red:     '#ED1B24',
    yellow:  '#FEF200',
    green:   '#1FB25A',
    dblue:   '#0072BB',
};

// Rent structure: [base, 1h, 2h, 3h, 4h, hotel]. Classic Monopoly values; the
// rent math isn't copyrightable but the street names are, so we rename tiles.
function property(pos, name, group, price, rent, houseCost, mortgage = null) {
    return {
        pos,
        type: 'property',
        name,
        group,
        price,
        rent,               // [base, 1h, 2h, 3h, 4h, hotel]
        houseCost,          // cost per house AND per hotel (hotel = 4h + 1 more)
        mortgage: mortgage ?? Math.floor(price / 2),
        color: GROUPS[group],
    };
}

function station(pos, name, price = 200) {
    return { pos, type: 'station', name, price, mortgage: price / 2 };
}

function utility(pos, name, price = 150) {
    return { pos, type: 'utility', name, price, mortgage: price / 2 };
}

// ─── Default board: "World Tour" ──────────────────────────────────────────────
// 40 tiles, indexed 0..39 clockwise from GO (bottom-right corner).
const WORLD_TOUR_TILES = [
    { pos: 0,  type: 'go',       name: 'GO' },
    property(1,  'Cairo',        'brown',  60,  [2, 10, 30, 90, 160, 250], 50),
    { pos: 2,  type: 'chest',    name: 'Community Chest' },
    property(3,  'Lagos',        'brown',  60,  [4, 20, 60, 180, 320, 450], 50),
    { pos: 4,  type: 'tax',      name: 'Income Tax', amount: 200 },
    station(5,   'Istanbul'),
    property(6,  'Bangkok',      'lblue',  100, [6, 30, 90, 270, 400, 550], 50),
    { pos: 7,  type: 'chance',   name: 'Chance' },
    property(8,  'Jakarta',      'lblue',  100, [6, 30, 90, 270, 400, 550], 50),
    property(9,  'Manila',       'lblue',  120, [8, 40, 100, 300, 450, 600], 50),
    { pos: 10, type: 'jail',     name: 'Jail / Just Visiting' },
    property(11, 'Lisbon',       'pink',   140, [10, 50, 150, 450, 625, 750], 100),
    utility(12,  'Electric Co.'),
    property(13, 'Madrid',       'pink',   140, [10, 50, 150, 450, 625, 750], 100),
    property(14, 'Barcelona',    'pink',   160, [12, 60, 180, 500, 700, 900], 100),
    station(15,  'Beijing'),
    property(16, 'Vienna',       'orange', 180, [14, 70, 200, 550, 750, 950], 100),
    { pos: 17, type: 'chest',    name: 'Community Chest' },
    property(18, 'Prague',       'orange', 180, [14, 70, 200, 550, 750, 950], 100),
    property(19, 'Warsaw',       'orange', 200, [16, 80, 220, 600, 800, 1000], 100),
    { pos: 20, type: 'parking',  name: 'Free Parking' },
    property(21, 'Dubai',        'red',    220, [18, 90, 250, 700, 875, 1050], 150),
    { pos: 22, type: 'chance',   name: 'Chance' },
    property(23, 'Mumbai',       'red',    220, [18, 90, 250, 700, 875, 1050], 150),
    property(24, 'Delhi',        'red',    240, [20, 100, 300, 750, 925, 1100], 150),
    station(25,  'Sydney'),
    property(26, 'Seoul',        'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
    property(27, 'Osaka',        'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
    utility(28,  'Water Works'),
    property(29, 'Singapore',    'yellow', 280, [24, 120, 360, 850, 1025, 1200], 150),
    { pos: 30, type: 'gotojail', name: 'Go to Jail' },
    property(31, 'Stockholm',    'green',  300, [26, 130, 390, 900, 1100, 1275], 200),
    property(32, 'Amsterdam',    'green',  300, [26, 130, 390, 900, 1100, 1275], 200),
    { pos: 33, type: 'chest',    name: 'Community Chest' },
    property(34, 'Paris',        'green',  320, [28, 150, 450, 1000, 1200, 1400], 200),
    station(35,  'JFK'),
    { pos: 36, type: 'chance',   name: 'Chance' },
    property(37, 'London',       'dblue',  350, [35, 175, 500, 1100, 1300, 1500], 200),
    { pos: 38, type: 'tax',      name: 'Luxury Tax', amount: 100 },
    property(39, 'Tokyo',        'dblue',  400, [50, 200, 600, 1400, 1700, 2000], 200),
];

// Freeze so accidental mutation by engine code throws rather than corrupts.
const WORLD_TOUR = Object.freeze({
    id: 'world-tour',
    name: 'World Tour',
    tiles: WORLD_TOUR_TILES,
    groupColors: GROUPS,
    // Canonical size counts for group ownership / house distribution rules.
    groupSizes: computeGroupSizes(WORLD_TOUR_TILES),
});

function computeGroupSizes(tiles) {
    const sizes = {};
    for (const t of tiles) {
        if (t.type === 'property') sizes[t.group] = (sizes[t.group] || 0) + 1;
    }
    return sizes;
}

// Validate that a board has the required tiles in the right places. Used both
// for the default and for user-uploaded custom boards, so the engine never has
// to deal with missing GO / jail / etc.
function validateBoard(board) {
    const errs = [];
    if (!board || !Array.isArray(board.tiles)) errs.push('tiles array missing');
    if (board?.tiles?.length !== 40) errs.push(`expected 40 tiles, got ${board?.tiles?.length}`);
    const has = (type) => board.tiles?.some(t => t.type === type);
    if (!has('go')) errs.push('missing GO tile');
    if (!has('jail')) errs.push('missing Jail tile');
    if (!has('gotojail')) errs.push('missing Go To Jail tile');
    for (let i = 0; i < (board.tiles || []).length; i++) {
        if (board.tiles[i].pos !== i) errs.push(`tile ${i} has wrong pos ${board.tiles[i].pos}`);
    }
    return errs;
}

// ─── Additional built-in preset boards ──────────────────────────────────────
// Same economic layout (rents/prices identical to WORLD_TOUR), just different
// tile names + theming. Lets us ship multiple feels without balancing work.
function renameBoard(source, id, name, names) {
    const mapped = source.tiles.map(t => {
        if (t.type !== 'property') return t;
        return { ...t, name: names[t.pos] || t.name };
    });
    return Object.freeze({
        id, name,
        tiles: mapped,
        groupColors: GROUPS,
        groupSizes: computeGroupSizes(mapped),
    });
}

// Classic USA — generic US city / neighborhood names, no Hasbro trademarks.
const CLASSIC_USA = renameBoard(WORLD_TOUR, 'classic-usa', 'Classic USA', {
    1:  'Galveston',       3:  'Key West',
    6:  'San Diego',       8:  'Portland',      9:  'Denver',
    11: 'Houston',         13: 'Dallas',        14: 'Austin',
    16: 'Memphis',         18: 'Nashville',     19: 'Atlanta',
    21: 'Philadelphia',    23: 'Baltimore',     24: 'Washington',
    26: 'Cleveland',       27: 'Pittsburgh',    29: 'Buffalo',
    31: 'Detroit',         32: 'Chicago',       34: 'St. Louis',
    37: 'Boston',          39: 'New York',
});

// World Capitals — cities that capital a country. Richup-adjacent feel.
const WORLD_CAPITALS = renameBoard(WORLD_TOUR, 'world-capitals', 'World Capitals', {
    1:  'Port Louis',      3:  'Malé',
    6:  'Rabat',           8:  'Tunis',         9:  'Algiers',
    11: 'Lisbon',          13: 'Dublin',        14: 'Athens',
    16: 'Oslo',            18: 'Helsinki',      19: 'Copenhagen',
    21: 'Moscow',          23: 'Kyiv',          24: 'Bucharest',
    26: 'Beijing',         27: 'Seoul',         29: 'Tokyo',
    31: 'Canberra',        32: 'Wellington',    34: 'Ottawa',
    37: 'Paris',           39: 'London',
});

const BUILTIN_BOARDS = {
    'world-tour':     WORLD_TOUR,
    'classic-usa':    CLASSIC_USA,
    'world-capitals': WORLD_CAPITALS,
};

module.exports = {
    GROUPS,
    WORLD_TOUR,
    BUILTIN_BOARDS,
    validateBoard,
    computeGroupSizes,
};
