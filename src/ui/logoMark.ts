/**
 * The Gapless mark (2026-11 redesign): an ink sheet with one highlighted row running edge to
 * edge, the day-off run marked straight through with no gap. Two ink day-blocks sit inside the
 * run (the PTO that joined it up). Heavy shapes so it still reads at 16px (the favicon).
 *
 * One source for both the in-page <Logo/> and the generated icon files
 * (scripts/build-icons.ts): colours are CSS variables with hex fallbacks, so the same markup
 * works inside the app (tokens) and as a standalone SVG file (fallbacks).
 */
export const LOGO_COLORS = {
  ink: '#141414',
  accent: '#dcf763',
  paper: '#ffffff',
  page: '#f4f4f0',
} as const;

/** The mark's inner SVG markup for a 0 0 32 32 viewBox. */
export function logoMarkInner(colors: { ink: string; accent: string; paper: string} = {
  ink: `var(--text-primary, ${LOGO_COLORS.ink})`,
  accent: `var(--mark, ${LOGO_COLORS.accent})`,
  paper: `var(--bg-surface, ${LOGO_COLORS.paper})`,
}): string {
  return [
    // The sheet.
    `<rect x="1" y="1" width="30" height="30" rx="5" fill="${colors.ink}"/>`,
    // The marked run, edge to edge.
    `<rect x="1" y="11" width="30" height="10" fill="${colors.accent}"/>`,
    // Two PTO day-blocks inside the run.
    `<rect x="10" y="13" width="5" height="6" rx="0.75" fill="${colors.ink}"/>`,
    `<rect x="17" y="13" width="5" height="6" rx="0.75" fill="${colors.ink}"/>`,
  ].join('');
}

/** A complete standalone SVG document of the mark (favicon.svg and the icon renders). */
export function logoSvgDocument(size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${logoMarkInner(LOGO_COLORS)}</svg>`;
}
