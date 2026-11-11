import { describe, expect, it, vi } from 'vitest';
import { holidayFile } from './feedTestHolidays';
import { FEED_CACHE_CONTROL, handleFeedRequest, type HolidayReader } from './feedHandler';

const reader: HolidayReader = async (country, year) => holidayFile(country, year);
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

  it('declines a feed when holiday data cannot be read', async () => {
    const res = await handleFeedRequest(new Request(URL_OK), async () => { throw new Error('disk'); }, NOW);
    expect(res.status).toBe(422);
    expect(await res.text()).toContain('lack complete holiday data');
    expect(res.headers.get('cache-control')).toBe('no-store');
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

  it('400 before solving for a plan too large for one function call', async () => {
    const spy = vi.fn(reader);
    for (const q of ['c=US&s=2026-11-04&e=2036-11-03&b=400', 'c=US&s=2026-11-04&e=2027-12-31&b=81', 'c=US&s=2026-11-04&e=2029-11-03&b=50&ac=1&am=2', 'c=US&s=2026-11-04&e=2030-12-31&b=20']) {
      const started = Date.now();
      const res = await handleFeedRequest(new Request(`https://example.test/api/feed?${q}`), spy, NOW);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Download the .ics file instead');
      expect(Date.now() - started).toBeLessThan(500);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('still serves a covered three-year plan at the PTO limit', async () => {
    const res = await handleFeedRequest(new Request('https://example.test/api/feed?c=US&s=2026-01-01&e=2028-12-31&b=80'), reader, NOW);
    expect(res.status).toBe(200);
  });

  it('does not return a plan with missing or malformed holiday data', async () => {
    const future = await handleFeedRequest(new Request('https://example.test/api/feed?c=US&s=2028-11-04&e=2029-11-03&b=10'), reader, NOW);
    expect(future.status).toBe(422);
    expect(await future.text()).toContain('Choose a covered range');
    const malformed = await handleFeedRequest(new Request(URL_OK), async () => [{ date: 'invalid' }], NOW);
    expect(malformed.status).toBe(422);
  });

  it('does not put legacy schedule-specific feed responses in a shared cache', async () => {
    const res = await handleFeedRequest(new Request(`${URL_OK}&bo=2026-12-01`), reader, NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it.each(['np=21', 'ac=1&am=1.5', 'ex=1&xd=2027-03-01&cc=2', 'pc=1&pcs=2027-02-01&pce=2027-02-28&pcm=2', 'up=1', 'r=2026-12-02', 'salary=91000'])(
    'keeps any private or unclassified legacy key out of a shared cache: %s', async (extra) => {
      const res = await handleFeedRequest(new Request(`${URL_OK}&${extra}`), reader, NOW);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
    },
  );

  it('keeps the CDN cache for a current public share-format feed', async () => {
    const res = await handleFeedRequest(new Request(`${URL_OK}&sv=1&w=30&count=0`), reader, NOW);
    expect(res.headers.get('cache-control')).toBe(FEED_CACHE_CONTROL);
  });
});
