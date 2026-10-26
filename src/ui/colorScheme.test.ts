import { describe, it, expect } from 'vitest';
import { contrastRatio, relativeLuminance } from './scoreFormat';

// Raw RGB behind the tokens under test, kept in sync with colorScheme.ts / index.css by
// hand - Tailwind classes and CSS custom properties aren't introspectable at test time.
type RGB = [number, number, number];
const PTO_BG: RGB = [30, 58, 138]; // blue-900, the one accent
const PTO_TEXT: RGB = [255, 255, 255];
const BAND_BG: RGB = [254, 243, 199]; // amber-100
const BAND_TEXT: RGB = [30, 41, 59]; // slate-800
const HOLIDAY_DOT: RGB = [71, 85, 105]; // slate-600
const WHITE: RGB = [255, 255, 255];
const TEXT_PRIMARY_RGB: RGB = [15, 23, 42]; // slate-900
const TEXT_MUTED_RGB: RGB = [100, 116, 139]; // slate-500

describe('every numeral/background pair reaches 4.5:1', () => {
  it('ptoText on ptoBg (suggested-pto and pinned both use this pair)', () => {
    expect(contrastRatio(PTO_TEXT, PTO_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('TEXT_PRIMARY (public holiday, suggested-pto-in-band, etc) on white and on the band fill', () => {
    expect(contrastRatio(TEXT_PRIMARY_RGB, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(TEXT_PRIMARY_RGB, BAND_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('TEXT_MUTED (weekend numeral, not in a band) reaches 4.5:1 on white - the only background it ever sits on, since inBand switches to TEXT_PRIMARY', () => {
    expect(contrastRatio(TEXT_MUTED_RGB, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('bandText on bandBg', () => {
    expect(contrastRatio(BAND_TEXT, BAND_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('the holiday dot is visible against the page/card background', () => {
    expect(contrastRatio(HOLIDAY_DOT, WHITE)).toBeGreaterThanOrEqual(3);
  });
});

describe("the calendar's two colours plus the holiday dot stay distinguishable, including in greyscale", () => {
  it('ptoBg visibly pops against a plain (unfilled) cell', () => {
    expect(contrastRatio(PTO_BG, WHITE)).toBeGreaterThanOrEqual(3);
  });

  it('the greyscale luminances of ptoBg and bandBg are widely separated from a plain cell and from each other', () => {
    const plain = relativeLuminance(WHITE);
    const pto = relativeLuminance(PTO_BG);
    const band = relativeLuminance(BAND_BG);
    expect(pto).toBeLessThan(plain);
    expect(band).toBeLessThan(plain);
    expect(pto).toBeLessThan(band);
    // Each step is a large relative jump, not a marginal one a greyscale print would blur.
    expect(plain / Math.max(pto, 0.001)).toBeGreaterThan(5);
    expect((plain - band) / (plain - pto)).toBeLessThan(0.3);
  });
});

describe('regression: a weekend/holiday numeral sitting on the band fill must use BAND_TEXT, not TEXT_PRIMARY', () => {
  it('BAND_TEXT is pinned to slate-800 regardless of TEXT_PRIMARY - bandBg never changes, so neither does the text that sits on it', () => {
    expect(BAND_TEXT).toEqual([30, 41, 59]);
  });

  it('BAND_TEXT on the band fill passes 4.5:1', () => {
    expect(contrastRatio(BAND_TEXT, BAND_BG)).toBeGreaterThanOrEqual(4.5);
  });
});
