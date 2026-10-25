import type { Break } from '../solver/types';
import { mondayIndexedDow } from '../solver/dateUtils';
import { formatShort, formatCardDateRange } from './dateFormat';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ptoDatesOf(brk: Break, isPtoDay: (iso: string) => boolean): string[] {
  return brk.days.filter(isPtoDay).slice().sort();
}

/** "Mon Dec 21" - a manager approves working days, not calendar spans, so every date in the
 * request list carries its weekday: the recipient shouldn't have to look up a calendar to
 * tell what day of the week "Dec 21" falls on before approving it. */
function formatWeekdayDate(iso: string): string {
  return `${WEEKDAY_SHORT[mondayIndexedDow(iso)]} ${formatShort(iso)}`;
}

/**
 * BUG FOUND (Phase 3 spec): this used to lead with the collapsed calendar span ("Dec 21–24,
 * 2026 — 4 working days") and bury the actual day count/weekday detail second. A manager
 * approves specific working days, not a calendar span - the old format made the recipient do
 * arithmetic (which of those calendar days are actually workdays vs. already-off?) before
 * they could even see what was being asked for. Now leads with the count, then enumerates
 * every PTO-cost working day individually with its weekday, exactly as it would need to be
 * typed into an HR system - "4 working days: Mon Dec 21, Tue Dec 22, Wed Dec 23, Thu Dec 24".
 * Deliberately lists the PTO-cost days themselves (not the break's full span) - an HR system
 * wants the days actually being deducted from the balance, not the weekends/holidays around
 * them; the full calendar span (including those free days) stays available separately via
 * the break card's own header, not repeated here.
 */
export function formatWorkingDaysList(brk: Break, isPtoDay: (iso: string) => boolean): string {
  const dates = ptoDatesOf(brk, isPtoDay);
  if (dates.length === 0) return 'No working days in this break.';
  const dayWord = dates.length === 1 ? 'working day' : 'working days';
  const list = dates.map(formatWeekdayDate).join(', ');
  return `${dates.length} ${dayWord}: ${list}`;
}

/** A three-sentence manager email draft: the request itself (working days first, calendar
 * span second), the payoff (total days off gained from the surrounding weekend/holiday),
 * and a closing invitation to adjust. */
export function formatManagerEmail(brk: Break, isPtoDay: (iso: string) => boolean): string {
  const dates = ptoDatesOf(brk, isPtoDay);
  const dayWord = dates.length === 1 ? 'working day' : 'working days';
  const freeDays = Math.max(0, brk.totalDaysOff - dates.length);
  const totalWord = brk.totalDaysOff === 1 ? 'day' : 'days';

  const list = dates.map(formatWeekdayDate).join(', ');
  const sentence1 = `I'd like to request ${dates.length} ${dayWord} of PTO: ${list} (calendar span ${formatCardDateRange(brk.start, brk.end)}).`;
  const sentence2 =
    freeDays > 0
      ? `With the surrounding weekend${freeDays === 1 ? '' : 's'}/holiday${freeDays === 1 ? '' : 's'}, this gives me ${brk.totalDaysOff} ${totalWord} off in total.`
      : `This uses ${dates.length} ${dayWord} from my PTO balance.`;
  const sentence3 = `Let me know if this works, or if you'd like me to adjust the dates.`;

  return `${sentence1} ${sentence2} ${sentence3}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
