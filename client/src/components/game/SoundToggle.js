import React, { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getAudioPrefs, setMuted, setVolume } from '../../sound';

export default function SoundToggle() {
    const [prefs, setPrefs] = useState(getAudioPrefs());
    const [open, setOpen] = useState(false);

    function toggleMute() {
        const next = !prefs.muted;
        setMuted(next);
        setPrefs(p => ({ ...p, muted: next }));
    }
    function onVol(e) {
        const v = Number(e.target.value);
        setVolume(v);
        setPrefs(p => ({ ...p, volume: v }));
    }

    return (
        <div style={{ position: 'relative' }}>
            <button className="btn sm ghost" onClick={() => setOpen(o => !o)} title="Audio settings">
                {prefs.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            {open && (
                <div className="fade-in" style={{
                    position: 'absolute', right: 0, top: '110%',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', padding: 12, width: 180, zIndex: 30,
                    boxShadow: 'var(--shadow-lg)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
                        <span>Mute</span>
                        <button className="btn sm ghost" onClick={toggleMute}>{prefs.muted ? 'Unmute' : 'Mute'}</button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Volume {Math.round(prefs.volume * 100)}%</div>
                    <input type="range" min="0" max="1" step="0.05" value={prefs.volume} onChange={onVol} style={{ width: '100%' }} />
                </div>
            )}
        </div>
    );
}
