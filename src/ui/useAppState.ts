import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { solve, computeScores } from '../solver/solve';
import { computeMarginalValues } from '../solver/marginalValue';
import type { Alternative, SolveInput, WorkWeek } from '../solver/types';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import { getHolidays, type Holiday } from '../data/holidays';
import { getStateHolidaysFallback } from '../data/usStateHolidays';
import { geolocateCountry } from './geo';
import { computeQualifyingRuns, type WeekStart } from './calendarMath';
import { weekStartForCountry } from './locale';
import { mondayIndexedDow, rangeISO } from '../solver/dateUtils';
import { readFullStateFromURL, writeFullStateToURL, readOverlapPayloadFromURL, buildOverlapShareURL } from './urlState';
import type { DayCategory, ForcedState } from './types';
import { classifyDay } from './dayCategory';
import { alternativeForDate as alternativeForDateImpl } from './alternativeForDate';

/** The slider's own stored position while unchecked - also what it falls back to showing
 * (disabled) when "let the solver decide" is checked. The middle of the 1-7 range, so
 * unchecking the box for the first time doesn't default to either extreme. */
const DEFAULT_MANUAL_BREAK_COUNT = 4;

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function defaultRangeEnd(): string {
  return `${new Date().getFullYear()}-12-31`;
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
      rangeEnd: defaultRangeEnd(),
      budget: 15,
      country: geolocateCountry(),
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
      };
    }
    return readFullStateFromURL(window.location.search, defaults);
  }, []);

  const [country, setCountry] = useState<string>(initial.country ?? geolocateCountry());
  const [subdivision, setSubdivision] = useState<string | undefined>(initial.subdivision);
  const [rangeStart, setRangeStart] = useState(initial.rangeStart);
  const [rangeEnd, setRangeEnd] = useState(initial.rangeEnd);
  const [budget, setBudget] = useState(initial.budget);

  const [w, setW] = useState(initial.w);
  // breakCount 0 from the URL ("Any", now spelled "let the solver decide") maps to the
  // checkbox being checked; 1-7 maps to it being unchecked with that exact slider position.
  const [letSolverDecide, setLetSolverDecide] = useState(initial.breakCount === 0);
  const [manualBreakCount, setManualBreakCount] = useState(
    initial.breakCount === 0 ? DEFAULT_MANUAL_BREAK_COUNT : initial.breakCount,
  );
  const breakCount = letSolverDecide ? 0 : manualBreakCount;
  const [showAlternatives, setShowAlternatives] = useState(true);
  const [hoveredAlternativeId, setHoveredAlternativeId] = useState<string | null>(null);

  // 'auto' follows the selected country's convention; an explicit override wins.
  const [weekStartOverride, setWeekStartOverride] = useState<WeekStart | 'auto'>(initial.weekStartOverride);

  const [accrualEnabled, setAccrualEnabled] = useState(initial.accrualEnabled);
  const [accrualPerMonth, setAccrualPerMonth] = useState(initial.accrualPerMonth);

  const [expiryEnabled, setExpiryEnabled] = useState(initial.expiryEnabled);
  const [expiryDate, setExpiryDate] = useState(initial.expiryDate ?? defaultRangeEnd());
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
  const [workWeek, setWorkWeek] = useState<WorkWeek>(initial.workWeek);
  const [blackouts, setBlackouts] = useState<string[]>(initial.blackouts);

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
  ]);

  useEffect(() => {
    let cancelled = false;
    getHolidays(country, rangeStart, rangeEnd).then((hs) => {
      if (!cancelled) setNationalHolidays(hs);
    });
    return () => {
      cancelled = true;
    };
  }, [country, rangeStart, rangeEnd]);

  useEffect(() => {
    let cancelled = false;
    if (country !== 'US' || !subdivision) {
      setStateHolidayCandidates([]);
      return;
    }
    (async () => {
      const withSubdivision = await getHolidays(country, rangeStart, rangeEnd, subdivision);
      const stateOnly = withSubdivision.filter((h) => h.counties);

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

      if (!cancelled) setStateHolidayCandidates(stateOnly);
    })();
    return () => {
      cancelled = true;
    };
  }, [country, rangeStart, rangeEnd, subdivision]);

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

  const effectiveOffDays = useMemo(() => {
    const set = new Set(holidayEntries.filter((h) => h.checked).map((h) => h.date));
    for (const [date, state] of Object.entries(forced)) {
      if (state === 'include') set.add(date);
    }
    return Array.from(set);
  }, [holidayEntries, forced]);

  const effectiveBlackouts = useMemo(() => {
    const set = new Set(blackouts);
    for (const [date, state] of Object.entries(forced)) {
      if (state === 'exclude') set.add(date);
    }
    return Array.from(set);
  }, [blackouts, forced]);

  const solveInput: SolveInput = useMemo(
    () => ({
      offDays: effectiveOffDays,
      rangeStart,
      rangeEnd,
      budget,
      accrualPerMonth: accrualEnabled ? accrualPerMonth : undefined,
      expiryDate: expiryEnabled ? expiryDate : undefined,
      carryoverCap: expiryEnabled ? carryoverCap : undefined,
      blackouts: effectiveBlackouts,
      overlapDays,
      workWeek,
      country,
      w,
      breakCount,
    }),
    [
      effectiveOffDays,
      rangeStart,
      rangeEnd,
      budget,
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

  const solveResult = useMemo(() => {
    try {
      return solve(solveInput);
    } catch {
      return { primary: [], alternatives: [], breakCountRequested: breakCount, breakCountActual: 0, budgetSpent: 0 };
    }
  }, [solveInput, breakCount]);

  const breaks = solveResult.primary;
  const alternatives = solveResult.alternatives;
  const breakCountRequested = solveResult.breakCountRequested;
  const breakCountActual = solveResult.breakCountActual;
  const budgetSpent = solveResult.budgetSpent;

  // Summary strip: total days off/PTO spent plus the indexed Efficiency/Travel scores,
  // recomputed on every solve from the same input+result the rest of the app already has.
  const totalDaysOff = useMemo(() => totalDaysOffOf(breaks), [breaks]);
  const scores = useMemo(() => computeScores(solveInput, solveResult), [solveInput, solveResult]);

  // Briefly highlight breaks that are new since the last plan, so a slider move's effect
  // on the calendar/break list is visible, not just inferable from the summary numbers.
  const [highlightedBreakIds, setHighlightedBreakIds] = useState<Set<string>>(new Set());
  const prevBreakIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const prevIds = prevBreakIdsRef.current;
    const currentIds = new Set(breaks.map((b) => b.id));
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

  const hoveredAlternative = useMemo(
    () => alternatives.find((a) => a.id === hoveredAlternativeId),
    [alternatives, hoveredAlternativeId],
  );

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
    country,
    setCountry,
    subdivision,
    setSubdivision,
    rangeStart,
    setRangeStart,
    rangeEnd,
    setRangeEnd,
    budget,
    setBudget,
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
    alternatives,
    showAlternativesEffective,
    alternativeForDate,
    hoveredAlternativeId,
    setHoveredAlternativeId,
    hoveredAlternative,
    swapAlternative,
    categoryOf,
    isBlackoutDay,
    isSuggestedPto,
    overlapSet,
    offRuns,
    toggleDay,
    forced,
  };
}

export type AppState = ReturnType<typeof useAppState>;
