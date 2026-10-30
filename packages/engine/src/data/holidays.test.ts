import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHolidays, getHolidaysWithStatus } from './holidays';

interface RawHoliday {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
  fixed: boolean;
  global: boolean;
  counties: string[] | null;
  launchYear: number | null;
  types: string[];
}

function fixtureFor(countryCode: string, year: number): RawHoliday[] {
  if (countryCode === 'US' && year === 2026) {
    return [
      {
        date: '2026-07-04', // Saturday
        localName: 'Independence Day',
        name: 'Independence Day',
        countryCode: 'US',
        fixed: true,
        global: true,
        counties: null,
        launchYear: null,
        types: ['Public'],
      },
      {
        date: '2026-04-20', // Patriots' Day, Massachusetts only
        localName: "Patriots' Day",
        name: "Patriots' Day",
        countryCode: 'US',
        fixed: false,
        global: false,
        counties: ['US-MA'],
        launchYear: null,
        types: ['Public'],
      },
    ];
  }
  if (countryCode === 'US' && year === 2025) {
    return [
      {
        date: '2025-12-25',
        localName: 'Christmas Day',
        name: 'Christmas Day',
        countryCode: 'US',
        fixed: true,
        global: true,
        counties: null,
        launchYear: null,
        types: ['Public'],
      },
    ];
  }
  return [];
}

/**
 * Phase 2: fetchYear now tries the same-origin static file (/holidays/<CC>-<YEAR>.json)
 * before falling back to Nager (PublicHolidays/<YEAR>/<CC>) - this mock recognizes either
 * URL shape and returns the same fixture either way, so existing tests exercise "a fetch
 * succeeded" without caring which stage served it. staticFails lets a test force the
 * static stage to 404 for specific country/years, so the Nager-fallback path still gets
 * exercised the way the pre-Phase-2 tests intended.
 */
function installFetchMock(staticFails: (countryCode: string, year: number) => boolean = () => false) {
  const fetchMock = vi.fn(async (url: string) => {
    const staticMatch = url.match(/\/holidays\/([A-Z]+)-(\d+)\.json$/);
    if (staticMatch) {
      const countryCode = staticMatch[1];
      const year = Number(staticMatch[2]);
      if (staticFails(countryCode, year)) return { ok: false, status: 404, json: async () => [] } as Response;
      return { ok: true, json: async () => fixtureFor(countryCode, year) } as Response;
    }
    const match = url.match(/PublicHolidays\/(\d+)\/([A-Z]+)/);
    const year = Number(match![1]);
    const countryCode = match![2];
    return {
      ok: true,
      json: async () => fixtureFor(countryCode, year),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getHolidays', () => {
  it('fetches once per country-year and never re-fetches on a second call', async () => {
    const fetchMock = installFetchMock();
    await getHolidays('US', '2026-01-01', '2026-12-31');
    await getHolidays('US', '2026-01-01', '2026-12-31');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches every year a range spans', async () => {
    const fetchMock = installFetchMock();
    await getHolidays('US', '2025-12-30', '2026-01-02');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('US-2025.json'))).toBe(true);
    expect(urls.some((u) => u.includes('US-2026.json'))).toBe(true);
  });

  it('falls back to Nager when the same-origin static file is missing (404)', async () => {
    const fetchMock = installFetchMock(() => true); // static always 404s
    const holidays = await getHolidays('US', '2026-01-01', '2026-12-31');
    expect(holidays.some((h) => h.name === 'Independence Day')).toBe(true);
    // one failed static attempt + one successful Nager fallback, per year
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('/2026/US'))).toBe(true);
  });

  it('shifts a Saturday holiday to the observed Friday', async () => {
    installFetchMock();
    const holidays = await getHolidays('US', '2026-01-01', '2026-12-31');
    const independenceDay = holidays.find((h) => h.name === 'Independence Day');
    expect(independenceDay).toBeDefined();
    expect(independenceDay!.nominalDate).toBe('2026-07-04');
    expect(independenceDay!.date).toBe('2026-07-03'); // observed Friday
  });

  it('excludes subdivision-specific holidays when no subdivision is given', async () => {
    installFetchMock();
    const holidays = await getHolidays('US', '2026-01-01', '2026-12-31');
    expect(holidays.some((h) => h.name === "Patriots' Day")).toBe(false);
  });

  it('includes a subdivision-specific holiday only for the matching subdivision', async () => {
    installFetchMock();
    const forMA = await getHolidays('US', '2026-01-01', '2026-12-31', 'US-MA');
    expect(forMA.some((h) => h.name === "Patriots' Day")).toBe(true);

    const forCA = await getHolidays('US', '2026-01-01', '2026-12-31', 'US-CA');
    expect(forCA.some((h) => h.name === "Patriots' Day")).toBe(false);
  });

  it('still returns correct data when localStorage throws on every access', async () => {
    installFetchMock();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const holidays = await getHolidays('US', '2026-01-01', '2026-12-31');
    expect(holidays.some((h) => h.name === 'Independence Day')).toBe(true);
  });

  it('only returns holidays within the requested range', async () => {
    installFetchMock();
    const holidays = await getHolidays('US', '2026-07-01', '2026-07-31');
    expect(holidays).toHaveLength(1);
    expect(holidays[0].date).toBe('2026-07-03');
  });
});

describe('getHolidaysWithStatus (graceful failure, Phase 5)', () => {
  it('degraded is false on a normal successful fetch', async () => {
    installFetchMock();
    const result = await getHolidaysWithStatus('US', '2026-01-01', '2026-12-31');
    expect(result.degraded).toBe(false);
    expect(result.holidays.some((h) => h.name === 'Independence Day')).toBe(true);
  });

  it('degraded is false when the data comes from cache, even without a live fetch', async () => {
    const fetchMock = installFetchMock();
    await getHolidays('US', '2026-01-01', '2026-12-31'); // populates the cache
    fetchMock.mockClear();
    const result = await getHolidaysWithStatus('US', '2026-01-01', '2026-12-31');
    expect(fetchMock).not.toHaveBeenCalled(); // confirms this really came from cache, not a fresh fetch
    expect(result.degraded).toBe(false);
  });

  it('degraded is true when the network fails outright, with an empty holiday list (nothing cached)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const result = await getHolidaysWithStatus('US', '2026-01-01', '2026-12-31');
    expect(result.degraded).toBe(true);
    expect(result.holidays).toEqual([]);
  });

  it('degraded is true when the API responds with a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => [] }) as Response),
    );
    const result = await getHolidaysWithStatus('US', '2026-01-01', '2026-12-31');
    expect(result.degraded).toBe(true);
  });

  it('a range spanning two years is degraded if EITHER year fails, even if the other succeeds, and still returns the data the successful year had', async () => {
    // Static file always 404s here (forces every request through to Nager), where 2025
    // specifically fails outright and 2026 succeeds - exercising the same "one year of a
    // multi-year range fails, the other doesn't" case the pre-Phase-2 version of this test
    // covered, just with the extra static-fallback hop now in between.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/holidays/')) return { ok: false, status: 404, json: async () => [] } as Response;
      if (url.includes('/2025/')) throw new Error('network down for 2025 only');
      return { ok: true, json: async () => fixtureFor('US', 2026) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getHolidaysWithStatus('US', '2025-12-30', '2026-01-02');
    expect(result.degraded).toBe(true);
    // the year that DID succeed still contributes its (in-range) data - a partial failure
    // doesn't throw away data that was actually retrieved successfully elsewhere.
    expect(result.holidays).toEqual([]); // nothing from 2026's fixture falls in this narrow Dec30-Jan2 window, which is correct, not a bug
    const widerRange = await getHolidaysWithStatus('US', '2025-12-30', '2026-12-31');
    expect(widerRange.degraded).toBe(true);
    expect(widerRange.holidays.some((h) => h.name === 'Independence Day')).toBe(true);
  });
});
