import { COUNTRIES } from '@daysoff/engine/data/countries';
import {
  getHolidays, getHolidaysWithStatus, getPreloadedHolidays, getSubdivisionCandidates,
  type Holiday, type HolidayFetchResult,
} from '@daysoff/engine/data/holidays';
import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate } from '../ui/urlState';

const COUNTRY_CODES = new Set(COUNTRIES.map(({ code }) => code));

declare global {
  interface Window {
    /** Nominal source years included in each prerendered calendar. */
    __PTO_PRELOADED_HOLIDAY_YEARS__?: Record<string, number[]>;
  }
}

function validRange(start: string, end: string): boolean {
  if (!isValidISODate(start) || !isValidISODate(end) || end < start) return false;
  const years = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
  return years < 10 || (years === 10 && end.slice(5) <= start.slice(5));
}

/** A Saturday January 1 can be observed on the preceding Friday. Both loader
 * normalization and already-observed source records can put it in the prior year.
 * Other ranges keep their original lookup years, avoiding unrelated data failures. */
export function consumerHolidayLookupEnd(country: string, rangeStart: string, rangeEnd: string): string {
  if (!COUNTRY_CODES.has(country) || !validRange(rangeStart, rangeEnd)
    || !rangeEnd.endsWith('-12-31')) return rangeEnd;
  const nextNewYear = `${Number(rangeEnd.slice(0, 4)) + 1}-01-01`;
  return isValidISODate(nextNewYear) && mondayIndexedDow(nextNewYear) === 5 ? nextNewYear : rangeEnd;
}

/** Keep distinct holiday names for employer controls; repeated copies of the same
 * named day merge their regional coverage instead of counting or losing a date twice. */
export function observedEntries(holidays: Holiday[], country: string, start: string, end: string): Holiday[] {
  if (!Array.isArray(holidays)) throw new Error('Holiday data must be a list.');
  const entries = new Map<string, Holiday>();
  for (const holiday of holidays) {
    if (!holiday || typeof holiday !== 'object' || !isValidISODate(holiday.date)
      || !isValidISODate(holiday.nominalDate) || typeof holiday.name !== 'string' || !holiday.name.trim()
      || typeof holiday.countryCode !== 'string' || !/^[A-Z]{2}$/.test(holiday.countryCode)
      || !(holiday.counties === null || (Array.isArray(holiday.counties) && holiday.counties.every((region) => typeof region === 'string')))) {
      throw new Error('Holiday data contains an invalid record.');
    }
    if (holiday.countryCode !== country || holiday.date < start || holiday.date > end) continue;
    const key = `${holiday.date}|${holiday.name}`;
    const existing = entries.get(key);
    if (!existing) entries.set(key, holiday);
    else entries.set(key, {
      ...existing,
      counties: existing.counties && holiday.counties ? [...new Set([...existing.counties, ...holiday.counties])].sort() : null,
    });
  }
  return [...entries.values()].sort((a, b) => `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`));
}

export function validScope(country: string, start: string, end: string, subdivision?: string): boolean {
  return COUNTRY_CODES.has(country) && validRange(start, end)
    && (!subdivision || (/^[A-Z0-9-]{1,16}$/.test(subdivision)
      && subdivision.startsWith(`${country}-`) && subdivision.length > country.length + 1));
}

/** An empty array can be complete. Undefined means the requested source years
 * are missing and the live lookup is needed, including any observed spillover. */
export function readPreloadedConsumerHolidays(country: string, start: string, end: string, subdivision?: string): Holiday[] | undefined {
  if (typeof window === 'undefined' || !validScope(country, start, end, subdivision)) return;
  const years = window.__PTO_PRELOADED_HOLIDAY_YEARS__?.[country];
  if (!years) return;
  const lookupEnd = consumerHolidayLookupEnd(country, start, end);
  for (let year = Number(start.slice(0, 4)); year <= Number(lookupEnd.slice(0, 4)); year++) {
    if (!years.includes(year)) return;
  }
  try {
    const preloaded = getPreloadedHolidays(country).filter(holiday => !holiday.counties || (subdivision && holiday.counties.includes(subdivision)));
    return observedEntries(preloaded, country, start, end);
  } catch { return undefined; }
}

export async function getConsumerHolidaysWithStatus(
  country: string, rangeStart: string, rangeEnd: string, subdivision?: string,
): Promise<HolidayFetchResult> {
  if (!validScope(country, rangeStart, rangeEnd, subdivision)) return { holidays: [], degraded: true };
  try {
    const result = await getHolidaysWithStatus(country, rangeStart, consumerHolidayLookupEnd(country, rangeStart, rangeEnd), subdivision);
    if (typeof result.degraded !== 'boolean') throw new Error('Holiday status is invalid.');
    const holidays = observedEntries(result.holidays, country, rangeStart, rangeEnd);
    if (!Array.isArray(result.uncoveredYears)) return { holidays, degraded: result.degraded };
    // Issue 17: report only the plan's own years, never a lookup-only spillover year.
    const first = Number(rangeStart.slice(0, 4)), last = Number(rangeEnd.slice(0, 4));
    const uncoveredYears = [...new Set(result.uncoveredYears)]
      .filter((year): year is number => Number.isSafeInteger(year) && year >= first && year <= last)
      .sort((a, b) => a - b);
    return { holidays, degraded: result.degraded, uncoveredYears };
  } catch {
    return { holidays: [], degraded: true };
  }
}

export async function getConsumerHolidays(
  country: string, rangeStart: string, rangeEnd: string, subdivision?: string,
): Promise<Holiday[]> {
  if (!validScope(country, rangeStart, rangeEnd, subdivision)) return [];
  try {
    return observedEntries(await getHolidays(country, rangeStart, consumerHolidayLookupEnd(country, rangeStart, rangeEnd), subdivision), country, rangeStart, rangeEnd);
  } catch { return []; }
}

export async function getConsumerSubdivisionCandidates(
  country: string, rangeStart: string, rangeEnd: string,
): Promise<Holiday[]> {
  if (!validScope(country, rangeStart, rangeEnd)) return [];
  try {
    return observedEntries(await getSubdivisionCandidates(country, rangeStart, consumerHolidayLookupEnd(country, rangeStart, rangeEnd)), country, rangeStart, rangeEnd);
  } catch { return []; }
}
