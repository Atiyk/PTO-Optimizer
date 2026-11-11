import type { ISODate, WorkWeek } from '@daysoff/engine/solver/types';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { formatLong } from '@daysoff/engine/calendar/dateFormat';
import { requestByDate, weekdayName } from '@daysoff/engine/calendar/requestDeadline';
import { searchWorkday } from '@daysoff/engine/calendar/workdaySearch';
import type { PtoRequest, RequestCalendar } from './requestLedger';

/**
 * F4 follow-ups once a request is approved: the return date, a copyable out-of-office
 * message, and the submit-by date shown on planned requests. Pure and deterministic.
 */

/**
 * The tracker has no notice-period input of its own. /pto passes the planner's
 * `noticePeriodDays` (the same number behind "Request by" on break cards and the .ics
 * reminder); /policy has no notice-period setting, so it uses this default.
 */
export const DEFAULT_NOTICE_PERIOD_DAYS = 14;

/**
 * The first working day after `end`: on the request calendar's work week and not one of its
 * off days (employer holidays, alternating Fridays). Past the calendar's loaded range only
 * the work week is known, so holidays there cannot be skipped. Null when the schedule has no
 * working day within MAX_WORKDAY_SEARCH_DAYS (for example a work week with every day off):
 * callers say the return date is unknown rather than show a day the person is still off.
 */
export function returnToWorkDate(end: ISODate, calendar: Pick<RequestCalendar, 'workWeek' | 'offDays'>): ISODate | null {
  if (!calendar.workWeek.some(Boolean)) return null;
  const off = new Set(calendar.offDays);
  return searchWorkday(addDays(end, 1), 1, (date) => calendar.workWeek[mondayIndexedDow(date)] && !off.has(date));
}

/** "Monday, December 22, 2026" - spelled out, because the reader may use another date order. */
export function formatOooDate(iso: ISODate): string {
  return `${weekdayName(iso)}, ${formatLong(iso)}`;
}

export interface OutOfOfficeOptions {
  /** Who to contact while away. Left as an editable placeholder when blank. */
  contactName?: string;
  contactDetail?: string;
  /** Sign-off. Left as an editable placeholder when blank. */
  yourName?: string;
}

export const OOO_PLACEHOLDERS = {
  contactName: '[colleague’s name]',
  contactDetail: '[email or phone]',
  yourName: '[your name]',
} as const;

/** A plain-text auto-reply for the request's range; placeholders in [brackets] are for the user to edit. */
export function outOfOfficeMessage(
  request: Pick<PtoRequest, 'start' | 'end'>,
  calendar: Pick<RequestCalendar, 'workWeek' | 'offDays'>,
  options: OutOfOfficeOptions = {},
): string {
  const back = returnToWorkDate(request.end, calendar);
  const away = request.start === request.end
    ? `I'm out of the office on ${formatOooDate(request.start)}`
    : `I'm out of the office from ${formatOooDate(request.start)} through ${formatOooDate(request.end)}`;
  const contactName = options.contactName?.trim() || OOO_PLACEHOLDERS.contactName;
  const contactDetail = options.contactDetail?.trim() || OOO_PLACEHOLDERS.contactDetail;
  const yourName = options.yourName?.trim() || OOO_PLACEHOLDERS.yourName;
  return [
    'Hello,',
    '',
    `Thanks for your message. ${away}, with limited access to email. ${back ? `I'll be back on ${formatOooDate(back)} and will reply then.` : "I'll reply when I'm back."}`,
    '',
    `For anything urgent, please contact ${contactName} at ${contactDetail}.`,
    '',
    'Best,',
    yourName,
  ].join('\n');
}

/**
 * The date to submit a planned request by: its start minus the notice period, moved back
 * to a working day. Uses the engine's requestByDate, so it always agrees with the "Request
 * by" date on break cards and the .ics reminder for the same notice period.
 */
export function submitByDate(start: ISODate, noticePeriodDays: number, workWeek: WorkWeek, offDays: readonly ISODate[] = []): ISODate | null {
  const days = Number.isFinite(noticePeriodDays) && noticePeriodDays >= 0 ? Math.floor(noticePeriodDays) : DEFAULT_NOTICE_PERIOD_DAYS;
  return requestByDate(start, days, workWeek, offDays);
}
