import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHolidaysWithStatus, bundledHolidayYears, isBundledHolidayYear } from './holidays';

/**
 * Issue 17: holiday data is bundled for the build year plus two (public/holidays/<CC>-<YEAR>.json,
 * written by scripts/build-holidays.ts); later years depend on a live lookup. A year for which
 * no source returned any holidays must be reported as uncovered, never presented as a
 * calendar that simply has no public holidays.
 */

const JULY_4_2028 = { date: '2028-07-04', localName: 'Independence Day', name: 'Independence Day', countryCode: 'US', fixed: true, global: true, counties: null, launchYear: null, types: ['Public'] };
const JULY_4_2029 = { ...JULY_4_2028, date: '2029-07-04' };
const XMAS_2028 = { ...JULY_4_2028, date: '2028-12-25', localName: 'Christmas Day', name: 'Christmas Day' };

type Live = 'empty' | 'fail' | 'data';

/** Production shape: static files exist through 2028 only; later years fall back to Nager. */
function installProductionLikeFetch(live: Live) {
  const fetchMock = vi.fn(async (url: string) => {
    const staticMatch = url.match(/\/holidays\/([A-Z]+)-(\d+)\.json$/);
    if (staticMatch) {
      const year = Number(staticMatch[2]);
      if (year === 2028) return { ok: true, json: async () => [JULY_4_2028, XMAS_2028] } as Response;
      return { ok: false, status: 404, json: async () => { throw new Error('not json'); } } as unknown as Response;
    }
    if (live === 'fail') throw new Error('network down');
    if (live === 'empty') return { ok: true, json: async () => [] } as unknown as Response;
    return { ok: true, json: async () => [JULY_4_2029] } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('bundled holiday coverage manifest', () => {
  it('lists the bundled years and answers per year', () => {
    expect(bundledHolidayYears()).toEqual([2026, 2027, 2028]);
    expect(isBundledHolidayYear(2028)).toBe(true);
    expect(isBundledHolidayYear(2029)).toBe(false);
    expect(isBundledHolidayYear(2030)).toBe(false);
  });
});

describe('getHolidaysWithStatus: uncovered years', () => {
  it('reports 2029 as uncovered when the live source returns no holidays (previously silent: degraded=false, [] holidays)', async () => {
    installProductionLikeFetch('empty');
    const result = await getHolidaysWithStatus('US', '2029-01-01', '2029-12-31');
    expect(result.holidays).toEqual([]);
    expect(result.uncoveredYears).toEqual([2029]);
  });

  it('reports 2029 and 2030 as uncovered when the live lookup fails', async () => {
    installProductionLikeFetch('fail');
    const result = await getHolidaysWithStatus('US', '2029-06-01', '2030-06-30');
    expect(result.degraded).toBe(true);
    expect(result.uncoveredYears).toEqual([2029, 2030]);
  });

  it('a Dec 2028 - Jan 2029 range keeps the 2028 holidays and flags only 2029', async () => {
    installProductionLikeFetch('empty');
    const result = await getHolidaysWithStatus('US', '2028-12-01', '2029-01-31');
    expect(result.holidays.map(h => h.name)).toEqual(['Christmas Day']);
    expect(result.uncoveredYears).toEqual([2029]);
  });

  it('a year the live source genuinely covers is not flagged', async () => {
    installProductionLikeFetch('data');
    const result = await getHolidaysWithStatus('US', '2029-01-01', '2029-12-31');
    expect(result.holidays.map(h => h.nominalDate)).toEqual(['2029-07-04']);
    expect(result.uncoveredYears).toEqual([]);
    expect(result.degraded).toBe(false);
  });

  it('bundled years are covered', async () => {
    installProductionLikeFetch('fail');
    const result = await getHolidaysWithStatus('US', '2028-01-01', '2028-12-31');
    expect(result.uncoveredYears).toEqual([]);
    expect(result.degraded).toBe(false);
  });

  it('does not cache an empty live response forever, so a later visit can still get real data', async () => {
    installProductionLikeFetch('empty');
    await getHolidaysWithStatus('US', '2029-01-01', '2029-12-31');
    installProductionLikeFetch('data');
    const result = await getHolidaysWithStatus('US', '2029-01-01', '2029-12-31');
    expect(result.uncoveredYears).toEqual([]);
    expect(result.holidays).toHaveLength(1);
  });

  it('treats an empty cached year as uncovered too', async () => {
    installProductionLikeFetch('fail');
    localStorage.setItem('pto-optimizer:holidays:v1:US:2030', '[]');
    const result = await getHolidaysWithStatus('US', '2030-01-01', '2030-12-31');
    expect(result.uncoveredYears).toEqual([2030]);
  });
});
