import { addDays, mondayIndexedDow } from '../solver/dateUtils';

const CACHE_PREFIX = 'pto-optimizer:holidays:v1:';
const API_BASE = 'https://date.nager.at/api/v3/PublicHolidays';

// Nager.Date shifts weekend holidays unreliably; we post-process these ourselves.
const OBSERVED_FIX_COUNTRIES = new Set(['US', 'GB', 'CA', 'AU']);

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

export interface Holiday {
  /** The date the holiday is actually observed (off work), after weekend-shift correction. */
  date: string;
  /** The nominal calendar date as reported by the API, before any correction. */
  nominalDate: string;
  name: string;
  countryCode: string;
  /** Subdivision codes this holiday applies to, or null if it's national. */
  counties: string[] | null;
}

function cacheKey(countryCode: string, year: number): string {
  return `${CACHE_PREFIX}${countryCode}:${year}`;
}

function readCache(countryCode: string, year: number): RawHoliday[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(countryCode, year));
    if (!raw) return null;
    return JSON.parse(raw) as RawHoliday[];
  } catch {
    return null;
  }
}

function writeCache(countryCode: string, year: number, data: RawHoliday[]): void {
  try {
    localStorage.setItem(cacheKey(countryCode, year), JSON.stringify(data));
  } catch {
    // localStorage unavailable (quota, privacy mode, SSR) - the app still works, just re-fetches.
  }
}

async function fetchYear(countryCode: string, year: number): Promise<RawHoliday[]> {
  const cached = readCache(countryCode, year);
  if (cached) return cached;
  try {
    const res = await fetch(`${API_BASE}/${year}/${countryCode}`);
    if (!res.ok) return [];
    const data = (await res.json()) as RawHoliday[];
    writeCache(countryCode, year, data);
    return data;
  } catch {
    return [];
  }
}

/** Saturday observed the prior Friday, Sunday observed the following Monday. */
function applyObservedDate(dateISO: string, countryCode: string): string {
  if (!OBSERVED_FIX_COUNTRIES.has(countryCode)) return dateISO;
  const dow = mondayIndexedDow(dateISO); // 0 = Monday .. 6 = Sunday
  if (dow === 5) return addDays(dateISO, -1); // Saturday
  if (dow === 6) return addDays(dateISO, 1); // Sunday
  return dateISO;
}

function toHoliday(raw: RawHoliday): Holiday {
  return {
    date: applyObservedDate(raw.date, raw.countryCode),
    nominalDate: raw.date,
    name: raw.name,
    countryCode: raw.countryCode,
    counties: raw.counties,
  };
}

function appliesToSubdivision(h: Holiday, subdivision?: string): boolean {
  if (!h.counties) return true; // national holiday
  if (!subdivision) return false; // subdivision-specific but none selected
  return h.counties.includes(subdivision);
}

/**
 * Fetches (or reads from cache) all public holidays overlapping [rangeStart, rangeEnd],
 * for every calendar year the range touches, filtered by subdivision if given.
 */
export async function getHolidays(
  countryCode: string,
  rangeStart: string,
  rangeEnd: string,
  subdivision?: string,
): Promise<Holiday[]> {
  const startYear = Number(rangeStart.slice(0, 4));
  const endYear = Number(rangeEnd.slice(0, 4));
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  const perYear = await Promise.all(years.map((y) => fetchYear(countryCode, y)));
  const holidays = perYear.flat().map(toHoliday);

  return holidays
    .filter((h) => appliesToSubdivision(h, subdivision))
    .filter((h) => h.date >= rangeStart && h.date <= rangeEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
}
