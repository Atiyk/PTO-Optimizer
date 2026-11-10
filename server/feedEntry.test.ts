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
