import { describe, it, expect } from 'vitest';
import { formatWorkingDaysList, formatManagerEmailShort, formatManagerEmailDetailed } from './requestText';
import { requestByDate } from '@daysoff/engine/calendar/requestDeadline';
import { formatShort } from '@daysoff/engine/calendar/dateFormat';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { Break } from '@daysoff/engine/solver/types';

function makeBreak(overrides: Partial<Break> = {}): Break {
  return {
    id: '2026-10-24|2026-11-01',
    start: '2026-10-24',
    end: '2026-11-01',
    days: ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
    totalDaysOff: 9,
    ptoCost: 5,
    multiplier: 1.8,
    tags: [],
    meanDemand: 1.0,
    ...overrides,
  };
}

const ptoDays = new Set(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
const isPtoDay = (iso: string) => ptoDays.has(iso);

describe('formatWorkingDaysList (Phase 3: leads with working days, not the calendar span)', () => {
  it('leads with the count, then enumerates every PTO-cost day individually with its weekday - never grouped into a range', () => {
    const text = formatWorkingDaysList(makeBreak(), isPtoDay);
    expect(text).toBe('5 working days: Mon Oct 26, Tue Oct 27, Wed Oct 28, Thu Oct 29, Fri Oct 30');
  });

  it('lists non-consecutive PTO days individually, each with its own weekday', () => {
    const scattered = new Set(['2026-10-24', '2026-10-26']);
    const text = formatWorkingDaysList(makeBreak(), (iso) => scattered.has(iso));
    expect(text).toBe('2 working days: Sat Oct 24, Mon Oct 26');
  });

  it('singular "working day" for exactly one day', () => {
    const one = new Set(['2026-10-26']);
    const text = formatWorkingDaysList(makeBreak(), (iso) => one.has(iso));
    expect(text).toBe('1 working day: Mon Oct 26');
  });
});

describe('formatManagerEmailShort (Phase 4.3: leads with coverage, not the raw PTO-day list)', () => {
  it('is exactly three sentences', () => {
    const email = formatManagerEmailShort(makeBreak(), isPtoDay);
    const sentences = email.split(/(?<=[.?!])\s+/).filter(Boolean);
    expect(sentences).toHaveLength(3);
  });

  it('leads with the coverage span and total days-off payoff, then the specific PTO days', () => {
    const email = formatManagerEmailShort(makeBreak(), isPtoDay);
    // Coverage comes first, the granular day list is secondary.
    expect(email.indexOf('Oct 24')).toBeLessThan(email.indexOf('Mon Oct 26'));
    expect(email).toContain("I'd like to request time off covering Oct 24 – Nov 1 — 9 days away from work in total, using 5 PTO days.");
    expect(email).toContain('The PTO days needed are Mon Oct 26, Tue Oct 27, Wed Oct 28, Thu Oct 29, Fri Oct 30');
  });

  it('handles a break with no free days gained (every day in the span is a PTO cost day)', () => {
    const brk = makeBreak({ start: '2026-10-26', end: '2026-10-27', days: ['2026-10-26', '2026-10-27'], totalDaysOff: 2, ptoCost: 2 });
    const twoDays = new Set(['2026-10-26', '2026-10-27']);
    const email = formatManagerEmailShort(brk, (iso) => twoDays.has(iso));
    const sentences = email.split(/(?<=[.?!])\s+/).filter(Boolean);
    expect(sentences).toHaveLength(3);
    expect(email).toContain('All of this comes from my PTO balance: Mon Oct 26, Tue Oct 27');
  });

  it('mentions the quiet window in place of the generic closing line when the break is genuinely low-demand', () => {
    const quiet = makeBreak({ meanDemand: 0.7 });
    const email = formatManagerEmailShort(quiet, isPtoDay);
    expect(email).toContain('quieter period for time-off requests');
    expect(email).not.toContain('Let me know if this works');
    const sentences = email.split(/(?<=[.?!])\s+/).filter(Boolean);
    expect(sentences).toHaveLength(3);
  });

  it('uses the ordinary closing line (not the quiet-window line) for an average-demand break', () => {
    const email = formatManagerEmailShort(makeBreak({ meanDemand: 1.0 }), isPtoDay);
    expect(email).toContain('Let me know if this works');
    expect(email).not.toContain('quieter period');
  });
});

describe('formatManagerEmailDetailed', () => {
  it('states the same request-by deadline the break card itself shows, driven by the same noticePeriodDays', () => {
    const brk = makeBreak();
    const email = formatManagerEmailDetailed(brk, isPtoDay, 14, DEFAULT_WORK_WEEK);
    const expectedDeadline = requestByDate(brk.start, 14, DEFAULT_WORK_WEEK);
    expect(email).toContain(formatShort(expectedDeadline));
    expect(email).toContain('14-day notice period');
  });

  it('includes the coverage opening and the full PTO-day specifics, same as the short variant', () => {
    const email = formatManagerEmailDetailed(makeBreak(), isPtoDay, 14, DEFAULT_WORK_WEEK);
    expect(email).toContain("I'd like to request time off covering Oct 24 – Nov 1");
    expect(email).toContain('The PTO days needed are Mon Oct 26, Tue Oct 27, Wed Oct 28, Thu Oct 29, Fri Oct 30');
    expect(email).toContain('Let me know if this works');
  });

  it('adds the quiet-window mention on top of the standard content when the break is low-demand', () => {
    const quiet = makeBreak({ meanDemand: 0.7 });
    const email = formatManagerEmailDetailed(quiet, isPtoDay, 14, DEFAULT_WORK_WEEK);
    expect(email).toContain('quieter period for time-off requests');
    expect(email).toContain('Let me know if this works');
  });

  it('uses a different notice period in the deadline sentence when noticePeriodDays differs', () => {
    const brk = makeBreak();
    const email = formatManagerEmailDetailed(brk, isPtoDay, 30, DEFAULT_WORK_WEEK);
    expect(email).toContain('30-day notice period');
    const expectedDeadline = requestByDate(brk.start, 30, DEFAULT_WORK_WEEK);
    expect(email).toContain(formatShort(expectedDeadline));
  });
});
