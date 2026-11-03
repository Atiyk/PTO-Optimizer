import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import { PlanExplanation, summarizePlanDays } from './PlanExplanation';

const MON_FRI: WorkWeek = [true, true, true, true, true, false, false];
const BREAK: Break = {
  id: '2026-11-26|2026-11-29',
  start: '2026-11-26',
  end: '2026-11-29',
  days: ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'],
  totalDaysOff: 4,
  ptoCost: 1,
  multiplier: 4,
  tags: [],
  meanDemand: 1,
};

describe('summarizePlanDays', () => {
  it('explains a four-day holiday bridge with exact PTO, weekend, and holiday counts', () => {
    expect(summarizePlanDays([BREAK], MON_FRI, new Set(['2026-11-26']))).toEqual({
      calendarDays: 4,
      ptoDays: 1,
      regularDaysOff: 2,
      calendarDaysOff: 1,
      breakCount: 1,
    });
  });

  it('does not double-count holidays that fall on a regular nonworking day', () => {
    expect(summarizePlanDays([BREAK], MON_FRI, new Set(['2026-11-26', '2026-11-28']))).toMatchObject({
      calendarDays: 4, ptoDays: 1, regularDaysOff: 2, calendarDaysOff: 1,
    });
  });

  it('respects nonstandard workweeks and custom off days', () => {
    // Sunday is a normal workday; Thursday and Friday are regular days off.
    const custom: WorkWeek = [true, true, true, false, false, false, true];
    expect(summarizePlanDays([BREAK], custom, new Set(['2026-11-26', '2026-11-29']))).toMatchObject({
      calendarDays: 4, ptoDays: 0, regularDaysOff: 3, calendarDaysOff: 1,
    });
  });

  it('deduplicates overlapping break dates rather than inflating the total', () => {
    const overlap: Break = { ...BREAK, id: 'overlap', days: ['2026-11-28', '2026-11-29'] };
    expect(summarizePlanDays([BREAK, overlap], MON_FRI, new Set(['2026-11-26']))).toMatchObject({
      calendarDays: 4, ptoDays: 1, regularDaysOff: 2, calendarDaysOff: 1, breakCount: 2,
    });
  });


  it('reconciles two disjoint recommended breaks against aggregate solver metrics', () => {
    const second: Break = {
      ...BREAK,
      id: '2026-12-24|2026-12-27',
      start: '2026-12-24',
      end: '2026-12-27',
      days: ['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27'],
      totalDaysOff: 4,
      ptoCost: 1,
    };
    const breaks = [BREAK, second];
    const holidays = new Set(['2026-11-26', '2026-12-25']);
    const result = summarizePlanDays(breaks, MON_FRI, holidays);
    expect(result).toEqual({
      calendarDays: 8,
      ptoDays: 2,
      regularDaysOff: 4,
      calendarDaysOff: 2,
      breakCount: 2,
    });
    expect(result!.calendarDays).toBe(breaks.reduce((sum, item) => sum + item.totalDaysOff, 0));
    expect(result!.ptoDays).toBe(breaks.reduce((sum, item) => sum + item.ptoCost, 0));
    const html = renderToStaticMarkup(
      <PlanExplanation breaks={breaks} workWeek={MON_FRI} offDays={holidays} budgetSpent={2} totalDaysOff={8} />,
    );
    expect(html).toContain('2 recommended breaks combine');
    expect(html).toContain('2 days of PTO');
    expect(html).toContain('8 days off');
    expect(html).not.toContain('plan is updating');
  });

  it('guards against inconsistent aggregate metrics even when individual break dates are valid', () => {
    const html = renderToStaticMarkup(
      <PlanExplanation breaks={[BREAK]} workWeek={MON_FRI} offDays={new Set(['2026-11-26'])} budgetSpent={1} totalDaysOff={5} />,
    );
    expect(html).toContain('plan is updating');
    expect(html).not.toContain('That makes');
  });

  it('does not display a breakdown when no recommendation exists', () => {
    expect(summarizePlanDays([], MON_FRI, new Set())).toBeNull();
    expect(renderToStaticMarkup(
      <PlanExplanation breaks={[]} workWeek={MON_FRI} offDays={new Set()} budgetSpent={0} totalDaysOff={0} />,
    )).toBe('');
  });
});

describe('PlanExplanation', () => {
  it('renders an accessible native disclosure with deterministic arithmetic and honest assumptions', () => {
    const html = renderToStaticMarkup(
      <PlanExplanation breaks={[BREAK]} workWeek={MON_FRI} offDays={new Set(['2026-11-26'])} budgetSpent={1} totalDaysOff={4} />,
    );
    expect(html).toContain('<details');
    expect(html).toContain('Why this plan?');
    expect(html).toContain('1 day of PTO');
    expect(html).toContain('2 days already off');
    expect(html).toContain('1 day from your selected holiday');
    expect(html).toContain('4 days off');
    expect(html).toContain('not an approved leave request');
  });

  it('does not claim a numerical explanation while solver and holiday data disagree', () => {
    const html = renderToStaticMarkup(
      <PlanExplanation breaks={[BREAK]} workWeek={MON_FRI} offDays={new Set()} budgetSpent={1} totalDaysOff={4} />,
    );
    expect(html).toContain('plan is updating');
    expect(html).not.toContain('That makes');
  });
});
