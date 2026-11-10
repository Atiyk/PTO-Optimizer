/**
 * Request handling for GET /api/feed (F1). No fs here: the server entry passes a reader
 * for the committed public/holidays/<CC>-<YEAR>.json files, so this stays testable and
 * free of Node APIs.
 */
import { buildPlanFeedICS, MAX_FEED_QUERY_LENGTH } from './feed';
import { holidayYearsNeeded, planStateFromSearch } from './planFromSearch';
import { isValidISODate } from '../ui/urlState';

/** Resolves to the parsed JSON for that country-year (the raw Nager-shaped array), or null
 * when there is no such file. Only called with a known country code and a year inside
 * the plan's own (bounded) range. */
export type HolidayReader = (country: string, year: number) => Promise<unknown | null>;

/** Feed work bounds. The browser solver happily runs long plans, but a public function
 * must not: a 400-day budget over ten years ran out of memory in one request,
 * and cost grows with the total days to place. Plans past
 * these bounds still work in the app and as a downloaded .ics. */
export const MAX_FEED_RANGE_DAYS = 3 * 366;
/** Total PTO (balance plus accrual) a feed may plan. Solver cost grows with the total,
 * not per year: 80 days peaked near 1.8 s and 420 MB; 180 ran out of memory. */
export const MAX_FEED_PTO_DAYS = 80;

const DAY_MS = 86_400_000;

/** True when the plan is small enough to solve inside one function call. */
export function feedWorkloadAllowed(state: { rangeStart: string; rangeEnd: string; budget: number; accrualEnabled?: boolean; accrualPerMonth?: number }): boolean {
  const days = (Date.parse(`${state.rangeEnd}T00:00:00Z`) - Date.parse(`${state.rangeStart}T00:00:00Z`)) / DAY_MS + 1;
  if (!Number.isFinite(days) || days < 1 || days > MAX_FEED_RANGE_DAYS) return false;
  const months = days / 30.4375;
  const accrued = state.accrualEnabled && Number.isFinite(state.accrualPerMonth) ? Math.max(0, state.accrualPerMonth ?? 0) * months : 0;
  const total = (Number.isFinite(state.budget) ? Math.max(0, state.budget) : Infinity) + accrued;
  return total <= MAX_FEED_PTO_DAYS;
}

export const FEED_CACHE_CONTROL = 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400';

function utcToday(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function textResponse(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  });
}

function validHolidaySnapshot(data: unknown, country: string): data is unknown[] {
  return Array.isArray(data) && data.every((holiday: unknown) => {
    if (!holiday || typeof holiday !== 'object') return false;
    const { date, name, countryCode, counties } = holiday as Record<string, unknown>;
    return typeof date === 'string' && isValidISODate(date)
      && typeof name === 'string' && name.trim() !== ''
      && countryCode === country
      && (counties === null || (Array.isArray(counties) && counties.every((region: unknown) => typeof region === 'string')));
  });
}

export async function handleFeedRequest(request: Request, readHolidays: HolidayReader, now: Date = new Date()): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return textResponse(405, 'Method not allowed.', { allow: 'GET, HEAD' });
  }
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return textResponse(400, 'Bad request.');
  }
  const query = url.search.startsWith('?') ? url.search.slice(1) : url.search;
  if (query.length > MAX_FEED_QUERY_LENGTH) {
    return textResponse(400, 'This plan link is too long for a calendar feed. Download the .ics file instead.');
  }
  const today = utcToday(now);

  // Load the country-years this plan needs before solving. A missing snapshot is not
  // equivalent to a valid snapshot containing no holidays.
  const state = planStateFromSearch(query, today);
  const loaded = new Map<string, unknown>();
  if (isValidISODate(state.rangeStart) && isValidISODate(state.rangeEnd) && !feedWorkloadAllowed(state)) {
    return textResponse(400, 'This plan is too large for a calendar feed. Download the .ics file instead.');
  }
  const explicitHolidayCoverage = 'sharedObservedHolidays' in state && Array.isArray(state.sharedObservedHolidays);
  if (isValidISODate(state.rangeStart) && isValidISODate(state.rangeEnd) && !explicitHolidayCoverage) {
    const years = holidayYearsNeeded(state.country, state.rangeStart, state.rangeEnd);
    await Promise.all(years.map(async (year) => {
      try {
        loaded.set(`${state.country}-${year}`, await readHolidays(state.country, year));
      } catch {
        loaded.set(`${state.country}-${year}`, null);
      }
    }));
    if (years.length === 0 || years.some((year) => !validHolidaySnapshot(loaded.get(`${state.country}-${year}`), state.country))) {
      return textResponse(422, 'This country and date range lack complete holiday data for a calendar feed. Choose a covered range, or download an .ics file after checking the holidays in the planner.');
    }
  }

  const result = buildPlanFeedICS(query, today, (country, year) => loaded.get(`${country}-${year}`) ?? null);
  if (!result.ok) return textResponse(result.status, result.message);

  const privateSchedule = explicitHolidayCoverage || ['eh', 'bo', 'od', 'ov'].some((key) => url.searchParams.has(key));
  return new Response(request.method === 'HEAD' ? null : result.ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': privateSchedule ? 'private, no-store' : FEED_CACHE_CONTROL,
      'content-disposition': 'inline; filename="gapless-pto-plan.ics"',
      'x-content-type-options': 'nosniff',
    },
  });
}
