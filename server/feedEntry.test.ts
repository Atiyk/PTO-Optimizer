// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { handleFeed, handleWatch, readHolidaysFromDisk } from './feedEntry';

const NOW = new Date('2026-11-04T12:00:00Z');
const POLICY = 'ak=fl&am=0&gd=2026-01-01&cc=5&cb=8&bao=2026-10-01&c=US';

describe('server feed entry', () => {
  it('reads committed holiday files and refuses anything that is not a country-year', async () => {
    expect(Array.isArray(await readHolidaysFromDisk('US', 2026))).toBe(true);
    expect(await readHolidaysFromDisk('../etc', 2026)).toBeNull();
    expect(await readHolidaysFromDisk('US', 1900)).toBeNull();
  });

  it('serves the plan feed with holidays from disk', async () => {
    const res = await handleFeed(new Request('https://x.test/api/feed?c=US&s=2026-11-04&e=2027-12-31&b=20'));
    expect(res.status).toBe(200);
    const ics = await res.text();
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).toContain('Thanksgiving');
  });

  it('serves the watch feed with rescue days and reminders', async () => {
    const res = await handleWatch(new Request(`https://x.test/api/watch?${POLICY}`), NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const ics = await res.text();
    expect(ics).toContain('SUMMARY:Suggested: use expiring PTO');
    expect(ics).toContain('BEGIN:VALARM');
  });

  it('rejects bad watch requests without echoing input', async () => {
    const bad = await handleWatch(new Request('https://x.test/api/watch?c=US&x=<script>'), NOW);
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain('<script>');
    expect((await handleWatch(new Request('https://x.test/api/watch?c=US', { method: 'POST' }), NOW)).status).toBe(405);
    expect((await handleWatch(new Request(`https://x.test/api/watch?${POLICY}&pad=${'a'.repeat(5000)}`), NOW)).status).toBe(414);
  });
});

describe('server feed entry: private format 2', () => {
  const WATCH_V2 = 'wv=2&r=f20270101-60.20261102.20261231_f20270101-7.20261225.20261231&d=f20270101.20261231.20261228.20261229&fc=2026-11-01';

  it('serves a dates-only watch feed from a shared cache, with no balance in the link or calendar', async () => {
    const res = await handleWatch(new Request(`https://x.test/api/watch?${WATCH_V2}`), NOW);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
    const ics = (await res.text()).replace(/\r\n /g, '');
    expect(ics).toContain('UID:expiration-forfeit-2027-01-01-7@pto-optimizer.app');
    expect(ics).not.toContain('UID:expiration-forfeit-2027-01-01-60@'); // its date has passed
    expect(ics).toContain('UID:rescue-forfeit-2027-01-01-20261228@pto-optimizer.app');
    expect(ics).not.toMatch(/lose \d/);
    expect((await handleWatch(new Request('https://x.test/api/watch?wv=2&r=bad'), NOW)).status).toBe(400);
  });

  it('serves a dates-only plan feed with holidays from disk and the same PTO UIDs', async () => {
    const res = await handleFeed(new Request('https://x.test/api/feed?fv=2&c=US&s=2026-11-04&e=2027-12-31&k=20261121-20261129-001110000&fc=2026-11-04'));
    expect(res.status).toBe(200);
    const ics = await res.text();
    expect(ics).toContain('Thanksgiving');
    expect(ics).toContain('UID:pto-20261123@pto-optimizer.app');
    expect(ics).toContain('UID:pto-20261125@pto-optimizer.app');
    expect(ics).not.toContain('UID:pto-20261126@');
  });
});
