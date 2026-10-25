import { describe, it, expect } from 'vitest';
import { contrastRatio, relativeLuminance } from './scoreFormat';

// Raw RGB behind the tokens under test, kept in sync with colorScheme.ts / index.css by
// hand - Tailwind classes and CSS custom properties aren't introspectable at test time.
// ptoText is white in scheme B and red-950 in scheme A; TEXT_PRIMARY/TEXT_MUTED are
// scheme-independent slate. Scheme A (the unused comparison scheme, COLOR_SCHEME = 'B' is
// what ships) has no dark variant defined in index.css, so only B is checked in dark mode.
type RGB = [number, number, number];
const SCHEMES: Record<'A' | 'B', { ptoBg: RGB; ptoText: RGB; bandBg: RGB }> = {
  A: { ptoBg: [255, 107, 74], ptoText: [69, 10, 10], bandBg: [94, 234, 212] },
  B: { ptoBg: [30, 58, 138], ptoText: [255, 255, 255], bandBg: [254, 243, 199] }, // amber-100
};
const WHITE: [number, number, number] = [255, 255, 255];
const TEXT_PRIMARY_RGB: [number, number, number] = [30, 41, 59]; // slate-800
const TEXT_MUTED_RGB: [number, number, number] = [100, 116, 139]; // slate-500

describe('every numeral/background pair reaches 4.5:1 (light mode)', () => {
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

// Dark-mode values, from index.css's `@media (prefers-color-scheme: dark)` block. The
// calendar's PTO fill is NOT the same hue-shade as light mode darkened - blue-900 (light
// mode) is itself dark, so against a dark card it would barely stand out from a plain,
// unfilled cell. Dark mode uses blue-400 with dark text instead, verified both for text
// contrast AND for fill-vs-card-background distinguishability below.
const DARK_BG_PAGE: RGB = [15, 23, 42]; // slate-900
const DARK_BG_SURFACE: RGB = [30, 41, 59]; // slate-800 - the calendar month-box card colour
const DARK_PTO_BG: RGB = [96, 165, 250]; // blue-400
const DARK_PTO_TEXT: RGB = [15, 23, 42]; // slate-900
const DARK_BAND_BG: RGB = [254, 243, 199]; // amber-100, same quiet tint as light mode
const DARK_BAND_TEXT: RGB = [30, 41, 59]; // slate-800, unchanged
const DARK_HOLIDAY_DOT: RGB = [203, 213, 225]; // slate-300
const DARK_TEXT_PRIMARY: RGB = [241, 245, 249]; // slate-100
const DARK_TEXT_MUTED: RGB = [148, 163, 184]; // slate-400

describe('every numeral/background pair reaches 4.5:1 (dark mode, scheme B - the shipped scheme)', () => {
  it('ptoText on ptoBg', () => {
    expect(contrastRatio(DARK_PTO_TEXT, DARK_PTO_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('bandText on bandBg', () => {
    expect(contrastRatio(DARK_BAND_TEXT, DARK_BAND_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('TEXT_PRIMARY on the card surface (slate-800) and on the page background (slate-900)', () => {
    expect(contrastRatio(DARK_TEXT_PRIMARY, DARK_BG_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK_TEXT_PRIMARY, DARK_BG_PAGE)).toBeGreaterThanOrEqual(4.5);
  });

  it('TEXT_MUTED on the card surface and on the page background', () => {
    expect(contrastRatio(DARK_TEXT_MUTED, DARK_BG_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK_TEXT_MUTED, DARK_BG_PAGE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the calendar\'s two colours plus the holiday dot stay distinguishable in dark mode, including in greyscale', () => {
  it('ptoBg visibly pops against a plain (unfilled) cell in the dark card surface - not just a text-contrast check, a fill-distinguishability one', () => {
    expect(contrastRatio(DARK_PTO_BG, DARK_BG_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('bandBg visibly pops against a plain cell in the dark card surface', () => {
    expect(contrastRatio(DARK_BAND_BG, DARK_BG_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('the holiday dot is visible against both the card surface and the page background', () => {
    expect(contrastRatio(DARK_HOLIDAY_DOT, DARK_BG_SURFACE)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(DARK_HOLIDAY_DOT, DARK_BG_PAGE)).toBeGreaterThanOrEqual(3);
  });

  it('the three greyscale luminances (plain cell, ptoBg, bandBg) are widely separated - the colours are not just hue-different, they are distinguishable with colour removed entirely', () => {
    const plain = relativeLuminance(DARK_BG_SURFACE);
    const pto = relativeLuminance(DARK_PTO_BG);
    const band = relativeLuminance(DARK_BAND_BG);
    expect(plain).toBeLessThan(pto);
    expect(pto).toBeLessThan(band);
    // Each step is a large relative jump, not a marginal one a greyscale print would blur.
    expect(pto / Math.max(plain, 0.001)).toBeGreaterThan(5);
    expect(band / pto).toBeGreaterThan(1.5);
  });
});

describe('regression: a weekend/holiday numeral sitting on the band fill must use BAND_TEXT, not TEXT_PRIMARY, in dark mode', () => {
  it('reproduces the bug: TEXT_PRIMARY on the band fill fails 4.5:1 in dark mode (near-white text on the still-pale amber fill), which is exactly why BAND_TEXT exists', () => {
    expect(contrastRatio(DARK_TEXT_PRIMARY, DARK_BAND_BG)).toBeLessThan(4.5);
  });

  it('BAND_TEXT on the band fill passes 4.5:1 in dark mode - bandBg never changes between themes, so neither does the text that sits on it', () => {
    expect(contrastRatio(DARK_BAND_TEXT, DARK_BAND_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('BAND_TEXT is identical in light and dark mode - unlike TEXT_PRIMARY, it has nothing to flip, since bandBg itself never changes', () => {
    const LIGHT_BAND_TEXT: RGB = [30, 41, 59]; // slate-800
    expect(DARK_BAND_TEXT).toEqual(LIGHT_BAND_TEXT);
  });
});
