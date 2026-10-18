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

describe('formatWorkingDaysList', () => {
  it('lists the actual PTO-cost days, not the break\'s full span, grouped into a consecutive range', () => {
    const text = formatWorkingDaysList(makeBreak(), isPtoDay);
    expect(text).toBe('Oct 26–Oct 30, 2026 — 5 working days');
  });

  it('groups non-consecutive PTO days into separate ranges', () => {
    const scattered = new Set(['2026-10-24', '2026-10-26']);
    const text = formatWorkingDaysList(makeBreak(), (iso) => scattered.has(iso));
    expect(text).toBe('Oct 24, Oct 26, 2026 — 2 working days');
  });

  it('singular "working day" for exactly one day', () => {
    const one = new Set(['2026-10-26']);
    const text = formatWorkingDaysList(makeBreak(), (iso) => one.has(iso));
    expect(text).toBe('Oct 26, 2026 — 1 working day');
  });
});

describe('formatManagerEmail', () => {
  it('is exactly three sentences', () => {
    const email = formatManagerEmail(makeBreak(), isPtoDay);
    const sentences = email.split(/(?<=[.?!])\s+/).filter(Boolean);
    expect(sentences).toHaveLength(3);
  });

  it('states the specific working days and the total days-off payoff', () => {
    const email = formatManagerEmail(makeBreak(), isPtoDay);
    expect(email).toContain('5 working days');
    expect(email).toContain('Oct 26–Oct 30');
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
