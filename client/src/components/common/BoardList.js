import React from 'react';
import { Check } from 'lucide-react';

// The boards you can play, as ruled rows on card stock — name, what it is,
// and its cheapest → dearest street so each is recognisable at a glance.
export default function BoardList({ boards, value, onChange, disabled }) {
    return (
        <div className="ruled board-list" role="radiogroup" aria-label="Board">
            {boards.map(b => {
                const on = b.id === value;
                return (
                    <button key={b.id} type="button" role="radio" aria-checked={on}
                        className={`board-row${on ? ' on' : ''}`}
                        disabled={disabled && !on}
                        onClick={() => !disabled && onChange(b.id)}>
                        <span className="board-check">{on && <Check size={14} strokeWidth={3} />}</span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                            <span className="print board-name">{b.name}{b.authorUsername ? <span className="board-by"> · {b.authorUsername}</span> : null}</span>
                            <span className="board-desc">
                                {b.description || (b.builtin ? '' : 'Community board')}
                                {b.preview?.length === 2 && <> · {b.preview[0]} → {b.preview[1]}</>}
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
