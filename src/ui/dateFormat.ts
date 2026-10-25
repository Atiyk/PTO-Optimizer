import { parseISO } from '../solver/dateUtils';

// Human-readable display formatting for YYYY-MM-DD strings, built from the parsed y/m/d
// integers directly - never `new Date(iso).toLocaleDateString()`, which parses a date-only
// string as UTC midnight and then renders it in the VIEWER's local timezone, silently
// shifting the displayed day by one west of UTC. Same discipline as calendarMath.ts.

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatShort(iso: string): string {
  const { m, d } = parseISO(iso);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

export function formatLong(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${MONTH_LONG[m - 1]} ${d}, ${y}`;
}

export function formatShortWithYear(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`;
}

/** "Oct 24 - Nov 1, 2026" (same year), "Dec 28, 2026 - Jan 3, 2027" (spans years), or just
 * "Oct 24, 2026" for a single day. Always a plain ASCII hyphen, not an en dash, so the
 * string is safe to embed unescaped in formats with their own character restrictions (ICS). */
export function formatDateRange(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatShortWithYear(startIso);
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  if (start.y === end.y) {
    return `${MONTH_SHORT[start.m - 1]} ${start.d} - ${MONTH_SHORT[end.m - 1]} ${end.d}, ${end.y}`;
  }
  return `${formatShortWithYear(startIso)} - ${formatShortWithYear(endIso)}`;
}

/** "Dec 19 – 27" (same month), "Oct 24 – Nov 1" (same year, different month), or
 * "Dec 28, 2026 – Jan 3, 2027" (spans years) - for a break card header, never an ISO
 * string ("2026-12-19 -> 2026-12-27" reads as machine output, not something a person
 * wrote). No year shown unless the range actually crosses one, since every plan this tool
 * ever builds lives within a single bounded date range already shown elsewhere on the
 * page. An en dash, not the plain hyphen `formatDateRange` uses for its ICS-safe context -
 * this one is pure display, no character-set constraint to honour. */
export function formatCardDateRange(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatShort(startIso);
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  if (start.y !== end.y) return `${formatShortWithYear(startIso)} – ${formatShortWithYear(endIso)}`;
  if (start.m === end.m) return `${MONTH_SHORT[start.m - 1]} ${start.d} – ${end.d}`;
  return `${MONTH_SHORT[start.m - 1]} ${start.d} – ${MONTH_SHORT[end.m - 1]} ${end.d}`;
}
