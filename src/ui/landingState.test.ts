import { describe, expect, it, vi } from 'vitest';
import shell from '../../index.html?raw';
import { requestByDate } from '@daysoff/engine/calendar/requestDeadline';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { computeLandingPlan, landingHolidayHref, landingNextRequest, landingPlanHref, landingPtoAccounting, landingSearch, readLandingState, reserveSentence, validLandingRange } from './landingState';

describe('homepage planning state', () => {
  const state = { country: 'GB', budget: 17, rangeStart: '2027-02-01', rangeEnd: '2028-02-29' };

  it('round-trips all four inputs, including leap-day and cross-year dates', () => {
    expect(readLandingState(landingSearch(state), '2026-11-02', 'US')).toEqual(state);
  });

  it('preserves the exact live preview inputs when opening the full planner', () => {
    const params = new URL(landingPlanHref(state, '2027-04-12'), 'https://example.test').searchParams;
    expect(Object.fromEntries(params)).toEqual({ c: 'GB', b: '17', s: '2027-02-01', e: '2028-02-29', rv: '0', pv: '2', ps: 'year', mb: '3', lp: '1', w: '30', count: '0', p: '2027-04-12' });
    expect(params.has('home')).toBe(false);
  });

  it('links each holiday even when there is no valid, affordable working-day bridge', () => {
    const date = '2027-12-28';
    const bridgeDate = '2027-12-27';
    const withBridge = new URL(landingHolidayHref(state, date, bridgeDate), 'https://example.test');
    expect(withBridge.searchParams.get('hd')).toBe(date);
    expect(withBridge.searchParams.get('p')).toBe(bridgeDate);
    expect(withBridge.hash).toBe('#holiday-focus');

    for (const href of [landingHolidayHref(state, date), landingHolidayHref(state, date, date), landingHolidayHref({ ...state, budget: 0 }, date, bridgeDate)]) {
      const url = new URL(href, 'https://example.test');
      expect(url.searchParams.get('hd')).toBe(date);
      expect(url.searchParams.has('p')).toBe(false);
    }
  });

  it('rejects invalid, reversed, and unbounded date ranges', () => {
    expect(validLandingRange('2027-02-29', '2027-12-31')).toBe(false);
    expect(validLandingRange('2027-12-31', '2027-01-01')).toBe(false);
    expect(validLandingRange('2027-01-01', '2035-01-01')).toBe(false);
    expect(validLandingRange('', '2027-12-31')).toBe(false);
    expect(validLandingRange('2028-02-29', '2028-03-01')).toBe(true);
  });

  it('bounds malformed country and budget URL values without throwing', () => {
    const restored = readLandingState('?home=1&c=INVALID&b=Infinity&s=2027-02-30&e=2099-01-01', '2026-11-02', 'US');
    expect(restored).toEqual({ country: 'US', budget: 15, rangeStart: '2026-11-02', rangeEnd: '2027-11-01' });
    expect(readLandingState('?home=1&b=0', '2026-11-02', 'US').budget).toBe(0);
    expect(readLandingState('?home=1&b=61', '2026-11-02', 'US').budget).toBe(15);
  });
});

describe('root route migration', () => {
  const source = /<script>([\s\S]*?)<\/script>/.exec(shell)![1];
  const visit = new Function('window', source);
  function redirect(pathname: string, search: string) {
    const replace = vi.fn();
    visit({ location: { pathname, search, hash: '#selected', replace } });
    return replace;
  }

  it('still redirects historic root optimizer links without losing settings or hash', () => {
    expect(redirect('/', '?c=US&b=15&bo=2027-01-01')).toHaveBeenCalledWith('/pto?c=US&b=15&bo=2027-01-01#selected');
  });

  it('keeps explicitly marked homepage previews on the homepage', () => {
    expect(redirect('/', '?home=1&c=GB&b=17')).not.toHaveBeenCalled();
    expect(redirect('/', '')).not.toHaveBeenCalled();
    expect(redirect('/pto', '?c=US&b=15')).not.toHaveBeenCalled();
  });
});

describe('homepage plan facts: reserve and the next request', () => {
  const brk = (start: string, end: string, ptoCost: number) => ({
    id: start, start, end, days: [], totalDaysOff: 9, ptoCost, multiplier: 2, tags: [], meanDemand: 1,
  });

  it('reports the reserve the solver kept, never a guess, and what did not fit', () => {
    expect(landingPtoAccounting({ result: { primary: [brk('2027-01-16', '2027-01-24', 4), brk('2027-06-12', '2027-06-20', 9)] } as never, meta: { reserveKept: 2 } as never }, 15))
      .toEqual({ used: 13, reserveKept: 2, unplaced: 0 });
    expect(landingPtoAccounting({ result: { primary: [brk('2027-01-16', '2027-01-24', 4)] } as never, meta: { reserveKept: 1 } as never }, 8))
      .toEqual({ used: 4, reserveKept: 1, unplaced: 3 });
    // A legacy outcome without metadata reserves nothing.
    expect(landingPtoAccounting({ result: { primary: [brk('2027-01-16', '2027-01-24', 4)] } as never }, 4))
      .toEqual({ used: 4, reserveKept: 0, unplaced: 0 });
  });

  it('matches the live engine: 15 US PTO days plan 13 and keep 2 in reserve', () => {
    const holidays = ['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-10-11', '2027-11-11'].map((date) => ({ date }));
    const outcome = computeLandingPlan({ country: 'US', budget: 15, rangeStart: '2026-11-22', rangeEnd: '2027-11-21' }, holidays);
    const facts = landingPtoAccounting(outcome, 15);
    expect(facts.reserveKept).toBe(outcome.meta?.reserveKept);
    expect(facts.reserveKept).toBe(2);
    expect(facts.used + facts.reserveKept + facts.unplaced).toBe(15);
  });

  it('words the reserve and any unplaced days in PTO-day terms', () => {
    expect(reserveSentence({ used: 13, reserveKept: 2, unplaced: 0 })).toBe('2 PTO days left unplanned, kept for sick days or last-minute plans.');
    expect(reserveSentence({ used: 7, reserveKept: 1, unplaced: 0 })).toBe('1 PTO day left unplanned, kept for sick days or last-minute plans.');
    expect(reserveSentence({ used: 4, reserveKept: 1, unplaced: 3 })).toBe('4 PTO days left unplanned: 1 kept for sick days or last-minute plans, 3 that don’t fit a break in these dates.');
    expect(reserveSentence({ used: 4, reserveKept: 0, unplaced: 2 })).toBe('2 PTO days left unplanned: they don’t fit a break in these dates.');
    expect(reserveSentence({ used: 15, reserveKept: 0, unplaced: 0 })).toBeUndefined();
  });

  it('asks for the earliest break by the same request-by date the planner shows (14-day notice)', () => {
    // Jan 18 (MLK Day) is off, so the absence starts Tue Jan 19; 14 days earlier is Tue Jan 5.
    const next = landingNextRequest([brk('2027-06-12', '2027-06-20', 5), brk('2027-01-16', '2027-01-24', 4)], '2026-11-22', ['2027-01-18']);
    expect(next?.brk.start).toBe('2027-01-16');
    expect(next?.deadline.date).toBe(requestByDate('2027-01-16', 14, DEFAULT_WORK_WEEK, ['2027-01-18'], 'calendar'));
    expect(next?.deadline.date).toBe('2027-01-05');
    expect(next?.deadline.lead).toBe('Ask by Tue Jan 5');
  });

  it('rolls a request-by date that lands on a holiday back to the working day before', () => {
    // Away from Mon Jul 19; 14 days earlier is Mon Jul 5, the observed Independence Day.
    const next = landingNextRequest([brk('2027-07-17', '2027-07-25', 5)], '2027-05-01', ['2027-07-05']);
    expect(next?.deadline.date).toBe('2027-07-02');
    expect(next?.deadline.lead).toBe('Ask by Fri Jul 2');
  });

  it('skips breaks already under way and has nothing to say for an empty plan', () => {
    expect(landingNextRequest([], '2026-11-22', [])).toBeUndefined();
    expect(landingNextRequest([brk('2026-11-20', '2026-11-29', 3)], '2026-11-22', [])).toBeUndefined();
    expect(landingNextRequest([brk('2026-11-20', '2026-11-29', 3), brk('2027-02-13', '2027-02-21', 4)], '2026-11-22', [])?.brk.start).toBe('2027-02-13');
  });
});
