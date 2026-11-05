/**
 * The Gapless mark (2026-11 brand overhaul): "the bridged G".
 *
 * A square-cut G built like calendar cells. A G is a frame with a gap at its upper right; in
 * this mark that gap is filled by one softer block, the day that joins a holiday to a weekend,
 * set off by a 1-unit cut so it reads as "joined" rather than as a missing corner. Rectilinear
 * on purpose: it does not share the round, crossbar-to-centre silhouette of other G marks.
 * White and lavender on a Line indigo tile, so it holds on light and dark tabs; the bridge is
 * above 3:1 against the tile so it survives at 16px (the favicon).
 *
 * One source for the in-page <Logo/>, the generated icon files (scripts/build-icons.ts), the
 * OG images and the portrait share card. Colours are CSS variables with hex fallbacks, so the
 * same markup works inside the app (tokens) and as a standalone SVG file (fallbacks).
 */
export const LOGO_COLORS = {
  tile: '#3a36d0',
  stroke: '#ffffff',
  bridge: '#bdbbf8',
  ink: '#12141c',
  paper: '#ffffff',
  page: '#f5f6f8',
} as const;

export interface LogoMarkColors {
  tile: string;
  stroke: string;
  bridge: string;
}

/** The glyph as rectangles in a 0 0 32 32 box: [x, y, width, height, part]. */
export const LOGO_GLYPH: readonly (readonly [number, number, number, number, 'stroke' | 'bridge'])[] = [
  [6.5, 6.5, 13.6, 4.4, 'stroke'], // top, stopping one unit short of the bridge
  [6.5, 6.5, 4.4, 19, 'stroke'], // left
  [6.5, 21.1, 19, 4.4, 'stroke'], // bottom
  [21.1, 14.1, 4.4, 11.4, 'stroke'], // right, lower half
  [15.5, 14.1, 10, 4.4, 'stroke'], // crossbar
  [21.1, 6.5, 4.4, 6.6, 'bridge'], // the bridge: the G's gap, filled
];
export const LOGO_GLYPH_RADIUS = 1.2;
export const LOGO_TILE_RADIUS = 8;

/** The mark's inner SVG markup for a 0 0 32 32 viewBox. */
export function logoMarkInner(colors: LogoMarkColors = {
  tile: `var(--accent, ${LOGO_COLORS.tile})`,
  stroke: LOGO_COLORS.stroke,
  bridge: LOGO_COLORS.bridge,
}, tileRadius = LOGO_TILE_RADIUS): string {
  return [
    `<rect width="32" height="32" rx="${tileRadius}" fill="${colors.tile}"/>`,
    ...LOGO_GLYPH.map(([x, y, w, h, part]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${LOGO_GLYPH_RADIUS}" fill="${part === 'bridge' ? colors.bridge : colors.stroke}"/>`),
  ].join('');
}

/** A complete standalone SVG document of the mark (favicon.svg and the icon renders). */
export function logoSvgDocument(size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${logoMarkInner(LOGO_COLORS)}</svg>`;
}

/** The full lockup (mark + "gapless" wordmark) as standalone SVG, for docs and press use.
 * `tone` picks ink text for light grounds or white text for dark grounds. The wordmark is
 * drawn as live text in Archivo, so this is a reference asset; the app renders it in HTML. */
export function logoLockupSvg(tone: 'light' | 'dark' = 'light'): string {
  const text = tone === 'light' ? LOGO_COLORS.ink : '#ffffff';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="176" height="40" viewBox="0 0 176 40"><g transform="translate(0 4)">${logoMarkInner(LOGO_COLORS)}</g><text x="42" y="29" font-family="Archivo, Arial, sans-serif" font-weight="760" font-stretch="88%" font-size="29" letter-spacing="-0.9" fill="${text}">gapless</text></svg>`;
}
