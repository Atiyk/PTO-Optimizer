import { describe, it, expect } from 'vitest';
import { findBannedVocabulary } from './vocabulary';

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
