import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FEED_CACHE_CONTROL, handleFeedRequest, type HolidayReader } from './feedHandler';

const HOLIDAY_DIR = resolve(__dirname, '../../public/holidays');
const reader: HolidayReader = async (country, year) => {
  const file = resolve(HOLIDAY_DIR, `${country}-${year}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};
const NOW = new Date('2026-11-04T15:30:00Z');
const URL_OK = 'https://example.test/api/feed?c=US&s=2026-11-04&e=2027-12-31&b=20&rv=0';

describe('handleFeedRequest', () => {
  it('200 text/calendar with CDN cache headers', async () => {
    const res = await handleFeedRequest(new Request(URL_OK), reader, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe(FEED_CACHE_CONTROL);
    expect(FEED_CACHE_CONTROL).toBe('public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
    const body = await res.text();
    expect(body.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(body).toContain('DTSTAMP:20261104T000000Z'); // today in UTC, not the request time
    expect(body).toContain('Thanksgiving Day');
  });

  it('reads only the country-years the plan needs', async () => {
    const spy = vi.fn(reader);
    await handleFeedRequest(new Request(URL_OK), spy, NOW);
    expect(spy.mock.calls.map(([c, y]) => `${c}-${y}`).sort()).toEqual(['US-2026', 'US-2027', 'US-2028']); // 2028: Jan 1 2028 is observed Dec 31 2027
  });

  it('a failing reader degrades to no holidays, not a 500', async () => {
    const res = await handleFeedRequest(new Request(URL_OK), async () => { throw new Error('disk'); }, NOW);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('Thanksgiving');
  });

  it('400 plain text for an invalid range', async () => {
    const res = await handleFeedRequest(new Request('https://example.test/api/feed?s=2027-01-01&e=2039-01-01'), reader, NOW);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('400 for a query over 4096 characters, before touching holidays', async () => {
    const spy = vi.fn(reader);
    const res = await handleFeedRequest(new Request(`${URL_OK}&x=${'a'.repeat(4096)}`), spy, NOW);
    expect(res.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not echo the raw input in errors', async () => {
    const res = await handleFeedRequest(new Request('https://example.test/api/feed?s=<script>&e=2027-01-01'), reader, NOW);
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('<script>');
  });

  it('405 for POST, empty body for HEAD', async () => {
    expect((await handleFeedRequest(new Request(URL_OK, { method: 'POST', body: 'x' }), reader, NOW)).status).toBe(405);
    const head = await handleFeedRequest(new Request(URL_OK, { method: 'HEAD' }), reader, NOW);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
