/**
 * The /pto plan as a pure function of its query string (F1, live plan feed).
 *
 * The small derivation helpers below are the SAME code src/ui/useAppState.ts runs inside
 * its useMemos (holiday entries -> off days, pins, blackouts, reserve-adjusted budget ->
 * SolveInput -> solve). They were moved here, not copied, so the feed and the planner can't
 * drift: the hook keeps its own memoization and state, and calls these for the work.
 *
 * What a server can't see, and so the feed doesn't use:
 * - a browser-saved employer calendar that is NOT in the link. The planner writes the
 *   employer calendar into the link (`eh`) whenever it encodes, so in practice the link
 *   carries it; without `eh` the feed uses the public-holiday defaults.
 * - the geolocated / country-landing-page default country (the link always carries `c`;
 *   without it the feed uses US).
 * - the Nager.Date live fallback for a country-year that has no committed
 *   public/holidays file: the feed treats that year as having no public holidays.
 * - notes, request tracking, salary and imported calendars, which never enter the link.
 */
import type { Break, SolveInput, WorkWeek } from '@daysoff/engine/solver/types';
import { rawHolidaysToHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import { getStateHolidaysFallback } from '@daysoff/engine/data/usStateHolidays';
import { isAlternatingFridayOff } from '@daysoff/engine/calendar/calendarMath';
import { isoToSerial, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { solveLegacyConsumer, type PlanningStyle } from '../planning/optimizer';
import { solveWithPinFallback, type PlannerOutcome } from '../ui/pinPreview';
import { readFullStateFromURL, readOverlapPayloadFromURL, isValidISODate } from '../ui/urlState';
import { validateInputs, isSupportedPlanningRange } from '../ui/validation';
import { policyFromLegacyPtoState, toLegacySolverFields } from '../policy/model';
import { defaultEmployerCalendar, type EmployerCalendar } from '../personal/employerCalendar';
import { consumerHolidayLookupEnd, observedEntries, validScope } from '../personal/consumerHolidays';
import type { ForcedState } from '../ui/types';

/** Below this many days remaining in the current year, the default range rolls forward to
 * next year's Dec 31 instead - see defaultRangeEnd's own comment for why. */
const DEFAULT_RANGE_ROLLOVER_DAYS = 21;

/**
 * BUG FOUND (Phase 2): this always returned the CURRENT year's Dec 31, regardless of how
 * close "today" already is to it. Visit the site on December 20th and the default range is
 * an 11-day sliver. The default stays THIS year's Dec 31 for as long as that's still a
 * useful planning window, then rolls forward to next year's Dec 31. (Moved here from
 * useAppState.ts, which re-exports it, so the feed defaults the range the same way.)
 */
/** The planner's default end date: the next 12 months (same as the homepage preview). */
export function defaultPlanRangeEnd(todayIso: string): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 364);
  return d.toISOString().slice(0, 10);
}

export function defaultRangeEnd(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4));
  const thisYearEnd = `${year}-12-31`;
  const daysRemaining = isoToSerial(thisYearEnd) - isoToSerial(todayIso); // exclusive of today itself
  return daysRemaining > DEFAULT_RANGE_ROLLOVER_DAYS ? thisYearEnd : `${year + 1}-12-31`;
}

export function yearsBetween(rangeStart: string, rangeEnd: string): number[] {
  if (!isSupportedPlanningRange(rangeStart, rangeEnd)) return [];
  const startYear = Number(rangeStart.slice(0, 4));
  const endYear = Number(rangeEnd.slice(0, 4));
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

export interface HolidayEntry {
  date: string;
  name: string;
  source: 'public' | 'custom' | 'state';
  checked: boolean;
}

/** US state holidays: the live data's subdivision-specific entries plus the static
 * supplementary table for the years in range (US only - see usStateHolidays.ts). */
export function stateHolidayCandidatesFor(withSubdivision: Holiday[], country: string, subdivision: string, rangeStart: string, rangeEnd: string): Holiday[] {
  const stateOnly = withSubdivision.filter((h) => h.counties);
  if (country === 'US') {
    const seen = new Set(stateOnly.map((h) => `${h.date}|${h.name}`));
    for (const year of yearsBetween(rangeStart, rangeEnd)) {
      for (const fallback of getStateHolidaysFallback(subdivision, year)) {
        const key = `${fallback.date}|${fallback.name}`;
        if (seen.has(key)) continue;
        if (fallback.date < rangeStart || fallback.date > rangeEnd) continue;
        seen.add(key);
        stateOnly.push({ date: fallback.date, nominalDate: fallback.date, name: fallback.name, countryCode: country, counties: [subdivision] });
      }
    }
  }
  return stateOnly;
}

export function holidayEntriesFor(nationalHolidays: Holiday[], stateHolidayCandidates: Holiday[], employerCalendar: EmployerCalendar, rangeStart: string, rangeEnd: string): HolidayEntry[] {
  const excluded = new Set(employerCalendar.excluded);
  const entries = new Map<string, HolidayEntry>();
  for (const h of nationalHolidays) {
    const key = `${h.date}|${h.name}`;
    entries.set(key, { date: h.date, name: h.name, source: 'public', checked: !excluded.has(key) });
  }
  for (const h of stateHolidayCandidates) {
    const key = `${h.date}|${h.name}`;
    if (!entries.has(key)) entries.set(key, { date: h.date, name: h.name, source: 'state', checked: !excluded.has(key) });
  }
  for (const h of employerCalendar.custom) {
    const key = `${h.date}|${h.name}`;
    if (!entries.has(key) && h.date >= rangeStart && h.date <= rangeEnd) entries.set(key, { ...h, source: 'custom', checked: !excluded.has(key) });
  }
  return [...entries.values()].sort((a, b) => `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`));
}

export function altFridayOffDatesFor(altFridayEnabled: boolean, altFridayStart: string, rangeStart: string, rangeEnd: string): string[] {
  if (!altFridayEnabled || !altFridayStart || !isSupportedPlanningRange(rangeStart, rangeEnd)) return [];
  return rangeISO(rangeStart, rangeEnd).filter((d) => isAlternatingFridayOff(d, altFridayStart));
}

export function effectiveOffDaysFor(holidayEntries: HolidayEntry[], altFridayOffDates: string[]): string[] {
  const set = new Set(holidayEntries.filter((h) => h.checked).map((h) => h.date));
  for (const d of altFridayOffDates) set.add(d);
  return Array.from(set);
}

export function mustIncludeDaysFor(forced: Record<string, ForcedState>): string[] {
  return Object.entries(forced).filter(([, state]) => state === 'include').map(([date]) => date);
}

export function effectiveBlackoutsFor(blackouts: string[], forced: Record<string, ForcedState>): string[] {
  const set = new Set(blackouts);
  for (const [date, state] of Object.entries(forced)) {
    if (state === 'exclude') set.add(date);
  }
  return Array.from(set);
}

/** Reserve days come off the balance before the solver sees it; never below 0. */
export function effectiveBudgetFor(budget: number, reserveDays: number): number {
  return Math.max(0, budget - reserveDays);
}

export interface SolveInputFields {
  effectiveOffDays: string[];
  mustIncludeDays: string[];
  effectiveBlackouts: string[];
  effectiveBudget: number;
  rangeStart: string;
  rangeEnd: string;
  budget: number;
  accrualEnabled: boolean;
  accrualPerMonth: number;
  expiryEnabled: boolean;
  expiryDate: string;
  carryoverCap: number;
  overlapDays: string[];
  workWeek: WorkWeek;
  country: string;
  w: number;
  breakCount: number;
  peakCapEnabled: boolean;
  peakCapStart: string;
  peakCapEnd: string;
  peakCapMaxDays: number;
}

export function policyAccrualFieldsFor(f: Pick<SolveInputFields, 'budget' | 'accrualEnabled' | 'accrualPerMonth' | 'expiryEnabled' | 'expiryDate' | 'carryoverCap' | 'rangeStart'>) {
  const { budget, accrualEnabled, accrualPerMonth, expiryEnabled, expiryDate, carryoverCap, rangeStart } = f;
  return toLegacySolverFields(policyFromLegacyPtoState({ budget, accrualEnabled, accrualPerMonth, expiryEnabled, expiryDate, carryoverCap, rangeStart }), rangeStart);
}

export function buildSolveInput(f: SolveInputFields, policyAccrualFields = policyAccrualFieldsFor(f)): SolveInput {
  return {
    offDays: f.effectiveOffDays,
    rangeStart: f.rangeStart,
    rangeEnd: f.rangeEnd,
    budget: f.effectiveBudget,
    accrualPerMonth: policyAccrualFields.accrualPerMonth,
    expiryDate: policyAccrualFields.expiryDate,
    carryoverCap: policyAccrualFields.carryoverCap,
    blackouts: f.effectiveBlackouts,
    mustIncludeDays: f.mustIncludeDays,
    overlapDays: f.overlapDays,
    workWeek: f.workWeek,
    country: f.country,
    w: f.w,
    breakCount: f.breakCount,
    peakCap:
      f.peakCapEnabled && f.peakCapStart && f.peakCapEnd
        ? { enabled: true, startDate: f.peakCapStart, endDate: f.peakCapEnd, maxDays: f.peakCapMaxDays }
        : undefined,
  };
}

/** The planner's solve call: may throw, the caller decides what an exception means. */
export function solvePlan(solveInput: SolveInput, planningVersion: 2 | undefined, minimumBreakDays: number, planningStyle: PlanningStyle): PlannerOutcome {
  // Pinned days that cannot sit inside the minimum break no longer collapse the whole
  // plan: the minimum is set aside for that plan and App says so (see pinPreview.ts).
  return planningVersion === 2 ? solveWithPinFallback(solveInput, { minimumBreakDays, style: planningStyle }) : solveLegacyConsumer(solveInput);
}

export interface PtoDayContext {
  blackoutSet: Set<string>;
  forced: Record<string, ForcedState>;
  baseOffSet: Set<string>;
  workWeek: WorkWeek;
  chosenDaySet: Set<string>;
}

/** A day the plan actually converted from work to PTO, or one the user pinned in. */
export function isSuggestedPtoDay(iso: string, c: PtoDayContext): boolean {
  if (c.blackoutSet.has(iso)) return false;
  if (c.forced[iso] === 'include') return true;
  const wasOff = c.baseOffSet.has(iso) || !c.workWeek[mondayIndexedDow(iso)];
  return !wasOff && c.chosenDaySet.has(iso);
}

// ---------------------------------------------------------------------------------------
// Holidays from an injectable source (the browser fetches /holidays/<CC>-<YEAR>.json; the
// server reads the same files from disk).
// ---------------------------------------------------------------------------------------

/** Returns the raw Nager-shaped array committed under public/holidays for that
 * country-year, or null when there is none. */
export type HolidaySource = (country: string, year: number) => unknown;

/** Which country-years a plan needs, so an async caller can load them up front. */
export function holidayYearsNeeded(country: string, rangeStart: string, rangeEnd: string): number[] {
  if (!validScope(country, rangeStart, rangeEnd)) return [];
  const end = consumerHolidayLookupEnd(country, rangeStart, rangeEnd);
  const years: number[] = [];
  for (let y = Number(rangeStart.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) years.push(y);
  return years;
}

/** The engine's private subdivision + range filter (holidays.ts filterAndSort), restated
 * because the engine package must stay unchanged in this run. The parity tests in
 * planFromSearch.test.ts compare the result with the hook's real fetch path. */
function filterAndSort(holidays: Holiday[], rangeStart: string, rangeEnd: string, subdivision: string | undefined): Holiday[] {
  return holidays
    .filter((h) => !h.counties || (!!subdivision && h.counties.includes(subdivision)))
    .filter((h) => h.date >= rangeStart && h.date <= rangeEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Same pipeline as getConsumerHolidays / getConsumerHolidaysWithStatus (engine
 * observed-date shift, subdivision filter, consumer validation and de-duplication), with
 * the fetch replaced by `source`. Bad data degrades to [] exactly like the browser path. */
export function consumerHolidaysFromSource(source: HolidaySource, country: string, rangeStart: string, rangeEnd: string, subdivision?: string): Holiday[] {
  if (!validScope(country, rangeStart, rangeEnd, subdivision)) return [];
  try {
    const lookupEnd = consumerHolidayLookupEnd(country, rangeStart, rangeEnd);
    const raw: unknown[] = [];
    for (const year of holidayYearsNeeded(country, rangeStart, rangeEnd)) {
      const data = source(country, year);
      if (Array.isArray(data)) raw.push(...data);
    }
    const holidays = rawHolidaysToHolidays(raw as Parameters<typeof rawHolidaysToHolidays>[0]);
    return observedEntries(filterAndSort(holidays, rangeStart, lookupEnd, subdivision), country, rangeStart, rangeEnd);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------
// The whole plan from a query string.
// ---------------------------------------------------------------------------------------

/** The hook's state right after mount, for a given link and day. */
export interface PlanState {
  country: string;
  subdivision: string | undefined;
  employerCalendar: EmployerCalendar;
  planningVersion: 2 | undefined;
  planningStyle: PlanningStyle;
  minimumBreakDays: number;
  rangeStart: string;
  rangeEnd: string;
  budget: number;
  reserveDays: number;
  unlimitedPto: boolean;
  noticePeriodDays: number;
  w: number;
  breakCount: number;
  accrualEnabled: boolean;
  accrualPerMonth: number;
  expiryEnabled: boolean;
  expiryDate: string;
  carryoverCap: number;
  overlapDays: string[];
  blackouts: string[];
  workWeek: WorkWeek;
  forced: Record<string, ForcedState>;
  altFridayEnabled: boolean;
  altFridayStart: string;
  peakCapEnabled: boolean;
  peakCapStart: string;
  peakCapEnd: string;
  peakCapMaxDays: number;
}

/** Mirrors useAppState's initial useState values for the same search string, minus the
 * browser-only defaults listed in this file's header. */
export function planStateFromSearch(search: string, today: string, defaultCountry = 'US'): PlanState {
  const initial = readFullStateFromURL(search, { rangeStart: today, rangeEnd: defaultPlanRangeEnd(today), budget: 15, country: defaultCountry });
  const country = initial.country ?? defaultCountry;
  const overlapPayload = readOverlapPayloadFromURL(search);
  const forced: Record<string, ForcedState> = {};
  for (const d of initial.pinnedDays) forced[d] = 'include';
  for (const d of initial.ruledOutDays) forced[d] = 'exclude';
  return {
    country,
    subdivision: initial.subdivision,
    employerCalendar: initial.employerCalendar ?? defaultEmployerCalendar(country, initial.subdivision),
    planningVersion: initial.planningVersion,
    planningStyle: initial.planningStyle ?? 'custom',
    minimumBreakDays: initial.minimumBreakDays ?? 0,
    rangeStart: initial.rangeStart,
    rangeEnd: initial.rangeEnd,
    budget: initial.budget,
    reserveDays: initial.reserveDays ?? 3,
    unlimitedPto: initial.unlimitedPto ?? false,
    noticePeriodDays: initial.noticePeriodDays ?? 14,
    w: initial.w,
    breakCount: initial.breakCount,
    accrualEnabled: initial.accrualEnabled,
    accrualPerMonth: initial.accrualPerMonth,
    expiryEnabled: initial.expiryEnabled,
    expiryDate: initial.expiryDate ?? defaultRangeEnd(today),
    carryoverCap: initial.carryoverCap,
    overlapDays: overlapPayload.length ? Array.from(new Set([...initial.overlapDays, ...overlapPayload])) : initial.overlapDays,
    blackouts: initial.blackouts,
    workWeek: initial.workWeek,
    forced,
    altFridayEnabled: initial.altFridayEnabled ?? false,
    altFridayStart: initial.altFridayStart ?? '',
    peakCapEnabled: initial.peakCapEnabled ?? false,
    peakCapStart: initial.peakCapStart ?? '',
    peakCapEnd: initial.peakCapEnd ?? '',
    peakCapMaxDays: initial.peakCapMaxDays ?? 5,
  };
}

export interface SolvedPlan {
  ok: true;
  state: PlanState;
  holidayEntries: HolidayEntry[];
  solveInput: SolveInput;
  outcome: PlannerOutcome;
  breaks: Break[];
  /** Same predicate the planner hands to ExportBar / generateICS. */
  isPtoDay: (iso: string) => boolean;
}

export type PlanFromSearchResult = SolvedPlan | { ok: false; issues: string[] };

export function planFromSearch(search: string, today: string, holidays: HolidaySource): PlanFromSearchResult {
  if (!isValidISODate(today)) return { ok: false, issues: ['Invalid date.'] };
  const state = planStateFromSearch(search, today);
  const issues = validateInputs({ rangeStart: state.rangeStart, rangeEnd: state.rangeEnd, budget: state.budget, expiryEnabled: state.expiryEnabled, expiryDate: state.expiryDate });
  if (issues.length) return { ok: false, issues };

  const { country, subdivision, rangeStart, rangeEnd } = state;
  const national = consumerHolidaysFromSource(holidays, country, rangeStart, rangeEnd);
  const stateCandidates = subdivision
    ? stateHolidayCandidatesFor(consumerHolidaysFromSource(holidays, country, rangeStart, rangeEnd, subdivision), country, subdivision, rangeStart, rangeEnd)
    : [];
  const holidayEntries = holidayEntriesFor(national, stateCandidates, state.employerCalendar, rangeStart, rangeEnd);
  const effectiveOffDays = effectiveOffDaysFor(holidayEntries, altFridayOffDatesFor(state.altFridayEnabled, state.altFridayStart, rangeStart, rangeEnd));
  const effectiveBlackouts = effectiveBlackoutsFor(state.blackouts, state.forced);
  const solveInput = buildSolveInput({
    ...state,
    effectiveOffDays,
    mustIncludeDays: mustIncludeDaysFor(state.forced),
    effectiveBlackouts,
    effectiveBudget: effectiveBudgetFor(state.budget, state.reserveDays),
  });

  let outcome: PlannerOutcome;
  try {
    outcome = solvePlan(solveInput, state.planningVersion, state.minimumBreakDays, state.planningStyle);
  } catch {
    return { ok: false, issues: ['This combination could not be calculated. Check your dates and settings.'] };
  }
  const breaks = outcome.result.primary;
  const ctx: PtoDayContext = {
    blackoutSet: new Set(effectiveBlackouts),
    forced: state.forced,
    baseOffSet: new Set(effectiveOffDays),
    workWeek: state.workWeek,
    chosenDaySet: new Set(breaks.flatMap((b) => b.days)),
  };
  return { ok: true, state, holidayEntries, solveInput, outcome, breaks, isPtoDay: (iso) => isSuggestedPtoDay(iso, ctx) };
}
