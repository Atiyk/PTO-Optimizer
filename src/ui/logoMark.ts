import { MARK_G_PATH } from './logoOutlines';

/**
 * The Gapless mark (2026-11 logo system): the condensed G of the wordmark, in ink, on a
 * marker tile. The tile is the highlighter colour so the favicon stays bright on both light and
 * dark browser tabs; the G is outlined from the site's Archivo (src/ui/logoOutlines.ts), so it
 * renders the same in the header, the icon files and the portrait export.
 *
 * One source for both the in-page <LogoMark/> and the generated icon files
 * (scripts/build-icons.ts): colours are CSS variables with hex fallbacks, so the same markup
 * works inside the app (tokens) and as a standalone SVG file (fallbacks).
 */
export const LOGO_COLORS = {
  ink: '#141414',
  accent: '#dcf763',
  paper: '#ffffff',
  page: '#f4f4f0',
} as const;

/** The mark's inner SVG markup for a 0 0 32 32 viewBox. `paper` is kept for callers that pass
 * a full palette; this mark does not use it. */
export function logoMarkInner(colors: { ink: string; accent: string; paper?: string } = {
  ink: `var(--text-primary, ${LOGO_COLORS.ink})`,
  accent: `var(--mark, ${LOGO_COLORS.accent})`,
}): string {
  return [
    // The marker tile.
    `<rect width="32" height="32" rx="7" fill="${colors.accent}"/>`,
    // The G.
    `<path d="${MARK_G_PATH}" fill="${colors.ink}"/>`,
  ].join('');
}

/** A complete standalone SVG document of the mark (favicon.svg and the icon renders). */
export function logoSvgDocument(size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${logoMarkInner(LOGO_COLORS)}</svg>`;
}
