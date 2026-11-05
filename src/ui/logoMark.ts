/**
 * The Gapless mark (2026-11 brand overhaul): "the bridged G".
 *
 * A G is a ring with a gap in it. In the Gapless mark the gap is still visible, but it is
 * filled with a softer stroke of the same line: the days that join a holiday to a weekend.
 * White strokes on a Line indigo tile, so it holds on light and dark tabs alike, and the
 * strokes are heavy enough to read at 16px (the favicon).
 *
 * One source for the in-page <Logo/>, the generated icon files (scripts/build-icons.ts) and the
 * portrait share card. Colours are CSS variables with hex fallbacks, so the same markup works
 * inside the app (tokens) and as a standalone SVG file (fallbacks).
 */
export const LOGO_COLORS = {
  tile: '#3a36d0',
  stroke: '#ffffff',
  bridge: '#8c89f5',
  ink: '#12141c',
  paper: '#ffffff',
  page: '#f5f6f8',
} as const;

export interface LogoMarkColors {
  tile: string;
  stroke: string;
  bridge: string;
}

// Geometry for a 0 0 32 32 viewBox: a ring of radius 8.5 around (16,16); the gap runs from
// 0 deg (the crossbar's outer end, at 3 o'clock) to 50 deg (the G's upper terminal).
const R = 8.5;
const GAP_END = { x: 21.46, y: 9.49 }; // 50 deg
const BAR_OUTER = { x: 24.5, y: 16 }; // 0 deg

/** The mark's inner SVG markup for a 0 0 32 32 viewBox. */
export function logoMarkInner(colors: LogoMarkColors = {
  tile: `var(--accent, ${LOGO_COLORS.tile})`,
  stroke: LOGO_COLORS.stroke,
  bridge: LOGO_COLORS.bridge,
}): string {
  const stroke = 'fill="none" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"';
  return [
    `<rect width="32" height="32" rx="8" fill="${colors.tile}"/>`,
    // The bridge: the G's gap, filled in with a softer pass of the line.
    `<path d="M${BAR_OUTER.x} ${BAR_OUTER.y}A${R} ${R} 0 0 0 ${GAP_END.x} ${GAP_END.y}" stroke="${colors.bridge}" ${stroke}/>`,
    // The G: the ring from its upper terminal round to the crossbar, then in to the centre.
    `<path d="M${GAP_END.x} ${GAP_END.y}A${R} ${R} 0 1 0 ${BAR_OUTER.x} ${BAR_OUTER.y}H17" stroke="${colors.stroke}" ${stroke}/>`,
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
