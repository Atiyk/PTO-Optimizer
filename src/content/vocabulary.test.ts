import { describe, it, expect } from 'vitest';
import { findBannedVocabulary, VOCABULARY } from './vocabulary';

describe('findBannedVocabulary', () => {
  it('flags a banned alternative inside a longer string', () => {
    expect(findBannedVocabulary('Your days carry forward into next year.')).toContain('carry forward');
  });

  it('is case-insensitive', () => {
    expect(findBannedVocabulary('Use-It-Or-Lose-It days')).toContain('use-it-or-lose-it');
  });

  it('finds nothing in copy that already uses the chosen words', () => {
    expect(findBannedVocabulary('Up to 5 days carry over, the rest are forfeited at reset.')).toEqual([]);
  });
});

// F29: the files that write the planner, landing-list and sabbatical result copy. Comments
// are stripped first, so only strings a person can read are checked.
const RESULT_COPY: Record<string, string> = import.meta.glob(
  [
    '../ui/{App,Headline,SummaryMetrics,ExportBar,SubscribeFeed,PortraitShare,Footer,Sabbatical,FAQ,WeightingSlider}.tsx',
    '../ui/{landingData,sabbaticalData,aboutFaqItems,sabbaticalFaqItems,weightingCaptions,portraitExport}.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

describe('days off (F29)', () => {
  it('flags the alternatives to "days off"', () => {
    expect(findBannedVocabulary('41 days away')).toContain('days away');
    expect(findBannedVocabulary('9 calendar days off')).toContain('calendar days off');
    expect(findBannedVocabulary('18 days off for 10 PTO days')).toEqual([]);
  });

  it('result copy on /, /pto and /sabbatical says "days off" and nothing else', () => {
    expect(Object.keys(RESULT_COPY).length).toBe(16);
    // Only this row: short banned words like "LOA" also match inside "load" in code.
    const banned = VOCABULARY.find((row) => row.use === 'days off')!.banned;
    const offenders = Object.entries(RESULT_COPY).flatMap(([file, text]) => {
      const lower = withoutComments(text).toLowerCase();
      return banned.filter((word) => lower.includes(word)).map((word) => `${file}: ${word}`);
    });
    expect(offenders).toEqual([]);
  });
});
