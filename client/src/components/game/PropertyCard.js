import React from 'react';

// Detailed property info — rent table, mortgage value, houses. Used as a
// hover popup on the board and inside the trade / property panels.
export default function PropertyCard({ def, state, players, style, compact = false }) {
    if (!def) return null;
    const owner = state?.owner ? players?.find(p => p.userId === state.owner) : null;

    if (def.type === 'property') {
        return (
            <div className="prop-popup fade-in" style={style}>
                <div style={{ background: def.color, height: 20 }} />
                <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{def.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>Price ${def.price} · Mortgage ${def.mortgage} · House ${def.houseCost}</div>
                    <RentTable rent={def.rent} currentHouses={state?.houses ?? 0} />
                    {owner && (
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="dot" style={{ background: owner.color }} /> Owner: {owner.username}
                            {state.mortgaged && <span className="chip" style={{ fontSize: 10 }}>Mortgaged</span>}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (def.type === 'station') {
        return (
            <div className="prop-popup fade-in" style={style}>
                <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{def.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>Station · Price ${def.price}</div>
                    <table className="mono" style={{ width: '100%', fontSize: 12 }}>
                        <tbody>
                            <tr><td>1 owned</td><td style={{ textAlign: 'right' }}>$25</td></tr>
                            <tr><td>2 owned</td><td style={{ textAlign: 'right' }}>$50</td></tr>
                            <tr><td>3 owned</td><td style={{ textAlign: 'right' }}>$100</td></tr>
                            <tr><td>4 owned</td><td style={{ textAlign: 'right' }}>$200</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (def.type === 'utility') {
        return (
            <div className="prop-popup fade-in" style={style}>
                <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{def.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>Utility · Price ${def.price}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
                        One owned: pay 4× dice roll.<br />
                        Both owned: pay 10× dice roll.
                    </div>
                </div>
            </div>
        );
    }
    return null;
}

function RentTable({ rent, currentHouses }) {
    const rows = [
        { label: 'Base',     val: rent[0] },
        { label: '1 house',  val: rent[1] },
        { label: '2 houses', val: rent[2] },
        { label: '3 houses', val: rent[3] },
        { label: '4 houses', val: rent[4] },
        { label: 'Hotel',    val: rent[5] },
    ];
    return (
        <table className="mono" style={{ width: '100%', fontSize: 12 }}>
            <tbody>
                {rows.map((r, i) => (
                    <tr key={i} style={{
                        color: i === currentHouses ? 'var(--accent)' : 'var(--text-2)',
                        fontWeight: i === currentHouses ? 700 : 400,
                    }}>
                        <td>{r.label}</td>
                        <td style={{ textAlign: 'right' }}>${r.val}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
