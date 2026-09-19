import React from 'react';
import { Train, Plane, Lightbulb, Droplet } from 'lucide-react';

// A title deed card, printed the way the real ones are: the colour band with
// "Title Deed" and the name, the rent table, then house cost and mortgage
// value. Stations and utilities get their own printed faces. `houses`
// highlights the rent line that applies right now.
export default function Deed({ def, state, room, compact = false, fullSet = false }) {
    const houses = state?.houses ?? 0;
    const mortgaged = !!state?.mortgaged;
    const owned = !!state?.owner;
    const groupName = def.type === 'property' ? room?.board?.groupNames?.[def.group] : null;
    const light = def.color && ['#FEF200', '#AAE0FA'].includes(def.color.toUpperCase());

    let header;
    if (def.type === 'property') {
        header = (
            <div className="deed-band" style={{ background: def.color, color: light ? 'var(--ink)' : '#fff' }}>
                <div className="print deed-name">{def.name}</div>
            </div>
        );
    } else {
        const station = def.type === 'station';
        const Icon = station ? (room?.board?.stationNoun === 'airport' ? Plane : Train)
            : def.name.toLowerCase().includes('electric') ? Lightbulb : Droplet;
        header = (
            <div className="deed-plain">
                <Icon size={compact ? 26 : 34} strokeWidth={1.6} />
                <div className="print deed-name">{def.name}</div>
            </div>
        );
    }

    return (
        <div className={`paper framed deed${compact ? ' compact' : ''}${mortgaged ? ' is-mortgaged' : ''}`}>
            {header}
            <div className="deed-body">
                {def.type === 'property' && (
                    <div className="deed-rents">
                        <Line on={owned && houses === 0 && !fullSet} label="Rent" v={def.rent[0]} />
                        <Line on={owned && houses === 0 && fullSet} label="Rent with colour set" v={def.rent[0] * 2} />
                        {[1, 2, 3, 4].map(n => <Line key={n} on={houses === n} label={`With ${n} house${n > 1 ? 's' : ''}`} v={def.rent[n]} />)}
                        <Line on={houses >= 5} label="With hotel" v={def.rent[5]} />
                    </div>
                )}
                {def.type === 'station' && (
                    <div className="deed-rents">
                        {[25, 50, 100, 200].map((v, i) => (
                            <Line key={i} label={i === 0 ? 'Rent' : `If ${i + 1} are owned`} v={v} />
                        ))}
                    </div>
                )}
                {def.type === 'utility' && (
                    <p className="deed-text">
                        If one utility is owned, rent is <b>4×</b> the dice roll.
                        If both are owned, rent is <b>10×</b> the dice roll.
                    </p>
                )}
                <div className="deed-foot">
                    {groupName && <div><b>{groupName}</b> colour set</div>}
                    {def.houseCost != null && <div>Houses cost <b className="mono">${def.houseCost}</b> each · hotels the same, plus 4 houses</div>}
                    <div>Mortgage value <b className="mono">${def.mortgage}</b> · price <b className="mono">${def.price}</b></div>
                </div>
            </div>
            {mortgaged && <div className="deed-stamp print">Mortgaged</div>}
        </div>
    );
}

function Line({ label, v, on }) {
    return (
        <div className={`deed-line${on ? ' on' : ''}`}>
            <span>{label}</span>
            <span className="mono">${v.toLocaleString()}</span>
        </div>
    );
}
