import { COUNTRIES } from '@daysoff/engine/data/countries';
import {
  getHolidays, getHolidaysWithStatus, getSubdivisionCandidates,
  type Holiday, type HolidayFetchResult,
} from '@daysoff/engine/data/holidays';
import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate } from '../ui/urlState';

const COUNTRY_CODES = new Set(COUNTRIES.map(({ code }) => code));
// Match the existing engine's observed-date correction, without changing shared logic.
const OBSERVED_FIX_COUNTRIES = new Set(['US', 'GB', 'CA', 'AU']);

function validRange(start: string, end: string): boolean {
  if (!isValidISODate(start) || !isValidISODate(end) || end < start) return false;
  const years = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
  return years < 10 || (years === 10 && end.slice(5) <= start.slice(5));
}

/** A Saturday January 1 is normalized by the existing loader to the preceding
 * Friday. Fetch its nominal year when that observed Friday is the requested end date.
 * Other ranges keep their original lookup years, avoiding unrelated data failures. */
export function consumerHolidayLookupEnd(country: string, rangeStart: string, rangeEnd: string): string {
  if (!COUNTRY_CODES.has(country) || !validRange(rangeStart, rangeEnd)
    || !OBSERVED_FIX_COUNTRIES.has(country) || !rangeEnd.endsWith('-12-31')) return rangeEnd;
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

export async function getConsumerHolidaysWithStatus(
  country: string, rangeStart: string, rangeEnd: string, subdivision?: string,
): Promise<HolidayFetchResult> {
  if (!validScope(country, rangeStart, rangeEnd, subdivision)) return { holidays: [], degraded: true };
  try {
    const result = await getHolidaysWithStatus(country, rangeStart, consumerHolidayLookupEnd(country, rangeStart, rangeEnd), subdivision);
    if (typeof result.degraded !== 'boolean') throw new Error('Holiday status is invalid.');
    return { holidays: observedEntries(result.holidays, country, rangeStart, rangeEnd), degraded: result.degraded };
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
