import { useState, useEffect } from 'react';

/**
 * True on devices with real pointer hover (mouse/trackpad), false on touch-only devices.
 * Hover doesn't exist on touch, so tap must take a different interaction path (see DayCell).
 */
export function useHasHover(): boolean {
  const [hasHover, setHasHover] = useState(() => {
    try {
      return window.matchMedia('(hover: hover)').matches;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia('(hover: hover)');
    } catch {
      return;
    }
    const onChange = () => setHasHover(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return hasHover;
}
