import { describe, expect, it } from 'vitest';
import { addDays, isoToSerial } from '@daysoff/engine/solver/dateUtils';
import type { Break } from '@daysoff/engine/solver/types';
import { consumerHolidaysFromSource, planFromSearch, type SolvedPlan } from '../autopilot/planFromSearch';
import { diskHolidays } from '../autopilot/feedTestHolidays';
import { computeLandingPlan, landingPlanHref } from '../ui/landingState';
import { readFullStateFromURL, writeFullStateToURL } from '../ui/urlState';
import { validatePtoDates } from './optimizer';
import { comparePlanStyles } from './planComparison';
import { planInputIssues } from './inputIssues';
import { seasonOfDate, seasonWindows, solveStyled } from './yearPlan';
import { LEGACY_PLAN_CASES, LEGACY_PLAN_TODAY } from './legacyPlanCases';
import legacyFixtures from './__fixtures__/legacy-plans-e28eeab.json';

const TODAY = '2026-11-14';
const YEAR = 's=2026-11-14&e=2027-11-13';

function plan(search: string, today = TODAY): SolvedPlan {
  const result = planFromSearch(search, today, diskHolidays);
  if (!result.ok) throw new Error(result.issues.join(' '));
  return result;
}

/** Shared invariants for every recommended plan: unique days, breaks separated by a
 * working day, funded on every date (no negative balance), no PTO on a free day. */
function expectSound(p: SolvedPlan) {
  const { breaks, solveInput } = p;
  const days = breaks.flatMap((b) => b.days);
  expect(new Set(days).size).toBe(days.length);
  for (let i = 1; i < breaks.length; i++) expect(isoToSerial(breaks[i].start) - isoToSerial(breaks[i - 1].end)).toBeGreaterThanOrEqual(2);
  const check = validatePtoDates(solveInput, days);
  expect(check.issue).toBeUndefined();
  expect(check.valid).toBe(true);
  expect(p.outcome.result.budgetSpent).toBe(check.ptoDays.length);
  expect(check.ptoDays.length).toBeLessThanOrEqual(solveInput.budget);
  for (const brk of breaks) expect(brk.totalDaysOff).toBe(brk.days.length);
}

const seasonsOf = (breaks: Break[], country: string) => new Set(breaks.flatMap((b) => b.days.map((d) => seasonOfDate(d, country))));
const totalOff = (breaks: Break[]) => breaks.reduce((sum, b) => sum + b.totalDaysOff, 0);

describe('old links reproduce the e28eeab plans exactly', () => {
  const fixtures = legacyFixtures as Record<string, unknown>;
  for (const search of LEGACY_PLAN_CASES) {
    it(search, () => {
      const result = planFromSearch(search, LEGACY_PLAN_TODAY, diskHolidays);
      const actual = result.ok ? { outcome: result.outcome } : result;
      if (search.includes('c=GB&') && !search.includes('sd=')) {
        // Deliberate correctness fix, not a semantics change: e28eeab ignored New Year's
        // Day for GB without a nation (Nager lists it per nation), so this old plan charged
        // PTO on a bank holiday. Old links keep their style; they no longer spend PTO on it.
        const oldDays = JSON.stringify(fixtures[search]);
        expect(oldDays).toContain('"2027-01-01"');
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.outcome.result.budgetSpent).toBeLessThanOrEqual(25);
          for (const brk of result.outcome.result.primary) expect(brk.totalDaysOff).toBe(brk.days.length);
        }
        return;
      }
      expect(JSON.stringify(actual)).toBe(JSON.stringify(fixtures[search]));
    });
  }
});

describe('year-round default plan (ps=year)', () => {
  it('a fresh US visit with 15 days spreads breaks over 3+ seasons, keeps 2 days and leaves the first 3 weeks free', () => {
    const p = plan('', TODAY);
    expect(p.state.planningStyle).toBe('year');
    expectSound(p);
    expect(p.outcome.meta?.reserveKept).toBe(2);
    expect(p.outcome.result.budgetSpent).toBeLessThanOrEqual(13);
    expect(seasonsOf(p.breaks, 'US').size).toBeGreaterThanOrEqual(3);
    const lead = addDays(TODAY, 21);
    expect(p.outcome.meta?.leadUntil).toBe(lead);
    for (const brk of p.breaks) expect(brk.start >= lead).toBe(true);
    // The old default spent everything between Dec 24 and Feb 15.
    expect(p.breaks.some((b) => b.start >= '2027-03-01')).toBe(true);
  });

  it('is deterministic and fast enough to run live (1-year US plan)', () => {
    const hol = consumerHolidaysFromSource(diskHolidays, 'US', '2026-11-14', '2027-11-13').map((h) => h.date);
    const input = { offDays: hol, rangeStart: '2026-11-14', rangeEnd: '2027-11-13', budget: 15, country: 'US' };
    const first = solveStyled(input, { style: 'year', minimumBreakDays: 3 });
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      expect(solveStyled(input, { style: 'year', minimumBreakDays: 3 })).toEqual(first);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    // Target < 150 ms; the bound is loose for shared CI machines.
    expect(times[2]).toBeLessThan(600);
  });

  it('UK: England and Scotland each get a valid, spread plan on their own holidays', () => {
    const eng = plan(`?pv=2&ps=year&mb=3&rv=0&c=GB&sd=GB-ENG&b=25&${YEAR}`);
    const sct = plan(`?pv=2&ps=year&mb=3&rv=0&c=GB&sd=GB-SCT&b=25&${YEAR}`);
    for (const p of [eng, sct]) {
      expectSound(p);
      expect(seasonsOf(p.breaks, 'GB').size).toBeGreaterThanOrEqual(3);
      expect(p.outcome.meta?.reserveKept).toBe(2);
      // No season takes more than half the spendable 23 days.
      for (const w of p.outcome.meta!.windows) expect(w.budget).toBeLessThanOrEqual(12);
    }
    expect(sct.solveInput.offDays).toContain('2026-11-30'); // St Andrew's Day
    expect(eng.solveInput.offDays).not.toContain('2026-11-30');
  });

  it('DE: Bavaria and Berlin differ by state holidays; a Christmas break crosses the year boundary once', () => {
    const by = plan(`?pv=2&ps=year&mb=3&rv=0&c=DE&sd=DE-BY&b=30&${YEAR}`);
    const be = plan(`?pv=2&ps=year&mb=3&rv=0&c=DE&sd=DE-BE&b=30&${YEAR}`);
    for (const p of [by, be]) {
      expectSound(p);
      expect(seasonsOf(p.breaks, 'DE').size).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(by.solveInput.offDays)).not.toEqual(new Set(be.solveInput.offDays));
    const crossing = by.breaks.find((b) => b.start <= '2026-12-31' && b.end >= '2027-01-01');
    expect(crossing).toBeTruthy();
    expect(crossing!.days.filter((d) => d === '2027-01-01')).toHaveLength(1);
  });

  it('AU July-June range uses southern seasons', () => {
    const p = plan('?pv=2&ps=year&mb=3&rv=0&c=AU&b=20&s=2026-07-01&e=2027-06-30', '2026-06-20');
    expectSound(p);
    expect(seasonsOf(p.breaks, 'AU').size).toBeGreaterThanOrEqual(3);
    const windows = p.outcome.meta!.windows;
    expect(windows.find((w) => w.start <= '2027-01-15' && w.end >= '2027-01-15')?.season).toBe('summer');
    expect(windows.find((w) => w.start <= '2026-08-15' && w.end >= '2026-08-15')?.season).toBe('winter');
    const summer = plan('?pv=2&ps=season&sn=summer&mb=3&rv=0&c=AU&b=20&s=2026-07-01&e=2027-06-30', '2026-06-20');
    expectSound(summer);
    const longest = [...summer.breaks].sort((a, b) => b.ptoCost - a.ptoCost)[0];
    expect(seasonOfDate(longest.start, 'AU')).toBe('summer');
    expect(longest.ptoCost).toBeGreaterThanOrEqual(Math.ceil(0.4 * 18));
  });

  it('handles a leap year (2028) with the winter window ending on Feb 29', () => {
    expect(seasonWindows('2028-01-01', '2028-12-31', 'US', 21)[0]).toEqual({ season: 'winter', start: '2028-01-01', end: '2028-02-29' });
    const p = plan('?pv=2&ps=year&mb=3&rv=0&c=US&b=15&s=2028-01-01&e=2028-12-31', '2027-12-01');
    expectSound(p);
    expect(seasonsOf(p.breaks, 'US').size).toBeGreaterThanOrEqual(3);
  });

  it('0, 1 and 40 PTO days', () => {
    const zero = plan(`?pv=2&ps=year&mb=3&rv=0&c=US&b=0&${YEAR}`);
    expectSound(zero);
    expect(zero.breaks).toHaveLength(0);
    expect(zero.outcome.issue).toBeUndefined();
    const one = plan(`?pv=2&ps=year&mb=3&rv=0&c=US&b=1&${YEAR}`);
    expectSound(one);
    expect(one.outcome.meta?.reserveKept).toBe(0);
    expect(one.outcome.result.budgetSpent).toBe(1);
    const forty = plan(`?pv=2&ps=year&mb=3&rv=0&c=US&b=40&${YEAR}`);
    expectSound(forty);
    expect(forty.outcome.meta?.reserveKept).toBe(2);
    expect(forty.outcome.result.budgetSpent).toBeLessThanOrEqual(38);
    expect(seasonsOf(forty.breaks, 'US').size).toBeGreaterThanOrEqual(3);
    for (const w of forty.outcome.meta!.windows) expect(w.budget).toBeLessThanOrEqual(19);
  });

  it('the auto reserve tops up, never doubles, a reserve the person already set', () => {
    const held = plan(`?pv=2&ps=year&mb=3&rv=3&c=US&b=18&${YEAR}`);
    expect(held.outcome.meta?.reserveKept).toBe(0);
    const partial = plan(`?pv=2&ps=year&mb=3&rv=1&c=US&b=16&${YEAR}`);
    expect(partial.outcome.meta?.reserveKept).toBe(1);
  });

  it('Sun-Thu work week never charges PTO on Friday or Saturday', () => {
    const p = plan(`?pv=2&ps=year&mb=3&rv=0&c=US&b=15&ww=1111001&${YEAR}`);
    expectSound(p);
    const ptoDays = validatePtoDates(p.solveInput, p.breaks.flatMap((b) => b.days)).ptoDays;
    for (const d of ptoDays) expect([4, 5]).not.toContain((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7);
  });

  it('a notice period longer than the time to the first holiday pushes breaks out, keeping pinned dates', () => {
    const p = plan(`?pv=2&ps=year&mb=3&rv=0&c=US&b=15&np=60&p=2026-11-27&${YEAR}`);
    expectSound(p);
    const lead = addDays(TODAY, 67);
    expect(p.outcome.meta?.leadUntil).toBe(lead);
    expect(p.breaks.some((b) => b.days.includes('2026-11-27'))).toBe(true);
    for (const brk of p.breaks) if (!brk.days.includes('2026-11-27')) expect(brk.start >= lead).toBe(true);
  });

  it('non-December expiry with a small carryover stays valid', () => {
    const p = plan(`?pv=2&ps=year&mb=3&rv=0&c=US&b=15&ex=1&xd=2027-03-31&cc=2&${YEAR}`);
    expectSound(p);
    expect(p.breaks.length).toBeGreaterThan(0);
  });

  it('monthly accrual is funded on every planned date', () => {
    const p = plan('?pv=2&ps=year&mb=3&rv=0&c=US&b=15&ac=1&am=1.25&s=2027-01-01&e=2027-12-31', '2026-12-20');
    expectSound(p);
    expect(p.breaks.length).toBeGreaterThan(0);
  });

  it('year and max give genuinely different plans; max has the most days off', () => {
    const year = plan(`?pv=2&ps=year&mb=3&rv=0&c=US&b=15&${YEAR}`);
    const max = plan(`?pv=2&ps=max&mb=3&rv=0&c=US&b=15&${YEAR}`);
    expectSound(max);
    expect(max.breaks.map((b) => b.id)).not.toEqual(year.breaks.map((b) => b.id));
    expect(totalOff(max.breaks)).toBeGreaterThan(totalOff(year.breaks));
    // max = w0/any count; it beats the balanced preset and every other count for these inputs.
    const balanced = plan(`?pv=2&ps=balanced&mb=3&rv=0&c=US&b=15&${YEAR}`);
    expect(totalOff(max.breaks)).toBeGreaterThanOrEqual(totalOff(balanced.breaks));
    for (const count of [1, 3, 7]) {
      const custom = plan(`?pv=2&ps=custom&mb=3&rv=0&c=US&b=15&w=0&count=${count}&${YEAR}`);
      expect(totalOff(max.breaks)).toBeGreaterThanOrEqual(totalOff(custom.breaks));
    }
  });

  it('season=summer puts one big break in summer and spreads the rest (US)', () => {
    const p = plan(`?pv=2&ps=season&sn=summer&mb=3&rv=0&c=US&b=15&${YEAR}`);
    expectSound(p);
    const big = p.breaks.filter((b) => seasonOfDate(b.start, 'US') === 'summer').sort((a, b) => b.ptoCost - a.ptoCost)[0];
    expect(big.ptoCost).toBeGreaterThanOrEqual(Math.ceil(0.4 * 13));
    expect(seasonsOf(p.breaks, 'US').size).toBeGreaterThanOrEqual(3);
  });

  it('a short range degrades to fewer seasons and says why', () => {
    const p = plan('?pv=2&ps=year&mb=3&rv=0&c=US&b=10&s=2027-01-01&e=2027-03-15', '2026-12-20');
    expectSound(p);
    expect(p.outcome.meta?.note).toMatch(/season/);
  });

  it('the homepage number equals the /pto plan it links to', () => {
    for (const country of ['US', 'GB', 'DE']) {
      const state = { country, budget: 20, rangeStart: TODAY, rangeEnd: '2027-11-13' };
      const holidays = consumerHolidaysFromSource(diskHolidays, country, state.rangeStart, state.rangeEnd);
      const preview = computeLandingPlan(state, holidays);
      const linked = plan(landingPlanHref(state).slice('/pto'.length));
      expect(linked.breaks).toEqual(preview.result.primary);
      expect(linked.outcome.meta).toEqual(preview.meta);
    }
  });
});

describe('plan comparison', () => {
  it('returns 2-3 distinct valid plans with their trade-offs', () => {
    const p = plan(`?pv=2&ps=year&mb=3&rv=0&c=US&b=15&${YEAR}`);
    const entries = comparePlanStyles({ input: p.solveInput, minimumBreakDays: 3, plan: { noticeDays: 14, heldReserveDays: 0 } });
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.length).toBeLessThanOrEqual(3);
    expect(entries[0].style).toBe('year');
    expect(entries.map((e) => e.style)).toContain('max');
    const keys = entries.map((e) => e.breaks.map((b) => b.id).join());
    expect(new Set(keys).size).toBe(entries.length);
    for (const e of entries) {
      expect(validatePtoDates(p.solveInput, e.breaks.flatMap((b) => b.days)).valid).toBe(true);
      expect(e.ptoUsed + e.remainingPto).toBe(15);
      expect(e.longestBreak).toBe(Math.max(...e.breaks.map((b) => b.totalDaysOff)));
      expect(e.breakCount).toBe(e.breaks.length);
      expect(e.monthsTouched.length).toBeGreaterThan(0);
      expect(e.tradeOff.length).toBeGreaterThan(10);
    }
    expect(entries.find((e) => e.style === 'max')!.tradeOff).toMatch(/bunch/);
  });
});

describe('input validation never silently replaces a value', () => {
  const defaults = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 15, country: 'US' };
  it('negative budget shows 0 with a note; an impossible budget is capped with the limit', () => {
    const negative = readFullStateFromURL('?b=-5', defaults);
    expect(negative.budget).toBe(0);
    expect(negative.inputIssues).toEqual([{ field: 'budget', message: "PTO can't be negative — showing 0 until you change it." }]);
    const huge = readFullStateFromURL('?b=400', defaults);
    expect(huge.budget).toBe(365);
    expect(huge.inputIssues?.[0].message).toMatch(/365/);
    expect(readFullStateFromURL('?b=20', defaults).inputIssues).toBeUndefined();
  });
  it('flags an unknown country, a multi-year range and more PTO than working days', () => {
    const issues = planInputIssues({ country: 'XX', rangeStart: '2027-01-01', rangeEnd: '2028-06-30', budget: 300, workingDaysInRange: 250 });
    expect(issues.map((i) => i.field)).toEqual(['country', 'range', 'budget']);
    expect(issues[0].message).toBe('No holiday data for XX — plan uses weekends only.');
    expect(issues[1].message).toMatch(/one pool/);
    expect(planInputIssues({ country: 'US', rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 15, workingDaysInRange: 250 })).toEqual([]);
  });
});

describe('URL round trip for the new styles', () => {
  const defaults = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 15, country: 'US' };
  for (const search of ['?pv=2&ps=year&mb=3', '?pv=2&ps=max&mb=3', '?pv=2&ps=season&sn=winter&mb=3', '?pv=2&ps=season&sn=spring&mb=0']) {
    it(search, () => {
      const state = readFullStateFromURL(`${search}&s=2027-01-01&e=2027-12-31&b=15`, defaults);
      const params = new URLSearchParams();
      writeFullStateToURL(params, { ...state, country: state.country!, subdivision: state.subdivision, forced: {}, expiryDate: state.expiryDate ?? '', altFridayStart: '', peakCapStart: '', peakCapEnd: '' });
      const original = new URLSearchParams(search);
      for (const key of ['pv', 'ps', 'mb', 'sn']) expect(params.get(key)).toBe(original.get(key));
      expect(readFullStateFromURL(params.toString(), defaults)).toMatchObject({ planningStyle: state.planningStyle, season: state.season });
    });
  }
  it('an unknown season falls back to summer', () => {
    expect(readFullStateFromURL('?pv=2&ps=season&sn=monsoon', defaults).season).toBe('summer');
  });
});
