import { addDays, rangeISO, mondayIndexedDow, isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { computeRuns, type OffRun } from '@daysoff/engine/calendar/calendarMath';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';
import { weekdayName } from '@daysoff/engine/calendar/requestDeadline';
import type { Holiday } from '@daysoff/engine/data/holidays';

/** A day is off if it's outside the work week or a public holiday - the same two facts the
 * /pto calendar itself is built from (see dayCategory.ts's isBaseOff/isWeekend), just
 * without a solved plan layered on top. */
export function isOffDay(iso: string, holidaySet: ReadonlySet<string>, workWeek: WorkWeek = DEFAULT_WORK_WEEK): boolean {
  return holidaySet.has(iso) || !workWeek[mondayIndexedDow(iso)];
}

export function runLength(run: OffRun): number {
  return isoToSerial(run.end) - isoToSerial(run.start) + 1;
}

/** The next day off strictly after `today` - "Your next day off is in N days." Bounded at a
 * year out so a pathological empty holiday list / all-working workWeek can't loop forever. */
export function nextDayOff(today: string, holidaySet: ReadonlySet<string>, workWeek: WorkWeek = DEFAULT_WORK_WEEK): string | undefined {
  let d = addDays(today, 1);
  for (let i = 0; i < 366; i++) {
    if (isOffDay(d, holidaySet, workWeek)) return d;
    d = addDays(d, 1);
  }
  return undefined;
}

export function daysBetween(a: string, b: string): number {
  return isoToSerial(b) - isoToSerial(a);
}

/** Count of off days strictly after `today` through `yearEnd` inclusive. */
export function daysOffRemainingThisYear(
  today: string,
  yearEnd: string,
  holidaySet: ReadonlySet<string>,
  workWeek: WorkWeek = DEFAULT_WORK_WEEK,
): number {
  if (yearEnd <= today) return 0;
  return rangeISO(addDays(today, 1), yearEnd).filter((d) => isOffDay(d, holidaySet, workWeek)).length;
}

/** The single longest run of a given kind (off, or - with `invert` - working) strictly
 * after `today` through `horizonEnd`. Reuses calendarMath's own run-grouping (computeRuns)
 * rather than a second implementation, inverted for the "dry spell" case. */
function longestRun(
  today: string,
  horizonEnd: string,
  holidaySet: ReadonlySet<string>,
  workWeek: WorkWeek,
  invert: boolean,
): OffRun | undefined {
  if (horizonEnd <= today) return undefined;
  const start = addDays(today, 1);
  const predicate = (iso: string) => {
    const off = isOffDay(iso, holidaySet, workWeek);
    return invert ? !off : off;
  };
  const runs = computeRuns(start, horizonEnd, predicate);
  if (runs.length === 0) return undefined;
  return runs.reduce((longest, r) => (runLength(r) > runLength(longest) ? r : longest));
}

export function longestStretchAhead(today: string, horizonEnd: string, holidaySet: ReadonlySet<string>, workWeek: WorkWeek = DEFAULT_WORK_WEEK): OffRun | undefined {
  return longestRun(today, horizonEnd, holidaySet, workWeek, false);
}

/**
 * Phase 5 (K4): redefined. The old version was "the longest run of consecutive WORKING
 * days" - under that definition a weekend ends every run, so the result could never
 * exceed about 5 days and the landing page's 8-day shaded-dry-spell threshold could never
 * actually render. A "dry spell" is really the stretch between two consecutive BREAKS,
 * where a break is a public holiday that falls on a day that would otherwise be a working
 * day (one landing on a weekend doesn't create a new day off, so it doesn't count as a
 * break here) - weekends inside that stretch don't end it, they're just ordinary weekends
 * within a long dry run. `today` and the day after `horizonEnd` act as the two outer
 * boundaries, so "the dry spell you're currently in" and "the one right before the
 * horizon" are both found too, not just stretches strictly between two real holidays.
 * Real US 2027 values run up to roughly 15 weeks (mid-Feb to late May) under this
 * definition - genuinely that long, not a bug to be tuned away.
 */
/**
 * Every dry spell (see `longestDrySpell`'s own comment for the K4 definition) at least
 * `minDays` long, in chronological order - YearStrip.tsx shades these directly, rather
 * than keeping its own second copy of this boundary logic (it used to, with the same K4
 * bug: a dry spell could never reach its own 8-day shading threshold because every
 * weekend ended it).
 */
export function findDrySpells(
  today: string,
  horizonEnd: string,
  holidaySet: ReadonlySet<string>,
  workWeek: WorkWeek = DEFAULT_WORK_WEEK,
  minDays = 1,
): OffRun[] {
  if (horizonEnd <= today) return [];
  const breakDates = [...holidaySet].filter((d) => d > today && d <= horizonEnd && workWeek[mondayIndexedDow(d)]).sort();
  const boundaries = [today, ...breakDates, addDays(horizonEnd, 1)];

  const spells: OffRun[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const gapStart = addDays(boundaries[i], 1);
    const gapEnd = addDays(boundaries[i + 1], -1);
    if (gapEnd < gapStart) continue; // back-to-back breaks - no gap between them
    if (isoToSerial(gapEnd) - isoToSerial(gapStart) + 1 >= minDays) spells.push({ start: gapStart, end: gapEnd });
  }
  return spells;
}

/**
 * Phase 5 (K4): redefined. The old version was "the longest run of consecutive WORKING
 * days" - under that definition a weekend ends every run, so the result could never
 * exceed about 5 days and the landing page's 8-day shaded-dry-spell threshold could never
 * actually render. A "dry spell" is really the stretch between two consecutive BREAKS,
 * where a break is a public holiday that falls on a day that would otherwise be a working
 * day (one landing on a weekend doesn't create a new day off, so it doesn't count as a
 * break here) - weekends inside that stretch don't end it, they're just ordinary weekends
 * within a long dry run. `today` and the day after `horizonEnd` act as the two outer
 * boundaries, so "the dry spell you're currently in" and "the one right before the
 * horizon" are both found too, not just stretches strictly between two real holidays.
 * Real US 2027 values run up to roughly 15 weeks (mid-Feb to late May) under this
 * definition - genuinely that long, not a bug to be tuned away.
 */
export function longestDrySpell(today: string, horizonEnd: string, holidaySet: ReadonlySet<string>, workWeek: WorkWeek = DEFAULT_WORK_WEEK): OffRun | undefined {
  const spells = findDrySpells(today, horizonEnd, holidaySet, workWeek, 1);
  if (spells.length === 0) return undefined;
  return spells.reduce((longest, r) => (runLength(r) > runLength(longest) ? r : longest));
}

export interface Bridge {
  /** The single working day that, taken as PTO, joins the two off-runs either side of it. */
  bridgeDate: string;
  /** The combined run that results once `bridgeDate` is added. */
  combined: OffRun;
}

/** Every off-run in (today, horizonEnd] that is separated from the NEXT off-run by exactly
 * one working day - "One PTO day on Friday Nov 27 makes it a four-day weekend." Ordered
 * chronologically, so the first entry is the nearest upcoming bridge. */
export function findBridges(today: string, horizonEnd: string, holidaySet: ReadonlySet<string>, workWeek: WorkWeek = DEFAULT_WORK_WEEK): Bridge[] {
  if (horizonEnd <= today) return [];
  const runs = computeRuns(addDays(today, 1), horizonEnd, (iso) => isOffDay(iso, holidaySet, workWeek));
  const bridges: Bridge[] = [];
  for (let i = 0; i < runs.length - 1; i++) {
    const a = runs[i];
    const b = runs[i + 1];
    const gapStart = addDays(a.end, 1);
    if (gapStart === b.start) continue; // adjacent already, nothing to bridge
    if (addDays(gapStart, 1) !== b.start) continue; // gap of more than one day - not a single-day bridge
    bridges.push({ bridgeDate: gapStart, combined: { start: a.start, end: b.end } });
  }
  return bridges;
}

export interface NextHoliday {
  holiday: Holiday;
  daysAway: number;
  /** The off-run (weekend+holiday stretch) this holiday already sits inside. */
  run: OffRun;
  runLength: number;
  /** The nearest bridge touching this holiday's own run, if one PTO day would extend it. */
  bridge: Bridge | undefined;
}

/**
 * Phase 5 (5A hero): the next REAL public holiday, not the next day off in general -
 * "WEEKENDS ARE NOT NEWS" per spec. `undefined` when no holiday falls in the window at
 * all (the caller then leads with the gap itself instead - see Landing.tsx).
 */
export function nextHoliday(today: string, horizonEnd: string, holidays: Holiday[], workWeek: WorkWeek = DEFAULT_WORK_WEEK): NextHoliday | undefined {
  const upcoming = holidays.filter((h) => h.date > today && h.date <= horizonEnd).sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length === 0) return undefined;
  const holiday = upcoming[0];
  const holidaySet = new Set(holidays.map((h) => h.date));
  const runs = computeRuns(addDays(today, 1), horizonEnd, (iso) => isOffDay(iso, holidaySet, workWeek));
  const run = runs.find((r) => holiday.date >= r.start && holiday.date <= r.end);
  if (!run) return undefined; // shouldn't happen - a holiday date is always off - defensive only
  const bridges = findBridges(today, horizonEnd, holidaySet, workWeek);
  const bridge = bridges.find((b) => b.combined.start === run.start || b.combined.end === run.end);
  return { holiday, daysAway: daysBetween(today, holiday.date), run, runLength: runLength(run), bridge };
}

export interface RemainingHoliday {
  holiday: Holiday;
  weekday: string;
  daysAway: number;
  /** The off-run (weekend+holiday stretch) this holiday falls inside. */
  run: OffRun;
  runLength: number;
  /** True if this holiday's run is one PTO day away (either side) from a longer break. */
  isBridgeable: boolean;
  /** True if the published date differs from the nominal calendar date (weekend-shifted). */
  isObserved: boolean;
}

/**
 * Every remaining holiday through `yearEnd`, each annotated with how far away it is and the
 * length of the break it's already part of - the data `Landing.tsx`'s interactive list
 * renders directly. Holidays are de-duplicated by date (a country can report more than one
 * named holiday landing on the same day); the first name wins.
 */
export function remainingHolidays(
  today: string,
  yearEnd: string,
  holidays: Holiday[],
  workWeek: WorkWeek = DEFAULT_WORK_WEEK,
): RemainingHoliday[] {
  const holidaySet = new Set(holidays.map((h) => h.date));
  const runs = computeRuns(addDays(today, 1), yearEnd, (iso) => isOffDay(iso, holidaySet, workWeek));
  const bridges = findBridges(today, yearEnd, holidaySet, workWeek);
  const bridgeRunKeys = new Set<string>();
  for (const b of bridges) {
    const a = runs.find((r) => addDays(r.end, 1) === b.bridgeDate);
    const after = runs.find((r) => addDays(b.bridgeDate, 1) === r.start);
    if (a) bridgeRunKeys.add(a.start);
    if (after) bridgeRunKeys.add(after.start);
  }

  const seenDates = new Set<string>();
  const result: RemainingHoliday[] = [];
  for (const h of holidays.filter((h) => h.date > today && h.date <= yearEnd).sort((a, b) => a.date.localeCompare(b.date))) {
    if (seenDates.has(h.date)) continue;
    seenDates.add(h.date);
    const run = runs.find((r) => h.date >= r.start && h.date <= r.end);
    if (!run) continue; // shouldn't happen - a holiday date is always off - defensive only
    result.push({
      holiday: h,
      weekday: weekdayName(h.date),
      daysAway: daysBetween(today, h.date),
      run,
      runLength: runLength(run),
      isBridgeable: bridgeRunKeys.has(run.start),
      isObserved: h.date !== h.nominalDate,
    });
  }
  return result;
}
