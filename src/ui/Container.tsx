import type { ReactNode } from 'react';

/**
 * Layout fix: the page had two widths - full-bleed header bands above a centred ~1152px
 * column below, so at a wide viewport (2560px) the header's content stretched edge to edge
 * while the calendar/cards sat in a narrow strip on the left with the whole right side
 * empty. One content width, defined ONCE here, fixes that: every section wraps its CONTENT
 * in this (never the section's own background/border div, which may still span the full
 * viewport) so every section's text and controls line up on identical left/right edges at
 * any width. 1280px matches Tailwind's own max-w-7xl breakpoint.
 */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl ${className}`}>{children}</div>;
}

/** The one vertical gap between major page sections (calendar, legend, exports, break
 * cards, FAQ) - applied consistently instead of the mix of mt-2/mt-4/mt-6/mt-10 each
 * section used to pick independently. A tight caption directly under something it belongs
 * to (e.g. the calendar's own click-to-pin hint) is deliberately NOT a "section" and keeps
 * its own small gap - this constant is only for section-to-section rhythm. */
export const SECTION_GAP = 'mt-8';
