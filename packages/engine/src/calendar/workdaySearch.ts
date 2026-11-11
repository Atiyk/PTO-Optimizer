import { addDays } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';

/**
 * The longest any working-day search walks: two years of calendar days. A schedule is
 * user-controlled (checkboxes, shared links, saved profiles, team member records), and one
 * with no working day, or with every working day also a day off for years, has no answer.
 * Past this horizon the search reports "none found" instead of walking forever and freezing
 * the page. No real schedule goes two years without a working day.
 */
export const MAX_WORKDAY_SEARCH_DAYS = 366 * 2;

/**
 * The first day, from `start` itself and stepping `direction` days at a time, for which
 * `isWorkday` is true. Checks at most MAX_WORKDAY_SEARCH_DAYS days, then returns null:
 * callers must handle null as "no working day for this schedule".
 */
export function searchWorkday(start: ISODate, direction: 1 | -1, isWorkday: (date: ISODate) => boolean): ISODate | null {
  let date = start;
  for (let i = 0; i < MAX_WORKDAY_SEARCH_DAYS; i++) {
    if (isWorkday(date)) return date;
    date = addDays(date, direction);
  }
  return null;
}
