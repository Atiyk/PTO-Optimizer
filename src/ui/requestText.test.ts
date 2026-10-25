import { describe, it, expect } from 'vitest';
import { formatWorkingDaysList, formatManagerEmail } from './requestText';
import type { Break } from '../solver/types';

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

describe('formatManagerEmail', () => {
  it('is exactly three sentences', () => {
    const email = formatManagerEmail(makeBreak(), isPtoDay);
    const sentences = email.split(/(?<=[.?!])\s+/).filter(Boolean);
    expect(sentences).toHaveLength(3);
  });

  it('leads with the working days (with weekdays), the calendar span is secondary, and states the total days-off payoff', () => {
    const email = formatManagerEmail(makeBreak(), isPtoDay);
    // Working days come first, pasteable without the recipient doing arithmetic.
    expect(email.indexOf('Mon Oct 26')).toBeLessThan(email.indexOf('calendar span'));
    expect(email).toContain('5 working days of PTO: Mon Oct 26, Tue Oct 27, Wed Oct 28, Thu Oct 29, Fri Oct 30');
    expect(email).toContain('calendar span Oct 24 – Nov 1');
    expect(email).toContain('9 days off in total');
  });

  it('handles a break with no free days gained (every day in the span is a PTO cost day)', () => {
    const brk = makeBreak({ start: '2026-10-26', end: '2026-10-27', days: ['2026-10-26', '2026-10-27'], totalDaysOff: 2, ptoCost: 2 });
    const twoDays = new Set(['2026-10-26', '2026-10-27']);
    const email = formatManagerEmail(brk, (iso) => twoDays.has(iso));
    const sentences = email.split(/(?<=[.?!])\s+/).filter(Boolean);
    expect(sentences).toHaveLength(3);
    expect(email).toContain('2 working days from my PTO balance');
  });
});
