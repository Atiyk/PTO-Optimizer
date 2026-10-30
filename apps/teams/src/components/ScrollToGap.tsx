'use client';

import { useEffect } from 'react';

/** On a narrow screen, scrolls the heatmap sideways so the first gap is in view. */
export function ScrollToGap({ regionId }: { regionId: string }) {
  useEffect(() => {
    const region = document.getElementById(regionId);
    const cell = region?.querySelector<HTMLElement>('[data-gap]');
    if (!region || !cell || region.scrollWidth <= region.clientWidth) return;
    region.scrollLeft = Math.max(0, cell.offsetLeft - region.clientWidth / 2);
  }, [regionId]);
  return null;
}
