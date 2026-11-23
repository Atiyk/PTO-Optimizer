/**
 * Everything a guide page shows is computed here from the committed holiday files, through
 * the same code the homepage preview and /pto use:
 * - holidays: consumerHolidaysFromSource + holidayEntriesFor with a new visitor's employer
 *   calendar (what /pto starts from for a link with no saved calendar), or with the guide's
 *   own illustrative calendar, which the link carries in /pto's existing `eh` parameter;
 * - the plan: computeLandingPlanWith (the homepage solver call, plus style and work week);
 * - the link: landingPlanHref plus the guide's style, work week, region and calendar.
 * guidePlannerParity.test.tsx proves each link reproduces the page's plan on /pto.
 */
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';
import { addDays, isoToSerial, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { consumerHolidaysFromSource, holidayEntriesFor, stateHolidayCandidatesFor } from '../../autopilot/planFromSearch';
import { encodeEmployerCalendar, freshEmployerCalendar, type EmployerCalendar } from '../../personal/employerCalendar';
import { planningStyleSettings } from '../../planning/optimizer';
import { computeLandingPlanWith, landingPlanHref, type LandingState } from '../../ui/landingState';
import { guideHolidaySource } from './planGuideHolidays';

export interface HolidayScope {
  year: number;
  country: string;
  /** Region code as /pto's `sd` param takes it (GB-ENG). */
  subdivision?: string;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface GuideHoliday {
  date: string;
  name: string;
  weekday: Weekday;
}

/** Which holidays a plan assumes the employer gives: every public holiday /pto starts
 * with, or an illustrative shorter list (public holiday names left out). */
export interface HolidaySet {
  id: string;
  /** Source names (as in the holiday data) of public holidays this set leaves out. */
  skipped: readonly string[];
}

export const ALL_PUBLIC_HOLIDAYS: HolidaySet = { id: 'public', skipped: [] };

export type GuideStyle = 'max' | 'year';

export interface PlanSpec {
  id: string;
  style: GuideStyle;
  holidays: HolidaySet;
  /** PTO days for this plan when it differs from the guide's own number. */
  budget?: number;
}

function scopeFor(scope: GuideScope, spec: PlanSpec): GuideScope {
  return spec.budget === undefined ? scope : { ...scope, budget: spec.budget };
}

export interface GuideScope extends HolidayScope {
  budget: number;
  /** /pto's `ww` value, Monday first ("1111000" = Monday to Thursday). */
  workWeek?: string;
}

export function weekdayOf(iso: string): Weekday {
  return WEEKDAYS[mondayIndexedDow(iso)];
}

export function rangeOf(scope: HolidayScope): { rangeStart: string; rangeEnd: string } {
  return { rangeStart: `${scope.year}-01-01`, rangeEnd: `${scope.year}-12-31` };
}

export function parseWorkWeek(value: string | undefined): WorkWeek {
  if (!value) return DEFAULT_WORK_WEEK;
  if (!/^[01]{7}$/.test(value) || !value.includes('1')) throw new Error(`Invalid work week: ${value}`);
  return value.split('').map((c) => c === '1') as WorkWeek;
}

export function guideEmployerCalendar(scope: HolidayScope, set: HolidaySet = ALL_PUBLIC_HOLIDAYS): EmployerCalendar {
  const fresh = freshEmployerCalendar(scope.country, scope.subdivision);
  return set.skipped.length ? { ...fresh, skipped: [...set.skipped].sort() } : fresh;
}

/** The days off a /pto plan starts from for this country, region, year and holiday set. */
export function guideHolidayList(scope: HolidayScope, set: HolidaySet = ALL_PUBLIC_HOLIDAYS): GuideHoliday[] {
  const { country, subdivision } = scope;
  const { rangeStart, rangeEnd } = rangeOf(scope);
  const national = consumerHolidaysFromSource(guideHolidaySource, country, rangeStart, rangeEnd);
  const regional = subdivision
    ? stateHolidayCandidatesFor(consumerHolidaysFromSource(guideHolidaySource, country, rangeStart, rangeEnd, subdivision), country, subdivision, rangeStart, rangeEnd)
    : [];
  const entries = holidayEntriesFor(national, regional, guideEmployerCalendar(scope, set), rangeStart, rangeEnd);
  const byDate = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.checked) continue;
    byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry.name]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, names]) => ({ date, name: names.join(' / '), weekday: weekdayOf(date) }));
}

export function guideLandingState(scope: GuideScope): LandingState {
  return { country: scope.country, budget: scope.budget, ...rangeOf(scope) };
}

/** The /pto link that reproduces a plan: the homepage link, then this plan's own inputs. */
export function guidePlanHref(guideScope: GuideScope, plan: PlanSpec): string {
  const scope = scopeFor(guideScope, plan);
  const url = new URL(landingPlanHref(guideLandingState(scope)), 'https://guide.invalid');
  const params = url.searchParams;
  const preset = planningStyleSettings(plan.style)!;
  params.set('ps', plan.style);
  params.set('w', String(preset.w));
  params.set('count', String(preset.breakCount));
  if (scope.workWeek) params.set('ww', scope.workWeek);
  if (scope.subdivision) params.set('sd', scope.subdivision);
  if (plan.holidays.skipped.length) params.set('eh', encodeEmployerCalendar(guideEmployerCalendar(scope, plan.holidays)));
  return `${url.pathname}?${params}`;
}

export interface PlannedBreak {
  start: string;
  end: string;
  /** The working days this break charges to PTO, in order. */
  ptoDays: string[];
  ptoCost: number;
  totalDaysOff: number;
}

export interface GuidePlan {
  spec: PlanSpec;
  href: string;
  holidays: GuideHoliday[];
  breaks: PlannedBreak[];
  ptoUsed: number;
  daysOff: number;
  /** PTO days the year-round style leaves unplanned ("kept for surprises"). */
  reserveKept: number;
  budget: number;
}

export function computeGuidePlan(guideScope: GuideScope, spec: PlanSpec): GuidePlan {
  const scope = scopeFor(guideScope, spec);
  const holidays = guideHolidayList(scope, spec.holidays);
  const workWeek = parseWorkWeek(scope.workWeek);
  const outcome = computeLandingPlanWith(guideLandingState(scope), holidays, { style: spec.style, workWeek });
  const off = new Set(holidays.map((h) => h.date));
  const breaks = outcome.result.primary.map((brk) => {
    const ptoDays = brk.days.filter((d) => workWeek[mondayIndexedDow(d)] && !off.has(d));
    return { start: brk.start, end: brk.end, ptoDays, ptoCost: brk.ptoCost, totalDaysOff: brk.totalDaysOff };
  });
  return {
    spec,
    href: guidePlanHref(guideScope, spec),
    holidays,
    breaks,
    ptoUsed: breaks.reduce((sum, b) => sum + b.ptoCost, 0),
    daysOff: breaks.reduce((sum, b) => sum + b.totalDaysOff, 0),
    reserveKept: outcome.meta?.reserveKept ?? 0,
    budget: scope.budget,
  };
}

// ---------------------------------------------------------------------------------------
// Long weekends: what each holiday gives with no PTO, and with one PTO day beside it.
// ---------------------------------------------------------------------------------------

export interface Run {
  start: string;
  end: string;
  length: number;
}

export interface HolidayWeekend extends GuideHoliday {
  /** False when the holiday falls on a day you don't work anyway. */
  onWorkday: boolean;
  /** The days off in a row around the holiday with no PTO. */
  free: Run;
  /** The best single PTO day inside the year next to that run, and what it makes. */
  withOneDay?: { date: string; run: Run };
}

export interface GapFill {
  ptoDays: string[];
  run: Run;
  holidays: string[];
}

function makeRun(start: string, end: string): Run {
  return { start, end, length: isoToSerial(end) - isoToSerial(start) + 1 };
}

function offDayTest(scope: GuideScope, set: HolidaySet) {
  const workWeek = parseWorkWeek(scope.workWeek);
  // The next year's list too, so a run that crosses Dec 31 is measured in full.
  const dates = new Set([...guideHolidayList(scope, set), ...guideHolidayList({ ...scope, year: scope.year + 1 }, set)].map((h) => h.date));
  return (iso: string) => !workWeek[mondayIndexedDow(iso)] || dates.has(iso);
}

function runAround(date: string, isOff: (iso: string) => boolean): Run {
  let start = date;
  let end = date;
  while (isOff(addDays(start, -1))) start = addDays(start, -1);
  while (isOff(addDays(end, 1))) end = addDays(end, 1);
  return makeRun(start, end);
}

export function holidayWeekends(scope: GuideScope, set: HolidaySet = ALL_PUBLIC_HOLIDAYS): HolidayWeekend[] {
  const isOff = offDayTest(scope, set);
  const workWeek = parseWorkWeek(scope.workWeek);
  const { rangeStart, rangeEnd } = rangeOf(scope);
  return guideHolidayList(scope, set).map((holiday) => {
    const free = runAround(holiday.date, isOff);
    const onWorkday = workWeek[mondayIndexedDow(holiday.date)];
    // Earlier day first, so a tie (Fri before a Monday holiday vs Tue after) picks the Friday.
    const candidates = [addDays(free.start, -1), addDays(free.end, 1)].filter((d) => d >= rangeStart && d <= rangeEnd);
    let best: HolidayWeekend['withOneDay'];
    for (const date of candidates) {
      const run = runAround(date, (iso) => iso === date || isOff(iso));
      if (!best || run.length > best.run.length) best = { date, run };
    }
    return { ...holiday, onWorkday, free, ...(onWorkday && best ? { withOneDay: best } : {}) };
  });
}

/** Two holiday stretches at most `maxDays` working days apart, joined by PTO on the days
 * between (only days inside the year). */
export function holidayGapFills(scope: GuideScope, maxDays = 4, set: HolidaySet = ALL_PUBLIC_HOLIDAYS): GapFill[] {
  const isOff = offDayTest(scope, set);
  const { rangeEnd } = rangeOf(scope);
  const runs: { run: Run; holidays: string[] }[] = [];
  for (const holiday of guideHolidayList(scope, set)) {
    const run = runAround(holiday.date, isOff);
    const last = runs.at(-1);
    if (last && last.run.start === run.start) last.holidays.push(holiday.date);
    else runs.push({ run, holidays: [holiday.date] });
  }
  // A stretch that starts just after Dec 31 (next year's New Year) can join this year's last one.
  const nextYear = guideHolidayList({ ...scope, year: scope.year + 1 }, set)[0];
  if (nextYear) {
    const run = runAround(nextYear.date, isOff);
    if (run.start > rangeEnd || runs.at(-1)?.run.start !== run.start) runs.push({ run, holidays: [nextYear.date] });
  }
  const fills: GapFill[] = [];
  for (let i = 0; i + 1 < runs.length; i++) {
    const a = runs[i];
    const b = runs[i + 1];
    if (a.run.start === b.run.start) continue;
    const gap: string[] = [];
    for (let d = addDays(a.run.end, 1); d < b.run.start; d = addDays(d, 1)) gap.push(d);
    if (gap.length === 0 || gap.length > maxDays || gap.some((d) => d > rangeEnd)) continue;
    const joined = runAround(gap[0], (iso) => gap.includes(iso) || isOff(iso));
    fills.push({ ptoDays: gap, run: joined, holidays: [...a.holidays, ...b.holidays] });
  }
  return fills;
}
