/**
 * Test-side reader for the design tokens in src/index.css (redesign Phase 1). The contrast
 * tests parse the real stylesheet through this instead of keeping a hand-copied list of
 * RGB triples, so a token edit that breaks contrast fails a test immediately. Not imported
 * by any component.
 */
export type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

/** Every `--name: #hex;` declaration in the given CSS text, keyed by name without dashes. */
export function parseHexTokens(css: string): Record<string, RGB> {
  const out: Record<string, RGB> = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    out[m[1]] = hexToRgb(m[2]);
  }
  return out;
}
