/**
 * Issue 13: every user-facing "today" is the viewer's LOCAL calendar date, never the UTC one.
 * Each case pins process.env.TZ (Node re-reads it on assignment) and a fixed instant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { localDateISO, todayISO, utcDateISO } from './today';
import { useTodayISO } from './useTodayISO';
import { generateICS } from './icsExport';
import { createPtoRequest, writeRequestLedger, type RequestCalendar } from '../personal/requestLedger';
import { PtoTracker } from './PtoTracker';
import { useRequestLedger } from './useRequestLedger';

// The app tsconfig has no Node types; Node re-reads process.env.TZ whenever it is assigned.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const ORIGINAL_TZ = env.TZ;
function inZone(zone: string) { env.TZ = zone; }

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  if (ORIGINAL_TZ === undefined) delete env.TZ; else env.TZ = ORIGINAL_TZ;
});

// Instants chosen so the local and UTC calendar dates differ.
const CASES = [
  // 23:30 Dec 31 in Los Angeles (UTC-8) is already 07:30 Jan 1 UTC.
  { zone: 'America/Los_Angeles', instant: '2027-01-01T07:30:00Z', local: '2026-12-31', utc: '2027-01-01' },
  // 00:30 Jan 1 in Tokyo (UTC+9) is still 15:30 Dec 31 UTC.
  { zone: 'Asia/Tokyo', instant: '2026-12-31T15:30:00Z', local: '2027-01-01', utc: '2026-12-31' },
  // 00:30 Jan 1 on Kiritimati (UTC+14) is 10:30 Dec 31 UTC.
  { zone: 'Pacific/Kiritimati', instant: '2026-12-31T10:30:00Z', local: '2027-01-01', utc: '2026-12-31' },
  // DST: US spring-forward night (Mar 14 2027, 02:00 -> 03:00 PDT); 23:30 PDT is 06:30 UTC next day.
  { zone: 'America/Los_Angeles', instant: '2027-03-15T06:30:00Z', local: '2027-03-14', utc: '2027-03-15' },
  // DST: US fall-back day (Nov 7 2027); 23:30 PST is 07:30 UTC next day.
  { zone: 'America/New_York', instant: '2027-11-08T04:30:00Z', local: '2027-11-07', utc: '2027-11-08' },
  // DST: Europe spring-forward (Mar 28 2027) - 00:30 local CET is still Mar 27 23:30 UTC.
  { zone: 'Europe/Berlin', instant: '2027-03-27T23:30:00Z', local: '2027-03-28', utc: '2027-03-27' },
];

describe('localDateISO / todayISO use the local calendar date', () => {
  for (const c of CASES) {
    it(`${c.zone} at ${c.instant} is ${c.local} locally (${c.utc} UTC)`, () => {
      inZone(c.zone);
      expect(localDateISO(new Date(c.instant))).toBe(c.local);
      vi.useFakeTimers();
      vi.setSystemTime(new Date(c.instant));
      expect(todayISO()).toBe(c.local);
      // Server code has no viewer timezone; it documents and uses UTC.
      expect(utcDateISO(new Date(c.instant))).toBe(c.utc);
    });
  }
});

describe('useTodayISO rolls over at local midnight across DST', () => {
  it('advances on the 23-hour spring-forward day in Los Angeles', () => {
    inZone('America/Los_Angeles');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-03-14T07:59:00Z')); // 23:59 PST Mar 13
    const { result, unmount } = renderHook(() => useTodayISO());
    expect(result.current).toBe('2027-03-13');
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe('2027-03-14');
    // Next local midnight is 23 real hours later (clocks skip 02:00-03:00).
    act(() => vi.advanceTimersByTime(23 * 3600_000 - 1000));
    expect(result.current).toBe('2027-03-14');
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe('2027-03-15');
    unmount();
  });

  it('advances on the 25-hour fall-back day in New York', () => {
    inZone('America/New_York');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-11-07T04:00:00Z')); // 00:00 EDT Nov 7
    const { result, unmount } = renderHook(() => useTodayISO());
    expect(result.current).toBe('2027-11-07');
    act(() => vi.advanceTimersByTime(24 * 3600_000));
    expect(result.current).toBe('2027-11-07'); // 23:00 EST, still Nov 7
    act(() => vi.advanceTimersByTime(3600_000));
    expect(result.current).toBe('2027-11-08');
    unmount();
  });
});

describe('ICS book-by reminders clamp to the local today', () => {
  it('Los Angeles late on Dec 31 does not treat Jan 1 UTC as today', () => {
    inZone('America/Los_Angeles');
    const brk = { id: 'b', start: '2027-01-08', end: '2027-01-10', days: ['2027-01-08', '2027-01-09', '2027-01-10'], totalDaysOff: 3, ptoCost: 1, multiplier: 3, tags: [], meanDemand: 1 };
    const ics = generateICS([brk], () => false, new Date('2027-01-01T07:30:00Z'), { enabled: true, leadDays: 14, workWeek: DEFAULT_WORK_WEEK });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
  });
});

describe('PTO tracker "Updated" date is the local date of the stored timestamp', () => {
  const calendar: RequestCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [], rangeStart: '2027-01-01', rangeEnd: '2027-03-31' };
  function Tracker() {
    const ledger = useRequestLedger();
    return <PtoTracker ledger={ledger} calendar={calendar} today="2026-12-31" />;
  }

  it('an edit at 23:30 Dec 31 in Los Angeles reads "Updated Dec 31, 2026"', () => {
    inZone('America/Los_Angeles');
    writeRequestLedger([createPtoRequest({ start: '2027-02-01', end: '2027-02-02' }, calendar, 'r1', '2027-01-01T07:30:00.000Z')!]);
    render(<Tracker />);
    expect(screen.getByText('Updated Dec 31, 2026')).toBeTruthy();
  });

  it('an edit at 00:30 Jan 1 in Tokyo reads "Updated Jan 1, 2027"', () => {
    inZone('Asia/Tokyo');
    writeRequestLedger([createPtoRequest({ start: '2027-02-01', end: '2027-02-02' }, calendar, 'r1', '2026-12-31T15:30:00.000Z')!]);
    render(<Tracker />);
    expect(screen.getByText('Updated Jan 1, 2027')).toBeTruthy();
  });
});
