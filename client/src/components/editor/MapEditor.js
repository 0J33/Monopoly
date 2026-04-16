import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';

// Minimal custom-board editor. Starts from the default board and lets you
// rename tiles, change groups, adjust prices. Position + type are locked
// (40-slot standard layout) for this first cut — later we can unlock board
// shape / slot count for truly custom maps.
const GROUPS = {
    brown:  '#955436', lblue:  '#aae0fa', pink:   '#d93a96', orange: '#f7941d',
    red:    '#ed1b24', yellow: '#fef200', green:  '#1fb25a', dblue:  '#0072bb',
};

export default function MapEditor({ pushToast }) {
    const nav = useNavigate();
    const [board, setBoard] = useState(null);
    const [presets, setPresets] = useState([]);
    const [selected, setSelected] = useState('world-tour');
    const [name, setName] = useState('My Custom Board');

    useEffect(() => {
        api.listBoards().then(({ builtin }) => setPresets(builtin || [])).catch(() => {});
    }, []);

    useEffect(() => {
        api.getBoard(selected).then(b => {
            setBoard({ ...b, id: `custom_${Date.now().toString(36)}` });
            setName(`${b.name} (remix)`);
        }).catch(() => pushToast('Failed to load starter board'));
    }, [selected, pushToast]);

    if (!board) return <div className="grid-bg" style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Loading…</div>;

    function updateTile(pos, patch) {
        setBoard(b => ({
            ...b,
            tiles: b.tiles.map(t => t.pos === pos ? { ...t, ...patch, color: patch.group ? GROUPS[patch.group] : t.color } : t),
        }));
    }

    async function save() {
        try {
            await api.saveBoard({
                id: board.id,
                name,
                tiles: board.tiles,
                groupColors: GROUPS,
                isPublic: true,
            });
            pushToast('Board saved', 'success');
            nav('/');
        } catch (e) {
            pushToast(e.message || 'Save failed');
        }
    }

    return (
        <div className="grid-bg" style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                    <button className="btn ghost sm" onClick={() => nav('/')}><ArrowLeft size={14} /> Back</button>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>Map Editor</div>
                    <div style={{ flex: 1 }} />
                    <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        Start from:
                        <select value={selected} onChange={e => setSelected(e.target.value)} style={{ fontSize: 13 }}>
                            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </label>
                    <input value={name} onChange={e => setName(e.target.value.slice(0, 40))} placeholder="Board name" style={{ width: 220, fontSize: 14 }} />
                    <button className="btn primary" onClick={save}><Save size={14} /> Save</button>
                </header>

                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                <th style={cellStyle}>#</th>
                                <th style={cellStyle}>Type</th>
                                <th style={cellStyle}>Name</th>
                                <th style={cellStyle}>Group</th>
                                <th style={cellStyle}>Price</th>
                                <th style={cellStyle}>Houses</th>
                                <th style={cellStyle}>Rent (0/1/2/3/4/htl)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {board.tiles.map(t => (
                                <tr key={t.pos} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={cellStyle}><span className="mono" style={{ color: 'var(--text-3)' }}>{t.pos}</span></td>
                                    <td style={cellStyle}>{t.type}</td>
                                    <td style={cellStyle}>
                                        <input value={t.name || ''} onChange={e => updateTile(t.pos, { name: e.target.value.slice(0, 30) })} style={{ width: '100%', fontSize: 12 }} />
                                    </td>
                                    <td style={cellStyle}>
                                        {t.type === 'property' ? (
                                            <select value={t.group} onChange={e => updateTile(t.pos, { group: e.target.value })} style={{ fontSize: 12 }}>
                                                {Object.keys(GROUPS).map(g => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        ) : '—'}
                                    </td>
                                    <td style={cellStyle}>
                                        {t.price != null ? (
                                            <input type="number" min={0} value={t.price} style={{ width: 80, fontSize: 12 }}
                                                   onChange={e => updateTile(t.pos, { price: Number(e.target.value), mortgage: Math.floor(Number(e.target.value) / 2) })} />
                                        ) : '—'}
                                    </td>
                                    <td style={cellStyle}>
                                        {t.houseCost != null ? (
                                            <input type="number" min={0} value={t.houseCost} style={{ width: 70, fontSize: 12 }}
                                                   onChange={e => updateTile(t.pos, { houseCost: Number(e.target.value) })} />
                                        ) : '—'}
                                    </td>
                                    <td style={cellStyle}>
                                        {t.rent ? (
                                            <div style={{ display: 'flex', gap: 2 }}>
                                                {t.rent.map((r, i) => (
                                                    <input key={i} type="number" min={0} value={r} style={{ width: 56, fontSize: 11, padding: 4 }}
                                                           onChange={e => {
                                                               const v = [...t.rent];
                                                               v[i] = Number(e.target.value);
                                                               updateTile(t.pos, { rent: v });
                                                           }} />
                                                ))}
                                            </div>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const cellStyle = { padding: '8px 10px', textAlign: 'left', verticalAlign: 'middle' };
