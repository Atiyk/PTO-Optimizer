import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHolidays } from './holidays';

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

function installFetchMock() {
  const fetchMock = vi.fn(async (url: string) => {
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
    expect(urls.some((u) => u.includes('/2025/US'))).toBe(true);
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
