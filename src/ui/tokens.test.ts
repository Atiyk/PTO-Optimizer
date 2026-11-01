import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';
import { parseHexTokens, type RGB } from './cssTokens';
import { contrastRatio, relativeLuminance, SCORE_INTENSITY } from './scoreFormat';

// Redesign Phase 1: WCAG 2.2 AA for every token pair the visual system uses, read from the
// real stylesheet (src/index.css), not a hand-kept copy.
const T = parseHexTokens(css);
const t = (name: string): RGB => {
  const v = T[name];
  if (!v) throw new Error(`token --${name} not found in index.css`);
  return v;
};

const BACKGROUNDS = ['bg-page', 'bg-surface', 'bg-surface-alt'] as const;

describe('design tokens (src/index.css)', () => {
  it('parses the tokens the system relies on', () => {
    for (const name of ['bg-page', 'bg-surface', 'bg-surface-alt', 'border-default', 'border-strong', 'text-primary', 'text-muted', 'accent', 'accent-hover', 'accent-soft', 'accent-ink', 'pto-bg', 'pto-text', 'band-bg', 'band-text', 'holiday-dot', 'weekend-bg', 'focus-ring']) {
      expect(T[name], name).toBeDefined();
    }
  });

  it.each(BACKGROUNDS)('ink and muted text reach 4.5:1 on %s', (bg) => {
    expect(contrastRatio(t('text-primary'), t(bg))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('text-muted'), t(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(BACKGROUNDS)('accent-coloured text reaches 4.5:1 on %s', (bg) => {
    expect(contrastRatio(t('accent-ink'), t(bg))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('accent'), t(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the accent (primary button, suggested PTO day) reaches 4.5:1, including on hover', () => {
    expect(contrastRatio(t('pto-text'), t('pto-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('pto-text'), t('accent'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('pto-text'), t('accent-hover'))).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the day-off band and on weekend cells reaches 4.5:1', () => {
    expect(contrastRatio(t('band-text'), t('band-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('text-primary'), t('band-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('text-muted'), t('band-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('text-muted'), t('weekend-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t('accent-ink'), t('accent-soft'))).toBeGreaterThanOrEqual(4.5);
  });

  it('UI boundaries reach 3:1: focus ring, control borders, the holiday dot, a suggested-PTO cell', () => {
    for (const bg of [...BACKGROUNDS, 'band-bg', 'weekend-bg']) {
      expect(contrastRatio(t('focus-ring'), t(bg)), `focus ring on ${bg}`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t('holiday-dot'), t(bg)), `holiday dot on ${bg}`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t('pto-bg'), t(bg)), `PTO cell on ${bg}`).toBeGreaterThanOrEqual(3);
    }
    for (const bg of BACKGROUNDS) {
      expect(contrastRatio(t('border-strong'), t(bg)), `control border on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('every remapped slate shade used for text (400 and darker) reaches 4.5:1 on every background', () => {
    for (const shade of [400, 500, 600, 700, 800, 900]) {
      for (const bg of [...BACKGROUNDS, 'band-bg', 'weekend-bg']) {
        expect(contrastRatio(t(`color-slate-${shade}`), t(bg)), `slate-${shade} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('one accent hue: the score ramp is the accent and its darker shades, matching scoreFormat.ts', () => {
    expect(SCORE_INTENSITY.rgb).toEqual([t('score-1'), t('score-2'), t('score-3')]);
    expect(t('score-1')).toEqual(t('accent'));
  });

  it('greyscale: suggested PTO, the band and a plain cell stay clearly separated', () => {
    const plain = relativeLuminance(t('bg-surface'));
    const band = relativeLuminance(t('band-bg'));
    const pto = relativeLuminance(t('pto-bg'));
    expect(pto).toBeLessThan(band);
    expect(band).toBeLessThan(plain);
    expect((plain - band) / (plain - pto)).toBeLessThan(0.3);
  });
});
