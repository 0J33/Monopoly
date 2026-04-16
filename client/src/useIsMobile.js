import { useEffect, useState } from 'react';

// Simple breakpoint hook. We use mobile layout below 820px wide (covers phones
// in portrait and small tablets). Listens to resize so rotating a tablet
// switches layouts live.
const BREAKPOINT = 820;

export default function useIsMobile(bp = BREAKPOINT) {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < bp : false
    );
    useEffect(() => {
        const on = () => setIsMobile(window.innerWidth < bp);
        window.addEventListener('resize', on);
        window.addEventListener('orientationchange', on);
        return () => {
            window.removeEventListener('resize', on);
            window.removeEventListener('orientationchange', on);
        };
    }, [bp]);
    return isMobile;
}
