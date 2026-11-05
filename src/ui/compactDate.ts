import { formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { isValidISODate } from './urlState';

/** "Feb 4, 2027" for display on /policy and /sabbatical; anything that is not a valid ISO
 * date (a half-typed input) is shown as given rather than as "NaN". */
export function compactDate(iso: string): string {
  return isValidISODate(iso) ? formatShortWithYear(iso) : iso;
}

/** Every ISO date inside a sentence (alert text from the policy engine) in compact form. */
export function compactDatesIn(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (iso) => compactDate(iso));
}
