import { describe, expect, it, vi } from 'vitest';
import shell from '../../index.html?raw';
import { landingHolidayHref, landingPlanHref, landingSearch, readLandingState, validLandingRange } from './landingState';

describe('homepage planning state', () => {
  const state = { country: 'GB', budget: 17, rangeStart: '2027-02-01', rangeEnd: '2028-02-29' };

  it('round-trips all four inputs, including leap-day and cross-year dates', () => {
    expect(readLandingState(landingSearch(state), '2026-11-02', 'US')).toEqual(state);
  });

  it('preserves the exact live preview inputs when opening the full planner', () => {
    const params = new URL(landingPlanHref(state, '2027-04-12'), 'https://example.test').searchParams;
    expect(Object.fromEntries(params)).toEqual({ c: 'GB', b: '17', s: '2027-02-01', e: '2028-02-29', rv: '0', pv: '2', ps: 'balanced', mb: '3', lp: '1', w: '30', count: '3', p: '2027-04-12' });
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
