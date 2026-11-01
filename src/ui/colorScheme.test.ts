import { describe, it, expect } from 'vitest';
import { contrastRatio, relativeLuminance } from './scoreFormat';

import css from '../index.css?raw';
import { parseHexTokens, type RGB } from './cssTokens';

// The real values behind the tokens under test, parsed from index.css (redesign Phase 1;
// these used to be hand-copied triples that could drift from the stylesheet).
const TOKENS = parseHexTokens(css);
const PTO_BG: RGB = TOKENS['pto-bg']; // the one accent
const PTO_TEXT: RGB = TOKENS['pto-text'];
const BAND_BG: RGB = TOKENS['band-bg'];
const BAND_TEXT: RGB = TOKENS['band-text'];
const HOLIDAY_DOT: RGB = TOKENS['holiday-dot'];
const WHITE: RGB = TOKENS['bg-surface']; // calendar cells sit on the white card surface
const PAGE: RGB = TOKENS['bg-page'];
const TEXT_PRIMARY_RGB: RGB = TOKENS['text-primary'];
const TEXT_MUTED_RGB: RGB = TOKENS['text-muted'];

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
    expect(contrastRatio(TEXT_MUTED_RGB, PAGE)).toBeGreaterThanOrEqual(4.5);
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
  it('BAND_TEXT is its own token, pinned regardless of TEXT_PRIMARY - bandBg never changes, so neither does the text that sits on it', () => {
    expect(BAND_TEXT).toEqual([41, 37, 36]); // #292524
  });

  it('BAND_TEXT on the band fill passes 4.5:1', () => {
    expect(contrastRatio(BAND_TEXT, BAND_BG)).toBeGreaterThanOrEqual(4.5);
  });
});
