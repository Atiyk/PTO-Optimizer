/**
 * Issue 14: one request deadline everywhere. For the same break, notice rule, workweek and
 * employer days off, the break card line, the detailed email draft, the PTO tracker's
 * "Submit by" and the .ics "book by" reminder must name the same date.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import { requestByDate, requestByText, type NoticeUnit } from '@daysoff/engine/calendar/requestDeadline';
import { formatShort, formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { formatManagerEmailDetailed } from './requestText';
import { submitByDate } from '../personal/outOfOffice';
import { bookByEventLines, generateICS } from './icsExport';
import { createPtoRequest, writeRequestLedger, type RequestCalendar } from '../personal/requestLedger';
import { PtoTracker } from './PtoTracker';
import { useRequestLedger } from './useRequestLedger';

const MON_THU: WorkWeek = [true, true, true, true, false, false, false];
// Employer observes Mon Dec 28 and Thu Dec 31 2026 (custom employer-calendar days).
const OFF = ['2026-12-28', '2026-12-31'];
const TODAY = '2026-11-02';

const brk: Break = {
  id: '2027-01-11|2027-01-17', start: '2027-01-11', end: '2027-01-17',
  days: ['2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14', '2027-01-15', '2027-01-16', '2027-01-17'],
  totalDaysOff: 7, ptoCost: 4, multiplier: 1.75, tags: [], meanDemand: 1,
};
const isPtoDay = (iso: string) => ['2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14'].includes(iso);

const calendar: RequestCalendar = { workWeek: MON_THU, offDays: OFF, rangeStart: '2026-11-01', rangeEnd: '2027-03-31' };

function Tracker({ days, unit }: { days: number; unit: NoticeUnit }) {
  const ledger = useRequestLedger();
  return <PtoTracker ledger={ledger} calendar={calendar} today={TODAY} noticePeriodDays={days} noticeUnit={unit} />;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

const cases: Array<{ days: number; unit: NoticeUnit; expected: string; why: string }> = [
  // Jan 11 - 14 = Mon Dec 28, an employer holiday -> Sun, Sat, Fri (not in the Mon-Thu
  // week) are skipped -> Thu Dec 24.
  { days: 14, unit: 'calendar', expected: '2026-12-24', why: 'calendar notice rolls back past the employer holiday to Thu Dec 24' },
  // Working days before Jan 11: Jan 7,6,5,4 (4), Dec 31 holiday, Dec 30,29 (6), Dec 28
  // holiday, Dec 24,23 (8).
  { days: 8, unit: 'working', expected: '2026-12-23', why: 'working notice skips Fridays, weekends and employer holidays' },
];

describe('request deadline agrees across card, draft, tracker and .ics', () => {
  for (const { days, unit, expected, why } of cases) {
    it(`${days} ${unit} days -> ${expected} (${why})`, () => {
      expect(requestByDate(brk.start, days, MON_THU, OFF, unit)).toBe(expected);

      // Break card line.
      expect(requestByText(brk.start, days, MON_THU, TODAY, OFF, unit)).toContain(`Request by ${formatShort(expected)}`);

      // Detailed manager email draft.
      const draft = formatManagerEmailDetailed(brk, isPtoDay, days, MON_THU, OFF, unit);
      expect(draft).toContain(`by ${formatShort(expected)}`);
      expect(draft).toContain(unit === 'working' ? `${days}-working-day notice period` : `${days}-day notice period`);

      // Tracker helper and rendered tracker row.
      expect(submitByDate(brk.start, days, MON_THU, OFF, unit)).toBe(expected);
      writeRequestLedger([createPtoRequest({ start: brk.start, end: '2027-01-14' }, calendar, 'r1', '2026-11-01T12:00:00.000Z')!]);
      render(<Tracker days={days} unit={unit} />);
      expect(screen.getByText(`Submit by ${formatShortWithYear(expected)}`)).toBeTruthy();

      // .ics book-by reminder (download and feed share bookByEventLines).
      const lines = bookByEventLines([brk], TODAY, days, '20261102T000000Z', MON_THU, OFF, unit);
      expect(lines).toContain(`DTSTART;VALUE=DATE:${expected.replace(/-/g, '')}`);
      const ics = generateICS([brk], isPtoDay, new Date(2026, 10, 2, 12), { enabled: true, leadDays: days, workWeek: MON_THU, offDays: OFF, noticeUnit: unit });
      expect(ics).toContain(`DTSTART;VALUE=DATE:${expected.replace(/-/g, '')}`);
    });
  }
});
