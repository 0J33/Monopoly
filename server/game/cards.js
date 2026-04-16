// Chance and Community Chest card decks. Each card has a stable `id` (for
// "Get Out of Jail Free" tracking) and an `effect` object the engine
// interprets. Effects are data, not code, so custom boards can ship their
// own decks without shipping JS.
//
// Supported effect shapes (engine.js dispatches on `kind`):
//   { kind: 'money',        amount: +/- N }                     bank ± you
//   { kind: 'moneyAll',     amount: +/- N }                     each opponent ± you
//   { kind: 'moveTo',       pos: N,     passGo: bool }          teleport
//   { kind: 'moveToNearest',target: 'station'|'utility', rentMult?: number }
//   { kind: 'moveBy',       delta: N }                          step along the track
//   { kind: 'goToJail' }
//   { kind: 'jailFree' }                                        consume / retain card
//   { kind: 'repairs',      perHouse: N, perHotel: N }          pay per building

const CHANCE = [
    { id: 'ch_advance_go',        text: 'Advance to GO. Collect $200.',                         effect: { kind: 'moveTo', pos: 0, passGo: true } },
    { id: 'ch_advance_london',    text: 'Advance to London. If you pass GO, collect $200.',     effect: { kind: 'moveTo', pos: 37, passGo: true } },
    { id: 'ch_advance_paris',     text: 'Advance to Paris. If you pass GO, collect $200.',      effect: { kind: 'moveTo', pos: 34, passGo: true } },
    { id: 'ch_advance_barcelona', text: 'Advance to Barcelona. If you pass GO, collect $200.',  effect: { kind: 'moveTo', pos: 14, passGo: true } },
    { id: 'ch_advance_istanbul',  text: 'Take a trip to Istanbul. Pass GO, collect $200.', effect: { kind: 'moveTo', pos: 5, passGo: true } },
    { id: 'ch_nearest_station_1', text: 'Advance to the nearest station. If unowned, you may buy it. If owned, pay the owner double rent.', effect: { kind: 'moveToNearest', target: 'station', rentMult: 2 } },
    { id: 'ch_nearest_station_2', text: 'Advance to the nearest station. If unowned, you may buy it. If owned, pay the owner double rent.', effect: { kind: 'moveToNearest', target: 'station', rentMult: 2 } },
    { id: 'ch_nearest_util',      text: 'Advance to the nearest utility. If unowned, you may buy it. If owned, throw dice and pay 10× the amount rolled.', effect: { kind: 'moveToNearest', target: 'utility', rentMult: 10 } },
    { id: 'ch_bank_dividend',     text: 'Bank pays you a dividend of $50.',                     effect: { kind: 'money', amount: 50 } },
    { id: 'ch_jail_free',         text: 'Get Out of Jail Free. Keep until used or sold.',       effect: { kind: 'jailFree' } },
    { id: 'ch_go_back_3',         text: 'Go back 3 spaces.',                                    effect: { kind: 'moveBy', delta: -3 } },
    { id: 'ch_go_to_jail',        text: 'Go to Jail. Go directly to Jail. Do not pass GO, do not collect $200.', effect: { kind: 'goToJail' } },
    { id: 'ch_repairs',           text: 'Make general repairs on all your property: $25 per house, $100 per hotel.', effect: { kind: 'repairs', perHouse: 25, perHotel: 100 } },
    { id: 'ch_poor_tax',          text: 'Speeding fine. Pay $15.',                              effect: { kind: 'money', amount: -15 } },
    { id: 'ch_elected_chair',     text: 'You have been elected Chair of the Board. Pay each player $50.', effect: { kind: 'moneyAll', amount: -50 } },
    { id: 'ch_building_loan',     text: 'Your building loan matures. Collect $150.',            effect: { kind: 'money', amount: 150 } },
];

const CHEST = [
    { id: 'cc_advance_go',        text: 'Advance to GO. Collect $200.',                          effect: { kind: 'moveTo', pos: 0, passGo: true } },
    { id: 'cc_bank_error',        text: 'Bank error in your favor. Collect $200.',               effect: { kind: 'money', amount: 200 } },
    { id: 'cc_doctor_fee',        text: "Doctor's fee. Pay $50.",                                effect: { kind: 'money', amount: -50 } },
    { id: 'cc_stock_sale',        text: 'From sale of stock you get $50.',                       effect: { kind: 'money', amount: 50 } },
    { id: 'cc_jail_free',         text: 'Get Out of Jail Free. Keep until used or sold.',        effect: { kind: 'jailFree' } },
    { id: 'cc_go_to_jail',        text: 'Go to Jail. Do not pass GO, do not collect $200.',      effect: { kind: 'goToJail' } },
    { id: 'cc_holiday',           text: 'Holiday fund matures. Collect $100.',                   effect: { kind: 'money', amount: 100 } },
    { id: 'cc_income_tax_refund', text: 'Income tax refund. Collect $20.',                       effect: { kind: 'money', amount: 20 } },
    { id: 'cc_birthday',          text: 'It is your birthday. Collect $10 from every player.',   effect: { kind: 'moneyAll', amount: 10 } },
    { id: 'cc_life_insurance',    text: 'Life insurance matures. Collect $100.',                 effect: { kind: 'money', amount: 100 } },
    { id: 'cc_hospital',          text: 'Hospital fees. Pay $100.',                              effect: { kind: 'money', amount: -100 } },
    { id: 'cc_school_fees',       text: 'School fees. Pay $50.',                                 effect: { kind: 'money', amount: -50 } },
    { id: 'cc_consult',           text: 'Receive $25 consultancy fee.',                          effect: { kind: 'money', amount: 25 } },
    { id: 'cc_repairs',           text: 'You are assessed for street repairs: $40 per house, $115 per hotel.', effect: { kind: 'repairs', perHouse: 40, perHotel: 115 } },
    { id: 'cc_beauty_contest',    text: 'You have won second prize in a beauty contest. Collect $10.', effect: { kind: 'money', amount: 10 } },
    { id: 'cc_inherit',           text: 'You inherit $100.',                                     effect: { kind: 'money', amount: 100 } },
];

// Fisher-Yates shuffle. Engine.nextDeck() uses this to reshuffle discard when
// the draw pile runs dry.
function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function newChanceDeck()  { return { draw: shuffled(CHANCE).map(c => c.id), discard: [] }; }
function newChestDeck()   { return { draw: shuffled(CHEST).map(c => c.id),  discard: [] }; }

const BY_ID = {};
for (const c of CHANCE) BY_ID[c.id] = { ...c, deck: 'chance' };
for (const c of CHEST)  BY_ID[c.id] = { ...c, deck: 'chest'  };

function getCard(id) { return BY_ID[id] || null; }

module.exports = {
    CHANCE,
    CHEST,
    newChanceDeck,
    newChestDeck,
    getCard,
    shuffled,
};
