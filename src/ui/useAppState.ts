import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { solve, computeScores } from '../solver/solve';
import { computeMarginalValues } from '../solver/marginalValue';
import type { Alternative, Break, Scores, SolveInput, SolveResult, WorkWeek } from '../solver/types';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import { getHolidays, getHolidaysWithStatus, getSubdivisionCandidates, type Holiday } from '../data/holidays';
import { getStateHolidaysFallback } from '../data/usStateHolidays';
import { geolocateCountry } from './geo';
import { activeCountryPreset } from '../data/countryPresets';
import { computeQualifyingRuns, isAlternatingFridayOff, type WeekStart } from './calendarMath';
import { weekStartForCountry } from './locale';
import { mondayIndexedDow, rangeISO } from '../solver/dateUtils';
import { readFullStateFromURL, writeFullStateToURL, readOverlapPayloadFromURL, buildOverlapShareURL } from './urlState';
import type { DayCategory, ForcedState } from './types';
import { classifyDay } from './dayCategory';
import { alternativeForDate as alternativeForDateImpl } from './alternativeForDate';
import { track } from './analytics';
import { validateInputs } from './validation';

/** The slider's own stored position while unchecked - also what it falls back to showing
 * (disabled) when "let the solver decide" is checked. The middle of the 1-7 range, so
 * unchecking the box for the first time doesn't default to either extreme. */
const DEFAULT_MANUAL_BREAK_COUNT = 4;

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Below this many days remaining in the current year, the default range rolls forward to
 * next year's Dec 31 instead - see defaultRangeEnd's own comment for why. */
const DEFAULT_RANGE_ROLLOVER_DAYS = 21;

/**
 * BUG FOUND (Phase 2): this always returned the CURRENT year's Dec 31, regardless of how
 * close "today" already is to it. Nothing in the solver, holiday fetch, or date-arithmetic
 * layer actually blocks a multi-year range - confirmed directly: a real fiscal-year range
 * (Apr 2027 - Mar 2028) solves and renders correctly today, with holidays fetched for both
 * years. The tool only APPEARED bounded to the current year because of this default: visit
 * the site on, say, December 20th, and the default range is an 11-day sliver with nowhere
 * near enough room to find a real bridge, with no hint that picking a later end date is
 * even useful. Per spec: the highest-value visitor right now has days expiring December
 * 31, so the default should stay THIS year's Dec 31 for as long as that's still a useful
 * planning window, then roll forward to next year's Dec 31 once there's too little of the
 * current year left to plan around.
 */
export function defaultRangeEnd(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4));
  const thisYearEnd = `${year}-12-31`;
  const daysRemaining = rangeISO(todayIso, thisYearEnd).length - 1; // exclusive of today itself
  return daysRemaining > DEFAULT_RANGE_ROLLOVER_DAYS ? thisYearEnd : `${year + 1}-12-31`;
}

function yearsBetween(rangeStart: string, rangeEnd: string): number[] {
  const startYear = Number(rangeStart.slice(0, 4));
  const endYear = Number(rangeEnd.slice(0, 4));
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

function totalDaysOffOf(breaks: { totalDaysOff: number }[]): number {
  return breaks.reduce((s, b) => s + b.totalDaysOff, 0);
}

/**
 * Phase 2: which subdivisions exist for a country/range, discovered from the `counties`
 * field its actual fetched holidays already carry - not a static per-country list. Works
 * for any country that has county-specific holidays, not just a hardcoded few (confirmed
 * directly: a real German 2027 holidays fetch already returns DE-BW/DE-BY/DE-ST etc. on
 * Epiphany, with nothing special needed to read it).
 */
export function discoverSubdivisions(holidays: Holiday[]): string[] {
  const set = new Set<string>();
  for (const h of holidays) {
    if (h.counties) for (const c of h.counties) set.add(c);
  }
  return Array.from(set).sort();
}

/** Everything restorePlan needs to put every input back exactly - deliberately the same
 * fields the shareable URL carries, since "a plan" is defined by the same input set either
 * way (Phase 3 item 7). */
export interface PlanSnapshot {
  country: string;
  subdivision: string | undefined;
  rangeStart: string;
  rangeEnd: string;
  budget: number;
  w: number;
  letSolverDecide: boolean;
  manualBreakCount: number;
  weekStartOverride: WeekStart | 'auto';
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
  reserveDays: number;
  unlimitedPto: boolean;
  summary: {
    budgetSpent: number;
    totalDaysOff: number;
    breakCountActual: number;
    travelPercentile: number | null;
  };
}

const MAX_PINNED_PLANS = 2;

export interface HolidayEntry {
  date: string;
  name: string;
  source: 'public' | 'custom' | 'state';
  checked: boolean;
}

export function useAppState() {
  const initial = useMemo(() => {
    const defaults = {
      rangeStart: todayISO(),
      rangeEnd: defaultRangeEnd(todayISO()),
      budget: 15,
      // A country landing page's preset wins over the geolocated guess - a visitor to
      // /uk should see GB selected regardless of their own browser locale - but an
      // explicit `c` URL param (e.g. a shared link that happens to open on that route)
      // still wins over both, same priority order readFullStateFromURL already applies.
      country: activeCountryPreset()?.code ?? geolocateCountry(),
    };
    if (typeof window === 'undefined') {
      return {
        country: defaults.country,
        subdivision: undefined,
        rangeStart: defaults.rangeStart,
        rangeEnd: defaults.rangeEnd,
        budget: defaults.budget,
        w: 30,
        breakCount: 0,
        weekStartOverride: 'auto' as const,
        accrualEnabled: false,
        accrualPerMonth: 1.25,
        expiryEnabled: false,
        expiryDate: undefined,
        carryoverCap: 0,
        overlapDays: [],
        blackouts: [],
        workWeek: DEFAULT_WORK_WEEK,
        pinnedDays: [],
        ruledOutDays: [],
        altFridayEnabled: false,
        altFridayStart: undefined,
        reserveDays: 3,
        unlimitedPto: false,
        noticePeriodDays: 14,
      };
    }
    return readFullStateFromURL(window.location.search, defaults);
  }, []);

  // 'returned_with_saved_url' (Phase 3 item 9): fired once, only when the page was loaded
  // with a full plan already in the query string - evidence someone kept/reopened a
  // previously-shared link, as opposed to a fresh visit with no state to read. Captured
  // from the RAW incoming search string, at mount, before this component's own URL-sync
  // effect (below) rewrites the address bar with a full set of params regardless of how
  // the visitor arrived - checking `window.location.search` again after that effect runs
  // would always read "true" and defeat the whole signal.
  const arrivedWithSavedUrl = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('s') && params.has('b');
  }, []);
  useEffect(() => {
    if (arrivedWithSavedUrl) track('returned_with_saved_url');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [country, setCountry] = useState<string>(initial.country ?? geolocateCountry());
  const [subdivision, setSubdivision] = useState<string | undefined>(initial.subdivision);
  const [rangeStart, setRangeStart] = useState(initial.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(initial.rangeEnd);
  const [budget, setBudget] = useState(initial.budget);
  // Phase 3.1: "just in case" saving is the single largest reason PTO goes unused (44%).
  // Reserve days are subtracted from the budget BEFORE it reaches the solver - a plain
  // subtraction, no new solver logic - so the plan never asks for the user's entire
  // balance. Defaults to 3, not 0: the whole point is that committing everything is the
  // thing people refuse to do, so a deliberate non-zero default is what actually changes
  // behavior, not a feature nobody opts into.
  const [reserveDays, setReserveDays] = useState(initial.reserveDays ?? 3);
  // Phase 3.2: unlimited-PTO workers still self-cap (66% at 15 days or fewer) because the
  // expectation is unclear, not because they prefer fewer days - so flipping this on seeds
  // a concrete number rather than leaving the field at whatever it was. The field stays
  // fully editable either way; this is a default, not a lock.
  const [unlimitedPto, setUnlimitedPtoRaw] = useState(initial.unlimitedPto ?? false);
  const setUnlimitedPto = useCallback((v: boolean) => {
    setUnlimitedPtoRaw(v);
    if (v) setBudget(15);
  }, []);

  // Phase 4.1: how many days of notice this employer needs - drives the "Request by" date
  // on every break card AND the .ics reminder's lead time (see ExportBar.tsx), the SAME
  // number for both, which is what "must match the .ics reminders, not contradict them"
  // means structurally: one shared source, not two settings that could disagree.
  const [noticePeriodDays, setNoticePeriodDays] = useState(initial.noticePeriodDays ?? 14);

  const [w, setW] = useState(initial.w);
  // breakCount 0 from the URL ("Any", now spelled "let the solver decide") maps to the
  // checkbox being checked; 1-7 maps to it being unchecked with that exact slider position.
  const [letSolverDecide, setLetSolverDecide] = useState(initial.breakCount === 0);
  const [manualBreakCount, setManualBreakCount] = useState(
    initial.breakCount === 0 ? DEFAULT_MANUAL_BREAK_COUNT : initial.breakCount,
  );
  const breakCount = letSolverDecide ? 0 : manualBreakCount;
  // Off by default: alternatives are an advanced/discoverable feature, not the primary
  // signal - they live behind the "Adjust" disclosure now, unchecked, so a first-time
  // visitor sees the plan itself first.
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [hoveredAlternativeId, setHoveredAlternativeId] = useState<string | null>(null);

  // 'auto' follows the selected country's convention; an explicit override wins.
  const [weekStartOverride, setWeekStartOverride] = useState<WeekStart | 'auto'>(initial.weekStartOverride);

  const [accrualEnabled, setAccrualEnabled] = useState(initial.accrualEnabled);
  const [accrualPerMonth, setAccrualPerMonth] = useState(initial.accrualPerMonth);

  const [expiryEnabled, setExpiryEnabled] = useState(initial.expiryEnabled);
  const [expiryDate, setExpiryDate] = useState(initial.expiryDate ?? defaultRangeEnd(todayISO()));
  const [carryoverCap, setCarryoverCap] = useState(initial.carryoverCap);

  // A partner-overlap link ('ov' param) carries a one-shot payload of someone else's
  // resulting days off, meant to prefill as THIS viewer's overlap days. Read once at
  // mount, same as every other URL-seeded field.
  const overlapPayload = useMemo(
    () => (typeof window === 'undefined' ? [] : readOverlapPayloadFromURL(window.location.search)),
    [],
  );
  const [overlapDays, setOverlapDays] = useState<string[]>(() =>
    overlapPayload.length ? Array.from(new Set([...initial.overlapDays, ...overlapPayload])) : initial.overlapDays,
  );
  // True only for the visitor who just arrived via a partner's "share my days" link - drives
  // the one-time banner explaining what they received. Dismissing it doesn't clear
  // overlapDays; it only stops showing the explanation.
  const [partnerOverlapReceived, setPartnerOverlapReceived] = useState(overlapPayload.length > 0);
  useEffect(() => {
    if (overlapPayload.length > 0) track('Overlap link opened');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 'team_days_used' (Phase 3 item 9): fired once per session, the moment the overlap/team-
  // days input first becomes non-empty - whether the visitor typed a date in manually or
  // arrived via a partner's overlap link (both are genuinely "someone used the team-days
  // feature"). A ref guard, not a dependency check, so toggling overlap days on/off/on
  // again later doesn't re-fire it.
  const firedTeamDaysUsedRef = useRef(false);
  useEffect(() => {
    if (overlapDays.length > 0 && !firedTeamDaysUsedRef.current) {
      firedTeamDaysUsedRef.current = true;
      track('team_days_used');
    }
  }, [overlapDays]);
  const [workWeek, setWorkWeek] = useState<WorkWeek>(initial.workWeek);
  const [blackouts, setBlackouts] = useState<string[]>(initial.blackouts);

  // 9/80 compressed schedule (Phase 3 item 5): a plain weekly workWeek array can't express
  // "every OTHER Friday off" - see calendarMath.ts's isAlternatingFridayOff for why. This is
  // the narrow, dedicated primitive instead of a general recurrence engine.
  const [altFridayEnabled, setAltFridayEnabled] = useState(initial.altFridayEnabled ?? false);
  const [altFridayStart, setAltFridayStart] = useState(initial.altFridayStart ?? '');

  const [nationalHolidays, setNationalHolidays] = useState<Holiday[]>([]);
  const [stateHolidayCandidates, setStateHolidayCandidates] = useState<Holiday[]>([]);
  const [removedHolidays, setRemovedHolidays] = useState<Set<string>>(new Set());
  const [checkedStateHolidays, setCheckedStateHolidays] = useState<Set<string>>(new Set());
  const [customHolidays, setCustomHolidays] = useState<HolidayEntry[]>([]);

  const [forced, setForced] = useState<Record<string, ForcedState>>(() => {
    const init: Record<string, ForcedState> = {};
    for (const d of initial.pinnedDays) init[d] = 'include';
    for (const d of initial.ruledOutDays) init[d] = 'exclude';
    return init;
  });

  // Sync the full input state into the shareable URL whenever it changes, so the address
  // bar always reflects a link that reproduces exactly this plan - not just the sliders.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    writeFullStateToURL(url.searchParams, {
      country,
      subdivision,
      rangeStart,
      rangeEnd,
      budget,
      w,
      breakCount,
      weekStartOverride,
      accrualEnabled,
      accrualPerMonth,
      expiryEnabled,
      expiryDate,
      carryoverCap,
      overlapDays,
      blackouts,
      workWeek,
      forced,
      altFridayEnabled,
      altFridayStart,
      reserveDays,
      unlimitedPto,
      noticePeriodDays,
    });
    window.history.replaceState(null, '', url);
  }, [
    country,
    subdivision,
    rangeStart,
    rangeEnd,
    budget,
    w,
    breakCount,
    weekStartOverride,
    accrualEnabled,
    accrualPerMonth,
    expiryEnabled,
    expiryDate,
    carryoverCap,
    overlapDays,
    blackouts,
    workWeek,
    forced,
    altFridayEnabled,
    altFridayStart,
    reserveDays,
    unlimitedPto,
    noticePeriodDays,
  ]);

  // Graceful failure: a network/API failure degrades to cached data (if any was already
  // stored for this country-year) or an empty list - either way the app keeps working with
  // whatever it has (weekends alone still solve a plan) rather than erroring out, but
  // `holidaysDegraded` lets the UI say so instead of silently presenting "no holidays" as
  // if that were a real fact about the calendar.
  const [holidaysDegraded, setHolidaysDegraded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getHolidaysWithStatus(country, rangeStart, rangeEnd).then(({ holidays, degraded }) => {
      if (cancelled) return;
      setNationalHolidays(holidays);
      setHolidaysDegraded(degraded);
    });
    return () => {
      cancelled = true;
    };
  }, [country, rangeStart, rangeEnd]);

  /**
   * BUG FOUND (Phase 2): this effect used to gate on `country !== 'US'` - subdivision
   * selection existed for GB/CA/AU in the old hardcoded SUBDIVISIONS map, but picking a
   * state/province there never actually fetched subdivision-filtered holidays at all; the
   * selector did something visible while doing nothing underneath. Confirmed directly: a
   * real German holidays request for 2027 already returns proper `counties` data
   * (DE-BW/DE-BY/DE-ST for Epiphany, etc.) - nothing about this needed to be US-only.
   * `getStateHolidaysFallback` (the static supplementary table) genuinely IS US-specific
   * (see usStateHolidays.ts's own comment on Nager.Date's thin US county coverage), so that
   * part alone stays gated to US; the live-fetch-and-filter part now works for any country.
   */
  useEffect(() => {
    let cancelled = false;
    if (!subdivision) {
      setStateHolidayCandidates([]);
      return;
    }
    (async () => {
      const withSubdivision = await getHolidays(country, rangeStart, rangeEnd, subdivision);
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

      if (!cancelled) setStateHolidayCandidates(stateOnly);
    })();
    return () => {
      cancelled = true;
    };
  }, [country, rangeStart, rangeEnd, subdivision]);

  // BUG FOUND (Phase 2): nationalHolidays can't be used for this - getHolidaysWithStatus's
  // own subdivision filter strips every county-specific holiday out when no subdivision is
  // passed (see getSubdivisionCandidates's comment in holidays.ts for the empirical check
  // that found this). Fetched separately via the one function that bypasses that filter.
  const [subdivisionCandidates, setSubdivisionCandidates] = useState<Holiday[]>([]);
  useEffect(() => {
    let cancelled = false;
    getSubdivisionCandidates(country, rangeStart, rangeEnd).then((holidays) => {
      if (!cancelled) setSubdivisionCandidates(holidays);
    });
    return () => {
      cancelled = true;
    };
  }, [country, rangeStart, rangeEnd]);

  const discoveredSubdivisions = useMemo(() => discoverSubdivisions(subdivisionCandidates), [subdivisionCandidates]);

  const holidayEntries: HolidayEntry[] = useMemo(() => {
    const national: HolidayEntry[] = nationalHolidays
      .filter((h) => !removedHolidays.has(`${h.date}|${h.name}`))
      .map((h) => ({ date: h.date, name: h.name, source: 'public' as const, checked: true }));
    const state: HolidayEntry[] = stateHolidayCandidates
      .filter((h) => !removedHolidays.has(`${h.date}|${h.name}`))
      .map((h) => ({
        date: h.date,
        name: h.name,
        source: 'state' as const,
        checked: checkedStateHolidays.has(`${h.date}|${h.name}`),
      }));
    const custom = customHolidays.filter((h) => !removedHolidays.has(`${h.date}|${h.name}`));
    return [...national, ...state, ...custom].sort((a, b) => a.date.localeCompare(b.date));
  }, [nationalHolidays, stateHolidayCandidates, checkedStateHolidays, customHolidays, removedHolidays]);

  // A pinned (forced 'include') day is NOT free - it must cost a real PTO day, unlike a
  // holiday. It used to be merged into offDays here, which made the solver treat it as
  // already-off and never actually guaranteed it would appear in the plan at all (confirmed
  // broken at breakCount=1 and breakCount=7 - see NOTES.md). It's passed separately as
  // mustIncludeDays now; solve() itself reserves its cost and guarantees its presence.
  // The 9/80 off-Fridays within the current range - computed and merged exactly like a
  // holiday list (free, no PTO cost), not treated as a weekend via workWeek, since
  // workWeek has no notion of week parity (see calendarMath.ts's own comment).
  const altFridayOffDates = useMemo(() => {
    if (!altFridayEnabled || !altFridayStart) return [];
    return rangeISO(rangeStart, rangeEnd).filter((d) => isAlternatingFridayOff(d, altFridayStart));
  }, [altFridayEnabled, altFridayStart, rangeStart, rangeEnd]);

  const effectiveOffDays = useMemo(() => {
    const set = new Set(holidayEntries.filter((h) => h.checked).map((h) => h.date));
    for (const d of altFridayOffDates) set.add(d);
    return Array.from(set);
  }, [holidayEntries, altFridayOffDates]);

  const mustIncludeDays = useMemo(
    () => Object.entries(forced).filter(([, state]) => state === 'include').map(([date]) => date),
    [forced],
  );

  const effectiveBlackouts = useMemo(() => {
    const set = new Set(blackouts);
    for (const [date, state] of Object.entries(forced)) {
      if (state === 'exclude') set.add(date);
    }
    return Array.from(set);
  }, [blackouts, forced]);

  // Phase 3.1: reserve days are subtracted from the budget before the solver ever sees it -
  // a plain subtraction, not new solver logic. Clamped at 0 (reserving more than the whole
  // balance just means nothing is planned, not a negative budget).
  const effectiveBudget = Math.max(0, budget - reserveDays);

  const solveInput: SolveInput = useMemo(
    () => ({
      offDays: effectiveOffDays,
      rangeStart,
      rangeEnd,
      budget: effectiveBudget,
      accrualPerMonth: accrualEnabled ? accrualPerMonth : undefined,
      expiryDate: expiryEnabled ? expiryDate : undefined,
      carryoverCap: expiryEnabled ? carryoverCap : undefined,
      blackouts: effectiveBlackouts,
      mustIncludeDays,
      overlapDays,
      workWeek,
      country,
      w,
      breakCount,
    }),
    [
      effectiveOffDays,
      mustIncludeDays,
      rangeStart,
      rangeEnd,
      effectiveBudget,
      accrualEnabled,
      accrualPerMonth,
      expiryEnabled,
      expiryDate,
      carryoverCap,
      effectiveBlackouts,
      overlapDays,
      workWeek,
      country,
      w,
      breakCount,
    ],
  );

  // Validation gate: end-before-start, a negative/absurd PTO budget, or an expiry date
  // outside the selected range are all inputs the solver would otherwise either crash on
  // or "handle" by silently producing a meaningless plan. Per spec, the UI shows an inline
  // message AND keeps the last good plan on screen rather than collapsing to an empty
  // state the moment a field becomes invalid mid-edit (e.g. the instant a user starts
  // retyping the end date and it briefly precedes the start date).
  const validationIssues = useMemo(
    () => validateInputs({ rangeStart, rangeEnd, budget, expiryEnabled, expiryDate }),
    [rangeStart, rangeEnd, budget, expiryEnabled, expiryDate],
  );
  const isValidInput = validationIssues.length === 0;

  const EMPTY_RESULT: SolveResult = { primary: [], alternatives: [], breakCountRequested: 0, breakCountActual: 0, budgetSpent: 0 };
  const lastGoodResultRef = useRef<SolveResult>(EMPTY_RESULT);
  const lastGoodScoresRef = useRef<Scores | null>(null);

  const solveResult = useMemo(() => {
    if (!isValidInput) return lastGoodResultRef.current;
    try {
      const result = solve(solveInput);
      lastGoodResultRef.current = result;
      return result;
    } catch {
      // An unexpected solver throw on otherwise-valid input: still keep the last good plan
      // on screen rather than blanking it, same as a validation failure would.
      return lastGoodResultRef.current;
    }
  }, [solveInput, isValidInput]);

  const breaks = solveResult.primary;
  const alternatives = solveResult.alternatives;
  const breakCountRequested = solveResult.breakCountRequested;
  const breakCountActual = solveResult.breakCountActual;
  const budgetSpent = solveResult.budgetSpent;

  // Summary strip: total days off/PTO spent plus the indexed Efficiency/Travel scores.
  const totalDaysOff = useMemo(() => totalDaysOffOf(breaks), [breaks]);

  // computeScores sweeps SCORE_W_SWEEP (up to 6 extra full solve() calls) to build the
  // efficiency distribution - cheap for a normal few-month range, but a full-year range can
  // make a single solve() cost ~100ms+, so the sweep alone can run past half a second. Doing
  // that inside a render-blocking useMemo made every click on a full-year calendar feel
  // frozen - found by actually timing a full-year interaction live, not by inspection; see
  // NOTES.md Phase 5 performance section. Computed in a useEffect instead (runs after the
  // commit/paint, deferred one more tick via setTimeout so the browser gets a chance to
  // paint the already-fast `breaks`/`totalDaysOff` update first) rather than blocking the
  // render that updates the calendar and break list - the score line may lag the rest of
  // the UI by a moment on a large range, which is a far better trade than the whole page
  // feeling unresponsive. The computation itself is untouched; only when it runs changed.
  const [scores, setScores] = useState<Scores | null>(null);
  useEffect(() => {
    if (!isValidInput) {
      setScores(lastGoodScoresRef.current);
      return;
    }
    const timer = setTimeout(() => {
      const result = computeScores(solveInput, solveResult);
      lastGoodScoresRef.current = result;
      setScores(result);
    }, 0);
    return () => clearTimeout(timer);
  }, [solveInput, solveResult, isValidInput]);

  // Briefly highlight breaks that are new since the last plan, so a slider move's effect
  // on the calendar/break list is visible, not just inferable from the summary numbers.
  const [highlightedBreakIds, setHighlightedBreakIds] = useState<Set<string>>(new Set());
  const prevBreakIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const prevIds = prevBreakIdsRef.current;
    const currentIds = new Set(breaks.map((b) => b.id));
    // 'Solve completed': fired once per distinct successful plan (including the first,
    // default one) - not on every slider tick that happens to leave the plan unchanged.
    if (currentIds.size > 0 && (!prevIds || [...currentIds].some((id) => !prevIds.has(id)))) {
      track('Solve completed');
    }
    if (prevIds) {
      const changed = new Set([...currentIds].filter((id) => !prevIds.has(id)));
      if (changed.size > 0) {
        setHighlightedBreakIds(changed);
        const timer = setTimeout(() => setHighlightedBreakIds(new Set()), 2500);
        prevBreakIdsRef.current = currentIds;
        return () => clearTimeout(timer);
      }
    }
    prevBreakIdsRef.current = currentIds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breaks]);

  const weekStart: WeekStart = weekStartOverride === 'auto' ? weekStartForCountry(country) : weekStartOverride;

  // Recomputed once per solve (not per mouseover) and cached here; DayCell just reads the map.
  const marginalValues = useMemo(() => computeMarginalValues(solveInput, breaks), [solveInput, breaks]);

  const holidayNameFor = useCallback(
    (iso: string): string | undefined => holidayEntries.find((h) => h.date === iso && h.checked)?.name,
    [holidayEntries],
  );

  const baseOffSet = useMemo(() => new Set(effectiveOffDays), [effectiveOffDays]);
  const blackoutSet = useMemo(() => new Set(effectiveBlackouts), [effectiveBlackouts]);
  const chosenDaySet = useMemo(() => {
    const set = new Set<string>();
    for (const b of breaks) for (const d of b.days) set.add(d);
    return set;
  }, [breaks]);
  const overlapSet = useMemo(() => new Set(overlapDays), [overlapDays]);

  const isWeekendDay = useCallback((iso: string) => !workWeek[mondayIndexedDow(iso)], [workWeek]);
  const isBlackoutDay = useCallback((iso: string) => blackoutSet.has(iso), [blackoutSet]);

  const categoryOf = useCallback(
    (iso: string): DayCategory =>
      classifyDay({
        isBlackout: blackoutSet.has(iso),
        forcedState: forced[iso],
        isBaseOff: baseOffSet.has(iso),
        isWeekend: isWeekendDay(iso),
        isChosen: chosenDaySet.has(iso),
      }),
    [blackoutSet, forced, baseOffSet, chosenDaySet, isWeekendDay],
  );

  const isOffForBand = useCallback(
    (iso: string) => {
      if (blackoutSet.has(iso)) return false;
      return baseOffSet.has(iso) || isWeekendDay(iso) || chosenDaySet.has(iso);
    },
    [blackoutSet, baseOffSet, isWeekendDay, chosenDaySet],
  );

  // A day the plan actually converted from work to PTO, OR one the user explicitly
  // pinned in - either is "a day you're taking," the thing that makes a run "qualify" for
  // a band, as opposed to a weekend or holiday nobody spent PTO on.
  const isSuggestedPto = useCallback(
    (iso: string) => {
      if (blackoutSet.has(iso)) return false;
      if (forced[iso] === 'include') return true;
      const wasOff = baseOffSet.has(iso) || isWeekendDay(iso);
      return !wasOff && chosenDaySet.has(iso);
    },
    [blackoutSet, forced, baseOffSet, isWeekendDay, chosenDaySet],
  );

  const offRuns = useMemo(
    () => computeQualifyingRuns(rangeStart, rangeEnd, isOffForBand, isSuggestedPto),
    [rangeStart, rangeEnd, isOffForBand, isSuggestedPto],
  );

  // Chronological (start-date) order with a 1-based index - "break 1" is always the
  // earliest break in the plan, regardless of solve order. The SAME numbering both the
  // calendar's badges (via breakBandByRunIndex below) and the break cards (App.tsx) use,
  // so the two can never drift apart into showing different numbers for the same break.
  const orderedBreaks = useMemo(
    () => [...breaks].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)).map((brk, i) => ({ index: i + 1, brk })),
    [breaks],
  );

  /**
   * Maps each qualifying run to the break it belongs to, plus its 1-based number from
   * `orderedBreaks`. A run and a break correspond 1:1 in every real case: `offRuns` only
   * ever includes a run because it contains at least one chosen (break) day, breaks never
   * overlap each other, and two distinct breaks are only ever "adjacent" with zero working
   * days between them if the solver chose to run them together - which would make them one
   * break, not two. Still looked up defensively (by containment, not index alignment)
   * rather than assumed, so a mismatch renders no label instead of a wrong one.
   */
  const breakBandByRunIndex = useMemo(() => {
    const map = new Map<number, { index: number; brk: Break }>();
    offRuns.forEach((run, runIndex) => {
      const entry = orderedBreaks.find(({ brk }) => brk.start >= run.start && brk.end <= run.end);
      if (entry) map.set(runIndex, entry);
    });
    return map;
  }, [offRuns, orderedBreaks]);

  // Hovering/focusing a break card highlights that break's days in the calendar, and
  // hovering/focusing its calendar badge highlights the card - one shared id drives both
  // directions, rather than two separate pieces of state that could disagree.
  const [hoveredBreakId, setHoveredBreakId] = useState<string | null>(null);
  const hoveredBreakDaySet = useMemo(() => {
    const brk = breaks.find((b) => b.id === hoveredBreakId);
    return new Set(brk?.days ?? []);
  }, [breaks, hoveredBreakId]);

  // Every day this plan results in being off (weekends, holidays, suggested PTO combined) -
  // the payload a "share my days" partner-overlap link hands to its recipient.
  const allDaysOff = useMemo(
    () => rangeISO(rangeStart, rangeEnd).filter(isOffForBand),
    [rangeStart, rangeEnd, isOffForBand],
  );

  const buildOverlapLink = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return buildOverlapShareURL(window.location.origin, window.location.pathname, allDaysOff);
  }, [allDaysOff]);

  // Alternatives don't mean much once the plan is already fragmented into many short
  // breaks (breakCount near 7) - there's rarely a meaningful "placement" to swap to.
  const showAlternativesEffective = showAlternatives && breakCount < 7;

  const alternativeForDate = useCallback(
    (iso: string): Alternative | undefined =>
      alternativeForDateImpl(iso, alternatives, chosenDaySet, showAlternativesEffective),
    [alternatives, showAlternativesEffective, chosenDaySet],
  );

  // Picking a new country always resets any previously-selected subdivision - a stale
  // US state code carried over into a country with its own (or no) subdivisions was
  // previously the UI component's job to clear; moved here so every caller gets it for
  // free, now that the subdivision picker is a separate component from CountrySelect.
  const changeCountry = useCallback((code: string) => {
    setCountry(code);
    setSubdivision(undefined);
  }, []);

  const hoveredAlternative = useMemo(
    () => alternatives.find((a) => a.id === hoveredAlternativeId),
    [alternatives, hoveredAlternativeId],
  );

  const [pinnedPlans, setPinnedPlans] = useState<PlanSnapshot[]>([]);
  const canPin = pinnedPlans.length < MAX_PINNED_PLANS;

  const pinPlan = useCallback(() => {
    setPinnedPlans((prev) => {
      if (prev.length >= MAX_PINNED_PLANS) return prev;
      const snapshot: PlanSnapshot = {
        country,
        subdivision,
        rangeStart,
        rangeEnd,
        budget,
        w,
        letSolverDecide,
        manualBreakCount,
        weekStartOverride,
        accrualEnabled,
        accrualPerMonth,
        expiryEnabled,
        expiryDate,
        carryoverCap,
        overlapDays,
        blackouts,
        workWeek,
        forced,
        altFridayEnabled,
        altFridayStart,
        reserveDays,
        unlimitedPto,
        summary: {
          budgetSpent,
          totalDaysOff,
          breakCountActual,
          travelPercentile: scores?.travel.percentile ?? null,
        },
      };
      return [...prev, snapshot];
    });
  }, [
    country, subdivision, rangeStart, rangeEnd, budget, w, letSolverDecide, manualBreakCount,
    weekStartOverride, accrualEnabled, accrualPerMonth, expiryEnabled, expiryDate, carryoverCap,
    overlapDays, blackouts, workWeek, forced, altFridayEnabled, altFridayStart,
    reserveDays, unlimitedPto, budgetSpent, totalDaysOff, breakCountActual, scores,
  ]);

  // Restores every input the snapshot carries - the raw setters (not `changeCountry`, which
  // also clears subdivision) so a pinned plan's subdivision comes back too.
  const restorePlan = useCallback(
    (index: number) => {
      const snap = pinnedPlans[index];
      if (!snap) return;
      setCountry(snap.country);
      setSubdivision(snap.subdivision);
      setRangeStart(snap.rangeStart);
      setRangeEnd(snap.rangeEnd);
      setBudget(snap.budget);
      setW(snap.w);
      setLetSolverDecide(snap.letSolverDecide);
      setManualBreakCount(snap.manualBreakCount);
      setWeekStartOverride(snap.weekStartOverride);
      setAccrualEnabled(snap.accrualEnabled);
      setAccrualPerMonth(snap.accrualPerMonth);
      setExpiryEnabled(snap.expiryEnabled);
      setExpiryDate(snap.expiryDate);
      setCarryoverCap(snap.carryoverCap);
      setOverlapDays(snap.overlapDays);
      setBlackouts(snap.blackouts);
      setWorkWeek(snap.workWeek);
      setForced(snap.forced);
      setAltFridayEnabled(snap.altFridayEnabled);
      setAltFridayStart(snap.altFridayStart);
      setReserveDays(snap.reserveDays);
      setUnlimitedPtoRaw(snap.unlimitedPto);
    },
    [pinnedPlans],
  );

  const removePinnedPlan = useCallback((index: number) => {
    setPinnedPlans((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleDay = useCallback((date: string) => {
    setForced((prev) => {
      const current = prev[date];
      const next = { ...prev };
      if (!current) next[date] = 'include';
      else if (current === 'include') next[date] = 'exclude';
      else delete next[date];
      return next;
    });
  }, []);

  const swapAlternative = useCallback(
    (alt: Alternative) => {
      const oldBreak = breaks.find((b) => b.start === alt.replaces.start && b.end === alt.replaces.end);
      if (!oldBreak) return;
      const oldCostDays = oldBreak.days.filter((d) => !baseOffSet.has(d) && !isWeekendDay(d));
      setForced((prev) => {
        const next = { ...prev };
        for (const d of oldCostDays) next[d] = 'exclude';
        return next;
      });
      setHoveredAlternativeId(null);
    },
    [breaks, baseOffSet, isWeekendDay],
  );

  return {
    validationIssues,
    holidaysDegraded,
    country,
    setCountry: changeCountry,
    subdivision,
    setSubdivision,
    discoveredSubdivisions,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    budget,
    setBudget,
    reserveDays,
    setReserveDays,
    unlimitedPto,
    setUnlimitedPto,
    effectiveBudget,
    noticePeriodDays,
    setNoticePeriodDays,
    w,
    setW,
    breakCount,
    letSolverDecide,
    setLetSolverDecide,
    manualBreakCount,
    setManualBreakCount,
    breakCountRequested,
    breakCountActual,
    budgetSpent,
    showAlternatives,
    setShowAlternatives,
    weekStart,
    weekStartOverride,
    setWeekStartOverride,
    marginalValues,
    holidayNameFor,
    totalDaysOff,
    scores,
    highlightedBreakIds,
    accrualEnabled,
    setAccrualEnabled,
    accrualPerMonth,
    setAccrualPerMonth,
    expiryEnabled,
    setExpiryEnabled,
    expiryDate,
    setExpiryDate,
    carryoverCap,
    setCarryoverCap,
    overlapDays,
    setOverlapDays,
    allDaysOff,
    buildOverlapLink,
    partnerOverlapReceived,
    dismissPartnerOverlapBanner: () => setPartnerOverlapReceived(false),
    workWeek,
    setWorkWeek,
    blackouts,
    setBlackouts,
    altFridayEnabled,
    setAltFridayEnabled,
    altFridayStart,
    setAltFridayStart,
    holidayEntries,
    removeHoliday: (date: string, name: string) =>
      setRemovedHolidays((s) => new Set(s).add(`${date}|${name}`)),
    toggleStateHoliday: (date: string, name: string) =>
      setCheckedStateHolidays((s) => {
        const key = `${date}|${name}`;
        const next = new Set(s);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    addCustomHoliday: (date: string, name: string) =>
      setCustomHolidays((list) => [...list, { date, name, source: 'custom' as const, checked: true }]),
    breaks,
    orderedBreaks,
    alternatives,
    showAlternativesEffective,
    alternativeForDate,
    hoveredAlternativeId,
    setHoveredAlternativeId,
    hoveredAlternative,
    hoveredBreakId,
    setHoveredBreakId,
    hoveredBreakDaySet,
    swapAlternative,
    categoryOf,
    isBlackoutDay,
    isSuggestedPto,
    overlapSet,
    offRuns,
    breakBandByRunIndex,
    toggleDay,
    forced,
    pinnedPlans,
    canPin,
    pinPlan,
    restorePlan,
    removePinnedPlan,
  };
}

export type AppState = ReturnType<typeof useAppState>;
