import { mondayIndexedDow, rangeISO } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';

/**
 * Event scheduling (pure): which dates in a window clash least with people's leave, non-working
 * days and holidays. Ranked by the fewest people out, then the earliest date.
 */

export interface EventAttendee {
  id: string;
  /** 7 chars, Monday first: '1111100' = Mon–Fri. */
  workWeek: string;
  /** Approved or pending leave dates (full or part day). */
  outDates: ISODate[];
  holidays: ISODate[];
}

export interface DateOption {
  date: ISODate;
  available: number;
  out: number;
  /** Why people are out, by reason. */
  reasons: { leave: number; notWorking: number; holiday: number };
  /** IDs of people who can't make it. */
  outIds: string[];
}

export function attendeeStatus(a: EventAttendee, date: ISODate): 'available' | 'leave' | 'notWorking' | 'holiday' {
  if (a.outDates.includes(date)) return 'leave';
  if (a.holidays.includes(date)) return 'holiday';
  if (a.workWeek[mondayIndexedDow(date)] !== '1') return 'notWorking';
  return 'available';
}

export function dateOption(attendees: EventAttendee[], date: ISODate): DateOption {
  const reasons = { leave: 0, notWorking: 0, holiday: 0 };
  const outIds: string[] = [];
  for (const a of attendees) {
    const s = attendeeStatus(a, date);
    if (s !== 'available') {
      reasons[s] += 1;
      outIds.push(a.id);
    }
  }
  return { date, available: attendees.length - outIds.length, out: outIds.length, reasons, outIds };
}

export function suggestEventDates(
  attendees: EventAttendee[],
  from: ISODate,
  to: ISODate,
  opts: { includeWeekends?: boolean; limit?: number } = {},
): DateOption[] {
  if (to < from) return [];
  const days = rangeISO(from, to).slice(0, 366);
  return days
    .filter((d) => opts.includeWeekends || mondayIndexedDow(d) < 5)
    .map((d) => dateOption(attendees, d))
    .sort((a, b) => a.out - b.out || (a.date < b.date ? -1 : 1))
    .slice(0, opts.limit ?? 5);
}
