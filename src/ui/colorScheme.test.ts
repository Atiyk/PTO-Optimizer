import { describe, it, expect } from 'vitest';
import { contrastRatio } from './scoreFormat';

// Raw RGB behind the tokens under test, kept in sync with colorScheme.ts by hand -
// Tailwind classes aren't introspectable at test time. ptoText is white in scheme B and
// red-950 in scheme A; TEXT_PRIMARY/TEXT_MUTED are scheme-independent slate.
type RGB = [number, number, number];
const SCHEMES: Record<'A' | 'B', { ptoBg: RGB; ptoText: RGB; bandBg: RGB }> = {
  A: { ptoBg: [255, 107, 74], ptoText: [69, 10, 10], bandBg: [94, 234, 212] },
  B: { ptoBg: [30, 58, 138], ptoText: [255, 255, 255], bandBg: [253, 230, 138] },
};
const WHITE: [number, number, number] = [255, 255, 255];
const TEXT_PRIMARY_RGB: [number, number, number] = [30, 41, 59]; // slate-800
const TEXT_MUTED_RGB: [number, number, number] = [100, 116, 139]; // slate-500

describe('every numeral/background pair reaches 4.5:1', () => {
  it.each(['A', 'B'] as const)('scheme %s: ptoText on ptoBg (suggested-pto and pinned both use this pair)', (scheme) => {
    const { ptoBg, ptoText } = SCHEMES[scheme];
    expect(contrastRatio(ptoText, ptoBg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['A', 'B'] as const)('scheme %s: TEXT_PRIMARY (public holiday, suggested-pto-in-band, etc) on white and on the band fill', (scheme) => {
    const { bandBg } = SCHEMES[scheme];
    expect(contrastRatio(TEXT_PRIMARY_RGB, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(TEXT_PRIMARY_RGB, bandBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('TEXT_MUTED (weekend numeral, not in a band) reaches 4.5:1 on white - the only background it ever sits on, since inBand switches to TEXT_PRIMARY', () => {
    expect(contrastRatio(TEXT_MUTED_RGB, WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});
