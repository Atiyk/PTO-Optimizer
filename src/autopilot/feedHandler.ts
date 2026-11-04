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

  // Load only the country-years this plan needs (bounded by the app's own ten-year range
  // check, and only for a known country code), then hand a synchronous lookup to the
  // pure builder.
  const state = planStateFromSearch(query, today);
  const loaded = new Map<string, unknown>();
  if (isValidISODate(state.rangeStart) && isValidISODate(state.rangeEnd)) {
    const years = holidayYearsNeeded(state.country, state.rangeStart, state.rangeEnd);
    await Promise.all(years.map(async (year) => {
      try {
        loaded.set(`${state.country}-${year}`, await readHolidays(state.country, year));
      } catch {
        loaded.set(`${state.country}-${year}`, null);
      }
    }));
  }

  const result = buildPlanFeedICS(query, today, (country, year) => loaded.get(`${country}-${year}`) ?? null);
  if (!result.ok) return textResponse(result.status, result.message);

  return new Response(request.method === 'HEAD' ? null : result.ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'cache-control': FEED_CACHE_CONTROL,
      'content-disposition': 'inline; filename="gapless-pto-plan.ics"',
      'x-content-type-options': 'nosniff',
    },
  });
}
