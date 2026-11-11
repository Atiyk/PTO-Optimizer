import { addDays, mondayIndexedDow } from '../solver/dateUtils';
import holidayCoverage from './holidayCoverage.json';

const CACHE_PREFIX = 'pto-optimizer:holidays:v1:';
const API_BASE = 'https://date.nager.at/api/v3/PublicHolidays';
/** Phase 2: the same files scripts/build-holidays.ts commits under public/holidays/ -
 * same-origin, so no CORS and no dependency on Nager being up for the common case. Tried
 * first; Nager is now the FALLBACK, only hit for a country/year this build didn't have
 * (or a build old enough that the static file is missing one of this call's requested
 * years - see fetchYear). */
const STATIC_BASE = '/holidays';

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

interface YearFetch {
  data: RawHoliday[];
  /** True only when a live fetch was actually attempted and failed for this year - never
   * set when a cached copy already satisfied the request without touching the network. */
  failed: boolean;
}

async function fetchYear(countryCode: string, year: number): Promise<YearFetch> {
  const cached = readCache(countryCode, year);
  if (cached) return { data: cached, failed: false };

  try {
    const staticRes = await fetch(`${STATIC_BASE}/${countryCode}-${year}.json`);
    if (staticRes.ok) {
      const data = (await staticRes.json()) as RawHoliday[];
      writeCache(countryCode, year, data);
      return { data, failed: false };
    }
  } catch {
    // Same-origin static file genuinely missing or unreadable - fall through to Nager.
  }

  try {
    const res = await fetch(`${API_BASE}/${year}/${countryCode}`);
    if (!res.ok) return { data: [], failed: true };
    const data = (await res.json()) as RawHoliday[];
    // Issue 17: an empty answer is "no data for this year", not a fact worth caching forever.
    if (Array.isArray(data) && data.length > 0) writeCache(countryCode, year, data);
    return { data, failed: false };
  } catch {
    return { data: [], failed: true };
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

/** Exported for scripts/prerender.ts: converts the same raw Nager shape the committed
 * public/holidays/ files store into real Holiday records, with the same observed-date
 * correction `fetchYear` applies - the prerendered snapshot and the live-fetched data must
 * go through the identical transform, or a holiday's `date` could differ between the HTML
 * a crawler sees and what hydration computes. */
export function rawHolidaysToHolidays(raw: RawHoliday[]): Holiday[] {
  return raw.map(toHoliday);
}

declare global {
  interface Window {
    /** Phase 2: set inline by each route's own HTML, before the bundle loads - the exact
     * same static data scripts/prerender.ts read in Node to build that route's initial
     * HTML, so the client's FIRST render (before hydration, before any fetch effect runs)
     * starts from the same real holidays rather than an empty list. Read once via
     * `getPreloadedHolidays`; the normal live-fetch effects still run afterward as before,
     * they just no longer need to replace an empty placeholder with real data visibly. */
    __PTO_PRELOADED_HOLIDAYS__?: Record<string, Holiday[]>;
  }
}

/** Synchronous - used only as a lazy useState initializer, never inside an effect. Returns
 * [] on the very first client-only render of a route this value was never embedded on
 * (e.g. a hard navigation to a country the build didn't preload), which is exactly the
 * pre-Phase-2 behavior for that case - unaffected, not regressed. */
export function getPreloadedHolidays(countryCode: string): Holiday[] {
  if (typeof window === 'undefined') return [];
  return window.__PTO_PRELOADED_HOLIDAYS__?.[countryCode] ?? [];
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

export interface HolidayFetchResult {
  holidays: Holiday[];
  /**
   * True when at least one year's public-holiday data couldn't be fetched (network down,
   * the API unreachable, a non-2xx response) and no cached copy existed to fall back on
   * for that year - "fetched nothing" is quietly indistinguishable from "there are no
   * holidays" otherwise, which is the actual failure mode this flag exists to surface.
   * Never true when a cached copy served the request, even an old one - a cache hit is a
   * success, not a degraded fallback, under this cache-forever-per-country-year design.
   */
  degraded: boolean;
  /**
   * Issue 17: calendar years in the requested range for which no source (cache, bundled
   * static file, live lookup) returned any public holidays. Every supported country has
   * public holidays every year, so an empty year means "data not available", and callers
   * must say so ("results assume no public holidays in 2029") instead of presenting it as
   * a holiday-free calendar. Optional only so hand-built results stay assignable.
   */
  uncoveredYears?: number[];
}

/** Issue 17: years scripts/build-holidays.ts bundled for every country in this build. */
export function bundledHolidayYears(): number[] {
  const years = (holidayCoverage as { bundledYears?: unknown }).bundledYears;
  return Array.isArray(years) ? years.filter((y): y is number => Number.isSafeInteger(y)).sort((a, b) => a - b) : [];
}

export function isBundledHolidayYear(year: number): boolean {
  return bundledHolidayYears().includes(year);
}

function filterAndSort(holidays: Holiday[], rangeStart: string, rangeEnd: string, subdivision: string | undefined): Holiday[] {
  return holidays
    .filter((h) => appliesToSubdivision(h, subdivision))
    .filter((h) => h.date >= rangeStart && h.date <= rangeEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchYears(countryCode: string, rangeStart: string, rangeEnd: string): Promise<{ holidays: Holiday[]; degraded: boolean; uncoveredYears: number[] }> {
  const startYear = Number(rangeStart.slice(0, 4));
  const endYear = Number(rangeEnd.slice(0, 4));
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  const perYear = await Promise.all(years.map((y) => fetchYear(countryCode, y)));
  const holidays = perYear.flatMap((y) => y.data).map(toHoliday);
  const degraded = perYear.some((y) => y.failed);
  const uncoveredYears = years.filter((_, i) => !Array.isArray(perYear[i].data) || perYear[i].data.length === 0);
  return { holidays, degraded, uncoveredYears };
}

/**
 * Fetches (or reads from cache) all public holidays overlapping [rangeStart, rangeEnd],
 * for every calendar year the range touches, filtered by subdivision if given. Fails
 * silently to an empty list on an unreachable API - kept for existing callers/tests that
 * only need the plain list; `getHolidaysWithStatus` is the version that reports the
 * failure instead of hiding it, and is what the UI layer should use.
 */
export async function getHolidays(
  countryCode: string,
  rangeStart: string,
  rangeEnd: string,
  subdivision?: string,
): Promise<Holiday[]> {
  const { holidays } = await fetchYears(countryCode, rangeStart, rangeEnd);
  return filterAndSort(holidays, rangeStart, rangeEnd, subdivision);
}

/** Same data as getHolidays, plus whether the fetch degraded (network/API failure with no
 * cached fallback) so the UI can say so instead of presenting a thin or empty result as if
 * it were simply "no holidays here" - see HolidayFetchResult. */
export async function getHolidaysWithStatus(
  countryCode: string,
  rangeStart: string,
  rangeEnd: string,
  subdivision?: string,
): Promise<HolidayFetchResult> {
  const { holidays, degraded, uncoveredYears } = await fetchYears(countryCode, rangeStart, rangeEnd);
  return { holidays: filterAndSort(holidays, rangeStart, rangeEnd, subdivision), degraded, uncoveredYears };
}

/**
 * BUG FOUND (Phase 2): `appliesToSubdivision` strips every county-specific holiday out of
 * the result whenever no subdivision is passed (`if (!subdivision) return false`) - exactly
 * backwards for "which subdivisions does this country even have", which needs to see the
 * county-specific holidays BEFORE any subdivision is picked, not after. getHolidays/
 * getHolidaysWithStatus can't be reused for this - confirmed empirically: a real DE 2027
 * fetch with no subdivision came back with zero `counties` entries, even though the same
 * range fetched WITH subdivision='DE-BY' correctly returned 3 Bavaria-specific holidays.
 * This bypasses the subdivision filter entirely (date-range filter still applies) so a
 * caller can see every county-specific holiday regardless of selection.
 */
export async function getSubdivisionCandidates(
  countryCode: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<Holiday[]> {
  const { holidays } = await fetchYears(countryCode, rangeStart, rangeEnd);
  return holidays.filter((h) => h.counties && h.date >= rangeStart && h.date <= rangeEnd);
}
