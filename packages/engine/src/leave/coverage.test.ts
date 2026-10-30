import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import { coverageViolations, newViolationsFor, type CoverageMember, type CoverageRuleInput } from './coverage';

const m = (id: string, tags: string[] = ['engineer'], out: string[] = []): CoverageMember => ({
  id,
  teamId: 't1',
  tags,
  workWeek: DEFAULT_WORK_WEEK,
  out: new Set(out),
});
const rule: CoverageRuleInput = { id: 'r1', teamId: 't1', minPresent: 2, tag: 'engineer', weekdays: '1111100' };

describe('coverage', () => {
  it('counts only tagged, scheduled, present members', () => {
    // Mon Nov 16 2026: a and b out → only c present (d is not an engineer) → 1 < 2.
    const team = [m('a', undefined, ['2026-11-16']), m('b', undefined, ['2026-11-16']), m('c'), m('d', ['designer'])];
    expect(coverageViolations([rule], team, '2026-11-16', '2026-11-17')).toEqual([
      { ruleId: 'r1', date: '2026-11-16', teamId: 't1', tag: 'engineer', required: 2, present: 1 },
    ]);
  });
  it('weekends and whole-team holidays are not violations', () => {
    const hol = new Set(['2026-11-26']);
    const team = [m('a'), m('b')].map((x) => ({ ...x, holidays: hol }));
    expect(coverageViolations([rule], team, '2026-11-26', '2026-11-29')).toEqual([]);
  });
  it('a new absence is blamed only for the days it breaks', () => {
    // 3 engineers, min 2. c already out Tue. a asks Mon–Tue: Mon leaves b+c = 2 (ok);
    // Tue leaves only b = 1 → new violation on Tue only.
    const team = [m('a'), m('b'), m('c', undefined, ['2026-11-17'])];
    const v = newViolationsFor([rule], team, 'a', ['2026-11-16', '2026-11-17']);
    expect(v.map((x) => [x.date, x.present])).toEqual([['2026-11-17', 1]]);
  });
  it('a day already short is not blamed on the new request', () => {
    const team = [m('a'), m('b', undefined, ['2026-11-16']), m('c', undefined, ['2026-11-16'])];
    expect(newViolationsFor([rule], team, 'a', ['2026-11-16'])).toEqual([]);
  });
});
