import { parseISO, rangeISO, mondayIndexedDow, isoToSerial } from '../solver/dateUtils';

/** 0 = weeks start Sunday, 1 = weeks start Monday. Display-only - independent of the solver's WorkWeek. */
export type WeekStart = 0 | 1;

export interface MonthDescriptor {
  year: number;
  month: number; // 1-12
  /** Weeks starting on `weekStart`, always padded to exactly 6 rows so every month box
   * renders at the same fixed height (a 4-week February next to a 6-week January
   * otherwise makes the whole calendar look ragged). Each cell is a real ISO date for
   * every day in the calendar month - including days outside [rangeStart, rangeEnd], for
   * the caller to render as out-of-range - or null only for the leading/trailing grid
   * padding needed to align the 1st to its weekday column and fill out to 6 rows. */
  weeks: (string | null)[][];
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Column index of `iso` within a week starting on `weekStart` (0 = first column). */
function weekdayColumn(iso: string, weekStart: WeekStart): number {
  const { y, m, d } = parseISO(iso);
  const nativeDow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday .. 6 = Saturday
  return weekStart === 0 ? nativeDow : (nativeDow + 6) % 7;
}

export function buildMonths(rangeStart: string, rangeEnd: string, weekStart: WeekStart = 1): MonthDescriptor[] {
  if (rangeEnd < rangeStart) return [];
  const { y: sy, m: sm } = parseISO(rangeStart);
  const { y: ey, m: em } = parseISO(rangeEnd);

  const months: MonthDescriptor[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const total = daysInMonth(y, m);
    const pad = String(m).padStart(2, '0');
    const firstISO = `${y}-${pad}-01`;
    const leading = weekdayColumn(firstISO, weekStart);

    const cells: (string | null)[] = new Array(leading).fill(null);
    for (let d = 1; d <= total; d++) {
      // Every real day of the month is kept as its ISO date, even outside
      // [rangeStart, rangeEnd] - the caller decides how to render an out-of-range day
      // (very muted, inert), rather than this function silently erasing it to a blank
      // cell indistinguishable from grid padding.
      cells.push(`${y}-${pad}-${String(d).padStart(2, '0')}`);
    }
    // Always pad to exactly 6 weeks (42 cells): 6 leading-padding cells is the worst case
    // (a month starting on the last column) plus up to 31 days never exceeds 42, so this
    // never needs to truncate, only pad up.
    while (cells.length < 42) cells.push(null);

    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    months.push({ year: y, month: m, weeks });

    if (m === 12) {
      m = 1;
      y += 1;
    } else {
      m += 1;
    }
  }
  return months;
}

export interface OffRun {
  start: string;
  end: string;
}

/** Groups a day range into maximal contiguous runs where `isOff` is true. */
function computeRuns(rangeStart: string, rangeEnd: string, isOff: (iso: string) => boolean): OffRun[] {
  const days = rangeISO(rangeStart, rangeEnd);
  const runs: OffRun[] = [];
  let runStart: string | null = null;
  for (let i = 0; i < days.length; i++) {
    const off = isOff(days[i]);
    if (off && runStart === null) runStart = days[i];
    const isLast = i === days.length - 1;
    if ((!off || isLast) && runStart !== null) {
      const end = off && isLast ? days[i] : days[i - 1];
      runs.push({ start: runStart, end });
      runStart = null;
    }
  }
  return runs;
}

/**
 * A qualifying run is a maximal stretch of consecutive off-days (weekend, holiday, or
 * suggested PTO) that contains AT LEAST ONE suggested-PTO day. A plain weekend or a
 * holiday-adjacent weekend with zero PTO spent is a fact about the calendar, not a
 * result of the plan, and must not render a band.
 */
export function computeQualifyingRuns(
  rangeStart: string,
  rangeEnd: string,
  isOff: (iso: string) => boolean,
  isSuggestedPto: (iso: string) => boolean,
): OffRun[] {
  const runs = computeRuns(rangeStart, rangeEnd, isOff);
  return runs.filter((run) => rangeISO(run.start, run.end).some(isSuggestedPto));
}

export interface BandSegment {
  colStart: number;
  colEnd: number;
  roundedLeft: boolean;
  roundedRight: boolean;
  /** Index of the source run within the `runs` array passed to this call - lets a caller
   * map a rendered segment back to whatever it associates with that run (e.g. a break
   * number/label), without re-deriving which run produced it. */
  runIndex: number;
}

/**
 * Splits qualifying runs (date intervals) into per-calendar-row segments for rendering.
 * Computed purely from date adjacency, then projected onto this single week's grid
 * columns - never from grid adjacency. A run crossing a week boundary yields one
 * segment per row when this is called per row; segments are never joined vertically.
 */
export function computeBandSegments(weekDates: (string | null)[], runs: OffRun[]): BandSegment[] {
  const segments: BandSegment[] = [];
  runs.forEach((run, runIndex) => {
    let colStart = -1;
    let colEnd = -1;
    for (let i = 0; i < weekDates.length; i++) {
      const d = weekDates[i];
      if (d && d >= run.start && d <= run.end) {
        if (colStart === -1) colStart = i;
        colEnd = i;
      }
    }
    if (colStart !== -1) {
      segments.push({
        colStart,
        colEnd,
        roundedLeft: weekDates[colStart] === run.start,
        roundedRight: weekDates[colEnd] === run.end,
        runIndex,
      });
    }
  });
  return segments;
}

/**
 * Phase 3 spec item 5: a 4-day week (every Friday off, every week) is already fully
 * supported by the existing weekly `workWeek` checkboxes - confirmed empirically, nothing
 * to build. A 9/80 schedule (every OTHER Friday off) is structurally different: `WorkWeek`
 * is a 7-length boolean array with no notion of week parity, so it can only express "this
 * weekday is always off" or "always working" - never "off every other occurrence".
 * Confirmed empirically: unchecking Friday in `workWeek` to approximate 9/80 makes EVERY
 * Friday free, not alternating ones, silently overstating the real schedule. Rather than
 * build a general recurrence engine for one case, this is the narrow primitive a 9/80
 * pattern actually needs: true if `iso` is a Friday on the same 14-day cadence as
 * `anchorFriday`. `anchorFriday` doesn't need to be in-range itself - only which 14-day
 * bucket it falls in matters, which is why the modulo is taken on the raw day serial, not
 * on any particular range.
 */
export function isAlternatingFridayOff(iso: string, anchorFriday: string): boolean {
  if (mondayIndexedDow(iso) !== 4) return false; // not a Friday
  const diff = isoToSerial(iso) - isoToSerial(anchorFriday);
  return ((diff % 14) + 14) % 14 === 0;
}

export function monthLabel(year: number, month: number): string {
  const names = [
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
  return `${names[month - 1]} ${year}`;
}
