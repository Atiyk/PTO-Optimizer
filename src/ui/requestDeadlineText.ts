import type { WorkWeek } from '@daysoff/engine/solver/types';
import { isoToSerial, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { formatShort } from '@daysoff/engine/calendar/dateFormat';
import { noticePhrase, requestByDate, type NoticeUnit } from '@daysoff/engine/calendar/requestDeadline';
import type { LedgerAction } from '../integration/browserWalletStore';

/** Records something in My PTO; settles with whether it worked and what to say. */
export type RequestAction = () => LedgerAction<{ ok: boolean; message: string }>;

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayDate = (iso: string) => `${WEEKDAY_SHORT[mondayIndexedDow(iso)]} ${formatShort(iso)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface RequestDeadline {
  /** 'open': there is time; 'soon': within a week; 'now': the notice window has started. */
  tone: 'open' | 'soon' | 'now' | 'unknown';
  /** The bold part: "Ask by Thu, Dec 31" / "Ask now". */
  lead: string;
  /** The plain part after it. */
  detail: string;
  date: string | null;
}

/**
 * The request-by date in words, from the same requestByDate the email draft, the .ics
 * reminder and the homepage use, so every surface states one deadline.
 */
export function requestDeadline(start: string, noticePeriodDays: number, workWeek: WorkWeek, today: string, offDays: readonly string[] = [], unit: NoticeUnit = 'calendar'): RequestDeadline {
  const date = requestByDate(start, noticePeriodDays, workWeek, offDays, unit);
  const notice = `${noticePhrase(noticePeriodDays, unit)} notice`;
  if (!date) return { tone: 'unknown', lead: 'Check your notice rules', detail: 'A request-by date isn’t available for these dates and work schedule.', date };
  const days = isoToSerial(date) - isoToSerial(today);
  if (days < 0) return { tone: 'now', lead: 'Ask now', detail: `the ${notice} window opened ${weekdayDate(date)}.`, date };
  if (days === 0) return { tone: 'now', lead: 'Ask today', detail: `today is the last day for ${notice}.`, date };
  return {
    tone: days <= 7 ? 'soon' : 'open',
    lead: `Ask by ${weekdayDate(date)}`,
    detail: `${plural(days, 'day')} from today, for ${notice}.`,
    date,
  };
}
