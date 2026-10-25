import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { findNextBreak, daysUntil, NextBreakBanner, type OrderedBreak } from './NextBreakBanner';
import type { Break } from '../solver/types';

function makeBreak(start: string, end: string): Break {
  return {
    id: `${start}|${end}`,
    start,
    end,
    days: [start, end],
    totalDaysOff: 2,
    ptoCost: 1,
    multiplier: 2,
    tags: [],
    meanDemand: 1,
  };
}

function ordered(breaks: Break[]): OrderedBreak[] {
  return breaks.map((brk, i) => ({ index: i + 1, brk }));
}

describe('findNextBreak', () => {
  it('finds the earliest break that is not fully in the past', () => {
    const breaks = ordered([makeBreak('2026-01-05', '2026-01-06'), makeBreak('2026-03-10', '2026-03-12')]);
    expect(findNextBreak(breaks, '2026-02-01')?.brk.start).toBe('2026-03-10');
  });

  it('a break already in progress (today falls inside it) still counts as next', () => {
    const breaks = ordered([makeBreak('2026-03-10', '2026-03-15')]);
    expect(findNextBreak(breaks, '2026-03-12')?.brk.start).toBe('2026-03-10');
  });

  it('skips a break that has fully passed, including today == end', () => {
    const breaks = ordered([makeBreak('2026-03-10', '2026-03-12'), makeBreak('2026-05-01', '2026-05-03')]);
    expect(findNextBreak(breaks, '2026-03-12')?.brk.start).toBe('2026-03-10'); // today == end: not yet passed
    expect(findNextBreak(breaks, '2026-03-13')?.brk.start).toBe('2026-05-01'); // now it's passed
  });

  it('returns undefined when every break has already passed', () => {
    const breaks = ordered([makeBreak('2026-01-05', '2026-01-06')]);
    expect(findNextBreak(breaks, '2026-02-01')).toBeUndefined();
  });

  it('returns undefined for an empty plan', () => {
    expect(findNextBreak([], '2026-02-01')).toBeUndefined();
  });
});

describe('daysUntil', () => {
  it('counts whole days forward', () => {
    expect(daysUntil('2026-10-25', '2026-12-19')).toBe(55);
  });

  it('is zero when the dates are the same', () => {
    expect(daysUntil('2026-10-25', '2026-10-25')).toBe(0);
  });
});

describe('NextBreakBanner render', () => {
  it('shows the next break\'s range and days away', () => {
    const breaks = ordered([makeBreak('2026-12-19', '2026-12-27')]);
    const html = renderToStaticMarkup(
      <NextBreakBanner orderedBreaks={breaks} today="2026-10-25" onPlanNextYear={() => {}} />,
    );
    expect(html).toContain('Your next break:');
    expect(html).toContain('Dec 19 – 27');
    expect(html).toContain('55 days away');
  });

  it('shows "happening now" for a break in progress, not a days-away count', () => {
    const breaks = ordered([makeBreak('2026-10-20', '2026-10-28')]);
    const html = renderToStaticMarkup(
      <NextBreakBanner orderedBreaks={breaks} today="2026-10-25" onPlanNextYear={() => {}} />,
    );
    expect(html).toContain('happening now');
    expect(html).not.toContain('days away');
  });

  it('offers to plan next year when no breaks remain', () => {
    const breaks = ordered([makeBreak('2026-01-05', '2026-01-06')]);
    const html = renderToStaticMarkup(
      <NextBreakBanner orderedBreaks={breaks} today="2026-10-25" onPlanNextYear={() => {}} />,
    );
    expect(html).toContain('No more breaks planned');
    expect(html).toContain('Plan next year');
  });

  it('offers to plan next year for an entirely empty plan too', () => {
    const html = renderToStaticMarkup(<NextBreakBanner orderedBreaks={[]} today="2026-10-25" onPlanNextYear={() => {}} />);
    expect(html).toContain('Plan next year');
  });
});
