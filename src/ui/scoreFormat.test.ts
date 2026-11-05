import { describe, it, expect } from 'vitest';
import {
  ordinal,
  formatScoreLine,
  efficiencyLine,
  travelLine,
  intensityBand,
  barFillClass,
  barFillWidthPercent,
  contrastRatio,
  relativeLuminance,
  SCORE_INTENSITY,
} from './scoreFormat';
import type { Scores } from '@daysoff/engine/solver/types';

describe('ordinal', () => {
  it('formats the spec examples correctly', () => {
    expect(ordinal(78)).toBe('78th');
    expect(ordinal(91)).toBe('91st');
  });

  it('handles the 1st/2nd/3rd and the 11th/12th/13th exception', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(100)).toBe('100th');
    expect(ordinal(0)).toBe('0th');
  });
});

describe('score lines', () => {
  it('render the spec examples verbatim', () => {
    const scores: Scores = { efficiency: { percentile: 91 }, travel: { percentile: 78 } };
    expect(travelLine(scores)).toBe('Travel 78th · quieter than most weeks in your dates');
    expect(efficiencyLine(scores)).toBe('Efficiency 91st · more days off per PTO day than most travel settings we tried');
  });

  it('both go through the same formatScoreLine template', () => {
    const scores: Scores = { efficiency: { percentile: 91 }, travel: { percentile: 78 } };
    expect(formatScoreLine({ label: 'Travel', percentile: 78, gloss: 'quieter than most weeks in your dates' })).toBe(travelLine(scores));
  });

  it('never embeds a raw indexed number - only the ordinal percentile', () => {
    // The old "100 = average" indexed value is gone entirely; nothing but the percentile
    // (as its ordinal) should appear as a number before the gloss.
    const scores: Scores = { efficiency: { percentile: 5 }, travel: { percentile: 50 } };
    expect(travelLine(scores)).not.toMatch(/\d{2,3}(?!th|st|nd|rd)/);
  });

  it('the gloss is derived from the percentile band, not hardcoded - regression for "14th · better than most"', () => {
    // The actual bug: a 14th-percentile efficiency score (well below average) rendered
    // with a static "better than most plans" gloss, because the gloss text never read the
    // percentile at all. Each metric's gloss must change across all three bands.
    const low: Scores = { efficiency: { percentile: 14 }, travel: { percentile: 14 } };
    const mid: Scores = { efficiency: { percentile: 50 }, travel: { percentile: 50 } };
    const high: Scores = { efficiency: { percentile: 91 }, travel: { percentile: 91 } };

    expect(efficiencyLine(low)).toBe('Efficiency 14th · fewer days off per PTO day than most travel settings we tried');
    expect(efficiencyLine(mid)).toBe('Efficiency 50th · mid-range among the travel settings we tried');
    expect(efficiencyLine(high)).toBe('Efficiency 91st · more days off per PTO day than most travel settings we tried');

    expect(travelLine(low)).toBe('Travel 14th · busier than most weeks in your dates');
    expect(travelLine(mid)).toBe('Travel 50th · about average for your dates');
    expect(travelLine(high)).toBe('Travel 91st · quieter than most weeks in your dates');

    // All three glosses, per metric, must be textually distinct from one another.
    const effGlosses = new Set([efficiencyLine(low), efficiencyLine(mid), efficiencyLine(high)].map((l) => l.split(' · ')[1]));
    const travelGlosses = new Set([travelLine(low), travelLine(mid), travelLine(high)].map((l) => l.split(' · ')[1]));
    expect(effGlosses.size).toBe(3);
    expect(travelGlosses.size).toBe(3);
  });

  it('gloss band boundaries match SCORE_INTENSITY exactly - the words and the bar colour never disagree', () => {
    for (const p of [0, 32, 33, 65, 66, 100]) {
      const scores: Scores = { efficiency: { percentile: p }, travel: { percentile: p } };
      const band = intensityBand(p);
      const effGloss = efficiencyLine(scores).split(' · ')[1];
      const expectedEffGloss =
        band === 0 ? 'fewer days off per PTO day than most travel settings we tried' : band === 1 ? 'mid-range among the travel settings we tried' : 'more days off per PTO day than most travel settings we tried';
      expect(effGloss).toBe(expectedEffGloss);
    }
  });
});

describe('intensityBand / barFillClass', () => {
  it('matches the 33/66 thresholds from SCORE_INTENSITY, not an arbitrary 40/60 split', () => {
    expect(SCORE_INTENSITY.thresholds).toEqual([33, 66]);
    expect(intensityBand(0)).toBe(0);
    expect(intensityBand(32)).toBe(0);
    expect(intensityBand(33)).toBe(1);
    expect(intensityBand(65)).toBe(1);
    expect(intensityBand(66)).toBe(2);
    expect(intensityBand(100)).toBe(2);
  });

  it('bar class always matches the band for the same percentile', () => {
    for (let p = 0; p <= 100; p++) {
      expect(barFillClass(p)).toBe(SCORE_INTENSITY.barClasses[intensityBand(p)]);
    }
  });
});

describe('barFillWidthPercent', () => {
  it('matches the percentile value exactly at 0, 50, and 100', () => {
    expect(barFillWidthPercent(0)).toBe(0);
    expect(barFillWidthPercent(50)).toBe(50);
    expect(barFillWidthPercent(100)).toBe(100);
  });

  it('is identical regardless of which intensity band the percentile falls in - colour never changes the length signal', () => {
    // 32 and 34 straddle the first threshold (different bands), 65 and 67 straddle the
    // second - the width must still equal the raw percentile in every case.
    for (const p of [32, 34, 65, 67]) {
      expect(barFillWidthPercent(p)).toBe(p);
    }
  });
});

describe('score intensity contrast', () => {
  // The strip's possible backgrounds after the Phase 1 tokens: the warm page, the white
  // surface, and the remapped slate-50 some cards still use.
  const PAGE: [number, number, number] = [251, 248, 243];
  const SLATE_50: [number, number, number] = [250, 247, 242];
  const WHITE: [number, number, number] = [255, 255, 255];

  it.each(SCORE_INTENSITY.rgb)('intensity [%i, %i, %i] reaches 4.5:1 against the summary strip background', (r, g, b) => {
    expect(contrastRatio([r, g, b], PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio([r, g, b], SLATE_50)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio([r, g, b], WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('the three bands are distinguishable from each other', () => {
    const lum = SCORE_INTENSITY.rgb.map(relativeLuminance);
    expect(lum[0]).toBeGreaterThan(lum[1]);
    expect(lum[1]).toBeGreaterThan(lum[2]);
  });
});

describe('greyscale and colour-independence', () => {
  it('both scores stay interpretable with colour entirely removed: bar length and gloss text carry the full meaning', () => {
    const scores: Scores = { efficiency: { percentile: 91 }, travel: { percentile: 78 } };
    // The gloss text states the meaning in words, independent of any colour class.
    expect(travelLine(scores)).toContain('quieter than most weeks');
    expect(efficiencyLine(scores)).toContain('than most travel settings we tried');
    // The bar's width (the position/length signal) is a pure function of the percentile
    // alone - it never reads SCORE_INTENSITY's colour classes, so colour can be deleted
    // from the page entirely and the bar still reports the right value by length.
    expect(barFillWidthPercent(scores.travel.percentile)).toBe(78);
    expect(barFillWidthPercent(scores.efficiency.percentile)).toBe(91);
  });
});
