/**
 * Server entry for the calendar feeds. scripts/build-api.mjs bundles this file into
 * api/_bundle/feed.mjs, which api/feed.ts and api/watch.ts import. Everything that isn't
 * holiday lookup lives in src/autopilot so it is unit tested with the app.
 */
import { rawHolidaysToHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import { handleFeedRequest, type HolidayReader } from '../src/autopilot/feedHandler';
import { buildWatchFeedICS, watchFeedHolidayYears } from '../src/autopilot/watchFeed';
import { loadHolidayFile } from './holidayData';
import { utcDateISO } from '../src/ui/today';

const COUNTRY = /^[A-Z]{2}$/;

/** Looks up the committed public/holidays/<CC>-<YEAR>.json file. The country and year are
 * shape-checked here as well, so no request can make it read any other path. */
export const readHolidaysFromDisk: HolidayReader = async (country, year) => {
  if (!COUNTRY.test(country) || !Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return loadHolidayFile(`${country}-${year}.json`);
};

function text(status: number, message: string): Response {
  return new Response(`${message}\n`, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

export function handleFeed(request: Request): Promise<Response> {
  return handleFeedRequest(request, readHolidaysFromDisk);
}

/** GET /api/watch?<policy link query>: expiry reminders and rescue days for that policy. */
export async function handleWatch(request: Request, now: Date = new Date()): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Method not allowed.');
  const url = new URL(request.url);
  const query = url.search.replace(/^\?/, '');
  // No viewer timezone reaches this endpoint: UTC calendar date, documented in today.ts.
  const today = utcDateISO(now);
  const country = url.searchParams.get('c') ?? '';
  const loaded = new Map<string, Holiday[]>();
  if (COUNTRY.test(country) && query.length <= 4096) {
    await Promise.all(watchFeedHolidayYears(today).map(async (year) => {
      const raw = await readHolidaysFromDisk(country, year);
      if (Array.isArray(raw)) loaded.set(`${country}-${year}`, rawHolidaysToHolidays(raw));
    }));
  }
  const result = buildWatchFeedICS(query, today, (c, year) => loaded.get(`${c}-${year}`) ?? null);
  if (!result.ok) return text(result.status, result.message);
  return new Response(request.method === 'HEAD' ? null : result.ics, {
    status: 200,
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, no-store', 'content-disposition': 'inline; filename="gapless-pto-expiry-watch.ics"', 'x-content-type-options': 'nosniff' },
  });
}
