import { describe, expect, it } from 'vitest';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { solveConsumer } from '../planning/optimizer';
import { pinPreviewText, previewPinnedDay, solveWithPinFallback } from './pinPreview';

// Two months of US holidays around the default /pto window (Nov 2026 to Jan 2027).
const input: SolveInput = {
  offDays: ['2026-11-11', '2026-11-26', '2026-12-25', '2027-01-01'],
  rangeStart: '2026-11-04', rangeEnd: '2027-01-04', budget: 12, country: 'US',
};
const options = { minimumBreakDays: 3, style: 'balanced' as const };

describe('pin fallback', () => {
  it('leaves an unpinned plan exactly as the consumer solve returns it', () => {
    expect(solveWithPinFallback(input, options)).toEqual(solveConsumer(input, options));
  });

  it('never collapses a pinned plan to nothing when a plan without the minimum exists', () => {
    const pinned = { ...input, mustIncludeDays: ['2026-12-07'] };
    const strict = solveConsumer(pinned, options);
    const outcome = solveWithPinFallback(pinned, options);
    expect(outcome.result.primary.length).toBeGreaterThan(0);
    // The bug this guards: the strict solve fails for a lone Monday pin (Dec 7)...
    expect(strict.issue).toContain('3-day minimum');
    // ...and the relaxation is never silent: the UI is told which minimum was set aside.
    expect(outcome.relaxedMinimum).toBe(3);
  });

  it('previews exactly what pinning would produce', () => {
    const preview = previewPinnedDay(input, options, '2026-12-07');
    const actual = solveWithPinFallback({ ...input, mustIncludeDays: ['2026-12-07'] }, options);
    expect(preview.totalDaysOff).toBe(actual.result.primary.reduce((sum, brk) => sum + brk.totalDaysOff, 0));
    expect(preview.budgetSpent).toBe(actual.result.budgetSpent);
  });

  it('words a loss honestly', () => {
    expect(pinPreviewText({ totalDaysOff: 25, budgetSpent: 12, relaxedMinimum: 3 }, { totalDaysOff: 27, budgetSpent: 12 }))
      .toBe('Pin it: 25 days off for 12 PTO days (2 fewer), only without your 3-day minimum break.');
  });
});
