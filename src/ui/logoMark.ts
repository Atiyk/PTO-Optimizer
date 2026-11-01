/**
 * The Gapless mark (redesign Phase 1): a calendar page whose middle row is one solid run in
 * the accent, with no gap between the days - the product in one picture. Drawn on a 32-unit
 * grid with heavy strokes so it still reads at 16px (the favicon).
 *
 * One source for both the in-page <Logo/> and the generated icon files
 * (scripts/build-icons.ts): colours are CSS variables with hex fallbacks, so the same markup
 * works inside the app (tokens) and as a standalone SVG file (fallbacks).
 */
export const LOGO_COLORS = {
  ink: '#1c1917',
  accent: '#c2410c',
  paper: '#ffffff',
  page: '#fbf8f3',
} as const;

/** The mark's inner SVG markup for a 0 0 32 32 viewBox. */
export function logoMarkInner(colors: { ink: string; accent: string; paper: string} = {
  ink: `var(--text-primary, ${LOGO_COLORS.ink})`,
  accent: `var(--accent, ${LOGO_COLORS.accent})`,
  paper: `var(--bg-surface, ${LOGO_COLORS.paper})`,
}): string {
  return [
    // Page with a solid header band (the calendar's top edge).
    `<rect x="3" y="5" width="26" height="24" rx="5.5" fill="${colors.paper}" stroke="${colors.ink}" stroke-width="2.5"/>`,
    `<path d="M3 10.5a5.5 5.5 0 0 1 5.5-5.5h15a5.5 5.5 0 0 1 5.5 5.5V12H3z" fill="${colors.ink}"/>`,
    // Binding rings.
    `<rect x="9" y="2" width="3" height="6" rx="1.5" fill="${colors.ink}"/>`,
    `<rect x="20" y="2" width="3" height="6" rx="1.5" fill="${colors.ink}"/>`,
    // The gapless run: one continuous block across the week.
    `<rect x="7" y="16" width="18" height="8" rx="2.5" fill="${colors.accent}"/>`,
  ].join('');
}

/** A complete standalone SVG document of the mark (favicon.svg and the icon renders). */
export function logoSvgDocument(size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${logoMarkInner(LOGO_COLORS)}</svg>`;
}
