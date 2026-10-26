import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BreakCard } from './BreakCard';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import type { Break } from '../solver/types';

function makeBreak(overrides: Partial<Break> = {}): Break {
  return {
    id: '2026-01-05|2026-01-05',
    start: '2026-01-05',
    end: '2026-01-05',
    days: ['2026-01-05'],
    totalDaysOff: 1,
    ptoCost: 1,
    multiplier: 1,
    tags: [],
    meanDemand: 1,
    ...overrides,
  };
}

function render(brk: Break) {
  return renderToStaticMarkup(
    <BreakCard
      brk={brk}
      index={1}
      isPtoDay={() => true}
      onHover={() => {}}
      isMostContested={false}
      today="2025-12-01"
      noticePeriodDays={14}
      workWeek={DEFAULT_WORK_WEEK}
    />,
  );
}

describe('BreakCard low-value explanation (regression: unconditional "chosen for low travel demand")', () => {
  it('BUG FOUND: used to say "chosen for low travel demand" for ANY 1.0x break - even one with no such tag at all (e.g. w=0, or ordinary demand)', () => {
    const html = render(makeBreak({ multiplier: 1, tags: [] }));
    expect(html).not.toContain('chosen for low travel demand');
    expect(html).toContain('uses the full available budget');
  });

  it('only claims the demand reason when the break actually carries the "Low travel demand" tag', () => {
    const html = render(makeBreak({ multiplier: 1, tags: ['Low travel demand'] }));
    expect(html).toContain('chosen for low travel demand');
  });

  it('shows no low-value explanation at all above 1.0x', () => {
    const html = render(makeBreak({ multiplier: 2.5, tags: [] }));
    expect(html).not.toContain('No extra days off');
  });
});
