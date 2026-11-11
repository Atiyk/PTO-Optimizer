import { describe, expect, it } from 'vitest';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { MAX_SCHOOL_CALENDAR_DAYS } from './schoolCalendar';
import { MAX_FAMILY_PTO, planFamilyTime, type FamilyPlanInput } from './familyPlan';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest } from './requestLedger';
import { planningCommitments } from './workspace';

const weekdays = (start: string, end: string) => rangeISO(start, end).filter(day => mondayIndexedDow(day) < 5);
const weekends = (start: string, end: string) => rangeISO(start, end).filter(day => mondayIndexedDow(day) >= 5);

const WINDOW = { start: '2026-08-17', end: '2027-06-18' };
/** Parent works Mon-Fri; Christmas and New Year's Day are employer holidays. */
const PARENT_FREE = [...weekends(WINDOW.start, WINDOW.end), '2026-12-25', '2027-01-01'];
const WINTER = weekdays('2026-12-21', '2027-01-01');

function plan(overrides: Partial<FamilyPlanInput>) {
  return planFamilyTime({ ...WINDOW, schoolOffDays: [], parentFreeDays: PARENT_FREE, ptoBudget: 10, ...overrides });
}

describe('planFamilyTime break detection', () => {
  it('joins school-off weekdays through weekends into one maximal break', () => {
    const result = plan({ schoolOffDays: WINTER })!;
    expect(result.breaks).toHaveLength(1);
    expect(result.breaks[0]).toMatchObject({
      id: '2026-12-19', start: '2026-12-19', end: '2027-01-03', schoolOffWeekdays: WINTER,
      parentWorkdays: WINTER.filter(day => day !== '2026-12-25' && day !== '2027-01-01'),
    });
    expect(result.coverage).toBe('partial');
  });

  it('does not treat plain weekends or listed weekend-only closures as breaks', () => {
    const result = plan({ schoolOffDays: ['2026-10-10', '2026-10-11'] })!;
    expect(result.breaks).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.togetherDaysTotal).toBe(0);
  });

  it('picks the most common preset label in the run, earliest on ties', () => {
    const labels = Object.fromEntries(WINTER.map(day => [day, 'Winter recess']));
    labels['2026-12-25'] = 'Christmas';
    expect(plan({ schoolOffDays: WINTER, schoolLabels: labels })!.breaks[0].label).toBe('Winter recess');
    expect(plan({ schoolOffDays: ['2026-11-26', '2026-11-27'], schoolLabels: { '2026-11-26': 'Thanksgiving', '2026-11-27': 'Recess' } })!.breaks[0].label).toBe('Thanksgiving');
    expect(plan({ schoolOffDays: WINTER })!.breaks[0]).not.toHaveProperty('label');
  });

  it('clips breaks to the planning window and ignores dates outside it', () => {
    const result = plan({ start: '2026-12-23', end: '2027-01-10', schoolOffDays: [...WINTER, '2026-06-01', '2027-06-01'] })!;
    expect(result.breaks.map(brk => [brk.start, brk.end])).toEqual([['2026-12-23', '2027-01-03']]);
    expect(result.gaps.map(gap => gap.date)).toEqual(weekdays('2026-12-23', '2027-01-01'));
  });

  it('keeps separate breaks apart when a school day sits between them', () => {
    const result = plan({ schoolOffDays: ['2026-11-25', '2026-11-27'] })!;
    expect(result.breaks.map(brk => brk.id)).toEqual(['2026-11-25', '2026-11-27']);
  });
});

describe('planFamilyTime per-break choice', () => {
  it('covers the whole winter break when the budget allows', () => {
    const result = plan({ schoolOffDays: WINTER, ptoBudget: 10 })!;
    expect(result.plans[0]).toEqual({
      breakId: '2026-12-19', ptoDays: result.breaks[0].parentWorkdays,
      togetherStart: '2026-12-19', togetherEnd: '2027-01-03', togetherDays: 16,
      fullyCovered: true, excluded: false,
    });
    expect(result.ptoUsed).toBe(8);
    expect(result.ptoLeft).toBe(2);
    expect(result.togetherDaysTotal).toBe(16);
  });

  it('places a short budget where it makes the longest run, earliest on ties', () => {
    const result = plan({ schoolOffDays: WINTER, ptoBudget: 3 })!;
    // Dec 22-24 joins the Christmas weekend: Tue Dec 22 .. Sun Dec 27 = 6 days.
    expect(result.plans[0]).toMatchObject({
      ptoDays: ['2026-12-22', '2026-12-23', '2026-12-24'],
      togetherStart: '2026-12-22', togetherEnd: '2026-12-27', togetherDays: 6, fullyCovered: false,
    });
    expect(result.ptoUsed).toBe(3);
  });

  it('counts free together days in breaks that need no PTO', () => {
    // Friday holiday for both school and parent, plus the weekend.
    const result = plan({ schoolOffDays: ['2026-10-09'], parentFreeDays: [...PARENT_FREE, '2026-10-09'], ptoBudget: 0 })!;
    expect(result.plans[0]).toMatchObject({ ptoDays: [], togetherStart: '2026-10-09', togetherEnd: '2026-10-11', togetherDays: 3, fullyCovered: true });
    expect(result.togetherDaysTotal).toBe(3);
    expect(result.gaps).toEqual([{ date: '2026-10-09', cover: 'you-off' }]);
  });

  it('reports the weekend run when the budget is zero', () => {
    const result = plan({ schoolOffDays: ['2027-01-18'], ptoBudget: 0 })!;
    expect(result.plans[0]).toMatchObject({ ptoDays: [], togetherStart: '2027-01-16', togetherEnd: '2027-01-17', togetherDays: 2 });
    expect(result.uncoveredDays).toEqual(['2027-01-18']);
  });

  it('lets a parent with a Saturday workday PTO it to join the run', () => {
    const parentFree = PARENT_FREE.filter(day => day !== '2027-01-16');
    const result = plan({ schoolOffDays: ['2027-01-18'], parentFreeDays: parentFree, ptoBudget: 2 })!;
    expect(result.breaks[0].parentWorkdays).toEqual(['2027-01-16', '2027-01-18']);
    expect(result.plans[0]).toMatchObject({ ptoDays: ['2027-01-16', '2027-01-18'], togetherDays: 3, fullyCovered: true });
  });
});

describe('planFamilyTime with tracked time off', () => {
  it('spends no PTO on school days the parent already has off through tracked requests', () => {
    const spring = weekdays('2027-03-29', '2027-04-02');
    const committed = planningCommitments(
      [createPtoRequest({ start: '2027-03-29', end: '2027-04-02', status: 'approved' }, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'spring')!],
      WINDOW, { asOf: '2026-11-01', includesApprovedLeave: false },
    ).unavailableDates;
    const result = plan({ schoolOffDays: spring, parentFreeDays: [...PARENT_FREE, ...committed], ptoBudget: 3 })!;
    expect(result.ptoUsed).toBe(0);
    expect(result.ptoLeft).toBe(3);
    expect(result.uncoveredDays).toEqual([]);
  });
});

describe('planFamilyTime allocation across breaks', () => {
  const thanksgiving = ['2026-11-25', '2026-11-26', '2026-11-27'];
  const mlk = ['2027-01-18'];
  const spring = weekdays('2027-03-29', '2027-04-02');

  it('spends PTO where it buys the most together days', () => {
    // 1 day: MLK Monday (+1 day: Sat-Mon = 3) or Wed before Thanksgiving if Thu/Fri are
    // parent holidays (Wed-Sun = 5). The latter wins.
    const parentFree = [...PARENT_FREE, '2026-11-26', '2026-11-27'];
    const result = plan({ schoolOffDays: [...thanksgiving, ...mlk], parentFreeDays: parentFree, ptoBudget: 1 })!;
    expect(result.plans.map(p => p.ptoDays)).toEqual([['2026-11-25'], []]);
    expect(result.togetherDaysTotal).toBe(5 + 2);
  });

  it('prefers fewer PTO days when extra PTO adds nothing', () => {
    const result = plan({ schoolOffDays: mlk, ptoBudget: 10 })!;
    expect(result.ptoUsed).toBe(1);
    expect(result.ptoLeft).toBe(9);
  });

  it('prefers earlier dates when two plans tie on together days and PTO', () => {
    const result = plan({ schoolOffDays: ['2026-09-07', '2027-02-15'], ptoBudget: 1 })!;
    expect(result.plans.map(p => p.ptoDays)).toEqual([['2026-09-07'], []]);
    expect(result.togetherDaysTotal).toBe(3 + 2);
  });

  it('never spends PTO on excluded breaks and leaves them out of the total', () => {
    const result = plan({ schoolOffDays: [...WINTER, ...spring], ptoBudget: 20, excludedBreaks: ['2026-12-19', '2099-01-01'] })!;
    expect(result.plans[0]).toMatchObject({ excluded: true, ptoDays: [], togetherStart: '2026-12-25', togetherDays: 3 });
    expect(result.plans[1]).toMatchObject({ excluded: false, ptoDays: spring, togetherDays: 9 });
    expect(result.togetherDaysTotal).toBe(9);
    expect(result.ptoUsed).toBe(5);
  });

  it('classifies every school-off weekday as you-off, pto, other-adult or uncovered', () => {
    const result = plan({ schoolOffDays: WINTER, ptoBudget: 3, otherAdultDays: ['2026-12-21', '2026-12-22', '2026-12-28'] })!;
    const cover = Object.fromEntries(result.gaps.map(gap => [gap.date, gap.cover]));
    expect(cover).toEqual({
      '2026-12-21': 'other-adult', '2026-12-22': 'pto', '2026-12-23': 'pto', '2026-12-24': 'pto',
      '2026-12-25': 'you-off', '2026-12-28': 'other-adult', '2026-12-29': 'uncovered',
      '2026-12-30': 'uncovered', '2026-12-31': 'uncovered', '2027-01-01': 'you-off',
    });
    expect(result.uncoveredDays).toEqual(['2026-12-29', '2026-12-30', '2026-12-31']);
  });

  it('matches an exhaustive search on random small calendars', () => {
    let seed = 42;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let trial = 0; trial < 150; trial++) {
      const start = '2026-09-01';
      const end = addDays(start, 34);
      const days = rangeISO(start, end);
      const schoolOffDays = days.filter(day => mondayIndexedDow(day) < 5 && random() < 0.35);
      const parentFreeDays = days.filter(day => mondayIndexedDow(day) >= 5 ? random() < 0.9 : random() < 0.15);
      const ptoBudget = Math.floor(random() * 6);
      const result = planFamilyTime({ start, end, schoolOffDays, parentFreeDays, ptoBudget })!;
      expect(result).not.toBeNull();
      const free = new Set(parentFreeDays);
      // Every contiguous workday choice per break, scored by direct run counting.
      const perBreak = result.breaks.map(brk => {
        const breakDays = rangeISO(brk.start, brk.end);
        const work = brk.parentWorkdays;
        const choices = [[] as string[]];
        for (let k = 1; k <= work.length; k++) for (let i = 0; i + k <= work.length; i++) choices.push(work.slice(i, i + k));
        return choices.map(pto => {
          const off = new Set([...pto, ...breakDays.filter(day => free.has(day))]);
          let best = 0; let current = 0;
          for (const day of breakDays) { current = off.has(day) ? current + 1 : 0; best = Math.max(best, current); }
          return { cost: pto.length, together: best };
        });
      });
      let bestTogether = -1; let bestCost = 0;
      const walk = (index: number, budget: number, together: number, cost: number) => {
        if (index === perBreak.length) {
          if (together > bestTogether || (together === bestTogether && cost < bestCost)) { bestTogether = together; bestCost = cost; }
          return;
        }
        for (const option of perBreak[index]) if (option.cost <= budget) walk(index + 1, budget - option.cost, together + option.together, cost + option.cost);
      };
      walk(0, ptoBudget, 0, 0);
      expect([result.togetherDaysTotal, result.ptoUsed]).toEqual([bestTogether, bestCost]);
      expect(result.plans.reduce((sum, p) => sum + p.ptoDays.length, 0)).toBe(result.ptoUsed);
      for (const p of result.plans) {
        if (!p.togetherDays) continue;
        expect(rangeISO(p.togetherStart!, p.togetherEnd!)).toHaveLength(p.togetherDays);
      }
    }
  });
});

describe('planFamilyTime validation and performance', () => {
  it('rejects malformed or oversized input', () => {
    expect(plan({ start: '2026-02-30' })).toBeNull();
    expect(plan({ start: '2027-01-01', end: '2026-12-31' })).toBeNull();
    expect(plan({ start: '2026-01-01', end: '2029-01-01' })).toBeNull(); // 1097 days
    expect(plan({ start: '2026-01-01', end: '2028-12-31' })).not.toBeNull(); // 1096 days
    for (const ptoBudget of [-1, 1.5, MAX_FAMILY_PTO + 1, Number.NaN]) expect(plan({ ptoBudget })).toBeNull();
    expect(plan({ ptoBudget: MAX_FAMILY_PTO })).not.toBeNull();
    expect(plan({ schoolOffDays: ['2026-13-01'] })).toBeNull();
    expect(plan({ schoolOffDays: new Array(MAX_SCHOOL_CALENDAR_DAYS + 1).fill('2026-12-21') })).toBeNull();
    expect(plan({ parentFreeDays: 'nope' as unknown as string[] })).toBeNull();
    expect(plan({ otherAdultDays: ['tomorrow'] })).toBeNull();
    expect(plan({ excludedBreaks: ['x'] })).toBeNull();
    expect(plan({ schoolLabels: { 'not-a-date': 'x' } })).toBeNull();
    expect(plan({ schoolLabels: { '2026-12-21': 'x'.repeat(201) } })).toBeNull();
    expect(planFamilyTime(null as unknown as FamilyPlanInput)).toBeNull();
  });

  it('plans a full school year with budget 60 quickly and a 3-year window without blowing up', () => {
    const offDays = [
      '2026-09-07', '2026-10-09', '2026-10-12', '2026-11-11', '2026-11-25', '2026-11-26', '2026-11-27', ...WINTER,
      '2027-01-18', ...weekdays('2027-02-15', '2027-02-19'), '2027-03-12', ...weekdays('2027-03-29', '2027-04-02'), '2027-05-31',
    ];
    planFamilyTime({ ...WINDOW, schoolOffDays: offDays, parentFreeDays: PARENT_FREE, ptoBudget: 60 });
    const t0 = performance.now();
    const result = planFamilyTime({ ...WINDOW, schoolOffDays: offDays, parentFreeDays: PARENT_FREE, ptoBudget: 60 })!;
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(50);
    expect(result.uncoveredDays).toEqual([]);
    expect(result.plans.every(p => p.fullyCovered)).toBe(true);

    // Worst case: every weekday for three years is a school-off day (one huge break).
    const all = weekdays('2026-01-01', '2028-12-30');
    const t1 = performance.now();
    const huge = planFamilyTime({ start: '2026-01-01', end: '2028-12-30', schoolOffDays: all, parentFreeDays: weekends('2026-01-01', '2028-12-30'), ptoBudget: 60 })!;
    expect(performance.now() - t1).toBeLessThan(500);
    expect(huge.breaks).toHaveLength(1);
    expect(huge.ptoUsed).toBe(60);
  });
});

describe('coverage priority', () => {
  const schoolOffDays = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-12-24'];
  const otherAdultDays = ['2026-11-17', '2026-12-24'];
  const base = { schoolOffDays, otherAdultDays, prioritizeCoverage: true, ptoBudget: 2 };

  it('uses PTO on the earliest listed closures that need coverage and skips confirmed care', () => {
    const result = plan({ ...base, otherAdultConfirmed: true })!;
    expect(result.plans.flatMap(item => item.ptoDays)).toEqual(['2026-11-16', '2026-11-18']);
    expect(result.gaps.map(gap => gap.cover)).toEqual(['pto', 'other-adult', 'pto', 'other-adult']);
    expect(result.uncoveredDays).toEqual([]);
    expect(result.coverage).toBe('partial');
  });

  it('treats proposed availability as tentative and keeps exclusions and budgets', () => {
    const result = plan({ ...base, otherAdultConfirmed: false })!;
    expect(result.plans.flatMap(item => item.ptoDays)).toEqual(['2026-11-16', '2026-11-17']);
    expect(result.uncoveredDays).toEqual(['2026-11-18', '2026-12-24']);
    expect(result.gaps.at(-1)?.cover).toBe('other-adult-proposed');
    const excluded = plan({ ...base, otherAdultConfirmed: false, excludedBreaks: [result.breaks[0].id] })!;
    expect(excluded.plans.flatMap(item => item.ptoDays)).toEqual(['2026-12-24']);
    expect(excluded.ptoLeft).toBe(1);
  });
});
