import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { formatShort, formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { requestByDate, isQuietWindow } from '@daysoff/engine/calendar/requestDeadline';

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

/**
 * Phase 4.3: rewrote the draft to lead with COVERAGE - the span and total time away a
 * manager actually needs to plan around - rather than Phase 3's "lead with the raw PTO-day
 * list" ordering. The granular day-by-day list is still here, just second, because an HR
 * system still needs the exact days; what changed is which fact the recipient reads first.
 */
function coverageSentence(brk: Break, ptoCount: number): string {
  const dayWord = ptoCount === 1 ? 'day' : 'days';
  const totalWord = brk.totalDaysOff === 1 ? 'day' : 'days';
  return `I'd like to request time off covering ${formatCardDateRange(brk.start, brk.end)} — ${brk.totalDaysOff} ${totalWord} away from work in total, using ${ptoCount} PTO ${dayWord}.`;
}

function specificsSentence(dates: string[], freeDays: number): string {
  const list = dates.map(formatWeekdayDate).join(', ');
  if (freeDays > 0) {
    return `The PTO days needed are ${list}, with the rest covered by the surrounding weekend${freeDays === 1 ? '' : 's'}/holiday${freeDays === 1 ? '' : 's'}.`;
  }
  return `All of this comes from my PTO balance: ${list}.`;
}

/** Phase 4.3: "mentioning low-demand windows when true" - told plainly, not hedged, since
 * it's a genuine point in the requester's favour (less likely to collide with a colleague's
 * request) and the recipient has no other way to know this without checking themselves. */
function quietWindowSentence(): string {
  return `This falls in a quieter period for time-off requests, so it shouldn't conflict with coverage.`;
}

const CLOSING_SENTENCE = `Let me know if this works, or if you'd like me to adjust the dates.`;

/** The short manager email draft: exactly three sentences - coverage, specifics, and a
 * close (the quiet-window line taking the close's place when it's genuinely true, so the
 * sentence count never grows past three). */
export function formatManagerEmailShort(brk: Break, isPtoDay: (iso: string) => boolean): string {
  const dates = ptoDatesOf(brk, isPtoDay);
  const freeDays = Math.max(0, brk.totalDaysOff - dates.length);
  const sentence1 = coverageSentence(brk, dates.length);
  const sentence2 = specificsSentence(dates, freeDays);
  const sentence3 = isQuietWindow(brk) ? quietWindowSentence() : CLOSING_SENTENCE;
  return `${sentence1} ${sentence2} ${sentence3}`;
}

/** The detailed manager email draft: the same coverage/specifics opening as the short
 * variant, plus the request-by deadline (the exact same noticePeriodDays-driven date shown
 * on the break card and used by the .ics reminder - see requestDeadline.ts - so the email
 * can never state a different deadline than the rest of the app), the quiet-window mention
 * when true, and the closing line. */
export function formatManagerEmailDetailed(
  brk: Break,
  isPtoDay: (iso: string) => boolean,
  noticePeriodDays: number,
  workWeek: WorkWeek,
): string {
  const dates = ptoDatesOf(brk, isPtoDay);
  const freeDays = Math.max(0, brk.totalDaysOff - dates.length);
  const sentence1 = coverageSentence(brk, dates.length);
  const sentence2 = specificsSentence(dates, freeDays);
  const deadline = requestByDate(brk.start, noticePeriodDays, workWeek);
  const sentence3 = `I'd like to confirm this by ${formatShort(deadline)} to stay within our ${noticePeriodDays}-day notice period.`;

  const sentences = [sentence1, sentence2, sentence3];
  if (isQuietWindow(brk)) sentences.push(quietWindowSentence());
  sentences.push(CLOSING_SENTENCE);
  return sentences.join(' ');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
