/**
 * Date wording for the guide pages. Plain string building, no Intl: the prerender (Node)
 * and the browser must print byte-identical text or hydration would mismatch.
 */
import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { WEEKDAYS } from './guidePlan';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

export type DateStyle = 'US' | 'GB';

function parts(iso: string) {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1, day: Number(iso.slice(8, 10)), weekday: WEEKDAYS[mondayIndexedDow(iso)] };
}

/** "Fri, Feb 12" (US) or "Fri 12 Feb" (GB). */
export function formatDay(iso: string, style: DateStyle, withYear = false): string {
  const { year, month, day, weekday } = parts(iso);
  const base = style === 'GB' ? `${weekday} ${day} ${MONTHS[month]}` : `${weekday}, ${MONTHS[month]} ${day}`;
  return withYear ? `${base}${style === 'GB' ? '' : ','} ${year}` : base;
}

/** "Fri, Feb 12 – Mon, Feb 15"; a one-day range is just the day. */
export function formatRange(start: string, end: string, style: DateStyle): string {
  if (start === end) return formatDay(start, style);
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  return `${formatDay(start, style, crossesYear)} – ${formatDay(end, style, crossesYear)}`;
}

/** "November 22, 2026" / "22 November 2026", for "Last checked". */
export function formatLongDate(iso: string, style: DateStyle): string {
  const { year, month, day } = parts(iso);
  return style === 'GB' ? `${day} ${MONTHS_LONG[month]} ${year}` : `${MONTHS_LONG[month]} ${day}, ${year}`;
}

/** "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
