import { useEffect, useState } from 'react';

/**
 * Whether the viewport is at least `px` wide, or `null` where it cannot be known (the
 * prerender and jsdom have no matchMedia). Callers pick a CSS-safe layout for `null`, so the
 * prerendered page is right at every width before the script runs. main.tsx mounts with
 * createRoot (no hydration), so reading matchMedia on the first client render is safe.
 */
export function useMinWidth(px: number): boolean | null {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState<boolean | null>(() => read(query));

  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(query);
    } catch {
      return;
    }
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);

  return matches;
}

function read(query: string): boolean | null {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    const mql = window.matchMedia(query);
    return mql ? mql.matches : null;
  } catch {
    return null;
  }
}
