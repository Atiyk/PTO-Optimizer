import { describe, it, expect } from 'vitest';
import { generateICS } from './icsExport';
import type { Break } from '../solver/types';

function makeBreak(overrides: Partial<Break> = {}): Break {
  return {
    id: '2026-10-24|2026-11-01',
    start: '2026-10-24',
    end: '2026-11-01',
    days: ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'],
    totalDaysOff: 9,
    ptoCost: 5,
    multiplier: 1.8,
    tags: [],
    meanDemand: 1.0,
    ...overrides,
  };
}

const FIXED_NOW = new Date('2026-10-18T12:00:00Z');

describe('generateICS', () => {
  it('wraps content in a single VCALENDAR with the required calendar properties', () => {
    const ics = generateICS([], () => false, FIXED_NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('PRODID:');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('creates one all-day VEVENT per suggested-PTO day, not per calendar day in the break', () => {
    const ptoDays = new Set(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    const ics = generateICS([makeBreak()], (iso) => ptoDays.has(iso), FIXED_NOW);
    const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(eventCount).toBe(5); // only the 5 PTO-cost days, not the weekend days in the break
  });

  it('uses DTSTART/DTEND as an exclusive all-day pair one day apart', () => {
    const ics = generateICS([makeBreak()], (iso) => iso === '2026-10-26', FIXED_NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261026');
    expect(ics).toContain('DTEND;VALUE=DATE:20261027');
  });

  it('titles every event "PTO" plus the break\'s overall date range', () => {
    const ics = generateICS([makeBreak()], (iso) => iso === '2026-10-26', FIXED_NOW);
    expect(ics).toContain('SUMMARY:PTO (Oct 24 - Nov 1\\, 2026)'); // comma is escaped per RFC 5545
  });

  it('every event gets a unique UID and a DTSTAMP', () => {
    const ptoDays = new Set(['2026-10-26', '2026-10-27']);
    const ics = generateICS([makeBreak()], (iso) => ptoDays.has(iso), FIXED_NOW);
    const uids = [...ics.matchAll(/UID:([^\r\n]+)/g)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(uids.length); // all unique
    expect(ics).toContain('DTSTAMP:20261018T120000Z');
  });

  it('a December-to-January break spanning a year boundary produces a correctly dated event and title', () => {
    const brk = makeBreak({
      start: '2026-12-28',
      end: '2027-01-03',
      days: ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'],
    });
    const ics = generateICS([brk], (iso) => iso === '2026-12-30', FIXED_NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261230');
    expect(ics).toContain('DTEND;VALUE=DATE:20261231');
    expect(ics).toContain('Dec 28\\, 2026 - Jan 3\\, 2027');
  });

  it('produces an empty-but-valid calendar when there is nothing to export', () => {
    const ics = generateICS([], () => false, FIXED_NOW);
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('every line is CRLF-terminated, per RFC 5545', () => {
    const ics = generateICS([makeBreak()], (iso) => iso === '2026-10-26', FIXED_NOW);
    expect(ics.includes('\n') && !ics.includes('\r\n')).toBe(false);
    // no bare LF without a preceding CR
    expect(/(?<!\r)\n/.test(ics)).toBe(false);
  });
});
