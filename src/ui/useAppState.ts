import { getConsumerHolidaysWithStatus as getHolidaysWithStatus, getConsumerSubdivisionCandidates as getSubdivisionCandidates, readPreloadedConsumerHolidays } from '../personal/consumerHolidays';
import { SUBDIVISION_NAMES } from '@daysoff/engine/data/countries';
import { planningStyleSettings, type PlanningStyle } from '../planning/optimizer';
import { previewPinnedDay, type PinPreview } from './pinPreview';
import { defaultEmployerCalendar, readEmployerCalendar, saveEmployerCalendar, deleteEmployerCalendar, employerScope, validCalendarDate, encodeEmployerCalendar, type EmployerCalendar } from '../personal/employerCalendar';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { computeMarginalValues } from '@daysoff/engine/solver/marginalValue';
import type { Alternative, Break, SolveInput, WorkWeek } from '@daysoff/engine/solver/types';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { Holiday, HolidayFetchResult } from '@daysoff/engine/data/holidays';
import { geolocateCountry } from './geo';
import { activeCountryPreset } from '@daysoff/engine/data/countryPresets';
import { computeQualifyingRuns, type WeekStart } from '@daysoff/engine/calendar/calendarMath';
import { weekStartForCountry } from './locale';
import { isoToSerial, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { readBrowserPlanSearch, readBrowserFullState, writeBrowserPlanStateToURL, writeFullStateToURL, readOverlapPayloadFromURL, buildOverlapShareURL, type FullURLState, type WriteStateInput } from './urlState';
import type { DayCategory, ForcedState } from './types';
import { classifyDay } from './dayCategory';
import { alternativeForDate as alternativeForDateImpl } from './alternativeForDate';
import { track } from './analytics';
import { validateInputs, isSupportedPlanningRange } from './validation';
import { defaultRangeEnd, defaultPlanRangeEnd, holidayEntriesFor, stateHolidayCandidatesFor, altFridayOffDatesFor, effectiveOffDaysFor, mustIncludeDaysFor, effectiveBlackoutsFor, effectiveBudgetFor, policyAccrualFieldsFor, buildSolveInput, isSuggestedPtoDay, type HolidayEntry } from '../autopilot/planFromSearch';
import { todayISO } from './today';
import { plannerRequestCommitments, type PtoRequest } from '../personal/requestLedger';
import { usePlannerComputation } from '../planning/usePlannerComputation';
import { MAX_PINNED_PLANS, usePinnedPlans } from './pinnedPlanStore';

export { defaultRangeEnd };
export type { HolidayEntry };

/** The slider's own stored position while unchecked - also what it falls back to showing
 * (disabled) when "let the solver decide" is checked. The middle of the 1-7 range, so
 * unchecking the box for the first time doesn't default to either extreme. */
const DEFAULT_MANUAL_BREAK_COUNT = 4;

export { todayISO };

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
  planningVersion?: 2;
  planningStyle: PlanningStyle;
  minimumBreakDays: number;
  employerCalendar: EmployerCalendar;
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
  applyTrackedRequests: boolean;
  reserveApprovedPto: boolean;
  unlimitedPto: boolean;
  noticePeriodDays: number;
  peakCapEnabled: boolean;
  peakCapStart: string;
  peakCapEnd: string;
  peakCapMaxDays: number;
  summary: {
    budgetSpent: number;
    totalDaysOff: number;
    breakCountActual: number;
    travelPercentile: number | null;
  };
}

const NO_REQUESTS: readonly PtoRequest[] = [];
const NO_HOLIDAYS: Holiday[] = [];

interface LoadedHolidayScope extends HolidayFetchResult {
  scope: string;
}

export function useAppState(requests: readonly PtoRequest[] = NO_REQUESTS, balanceAsOf = todayISO()) {
  const initial = useMemo<FullURLState>(() => {
    const defaults = {
      rangeStart: todayISO(),
      // The next 12 months, the same default the homepage preview uses, so the planner and the
      // homepage show the same plan for the same inputs (a bare /pto in November used to plan
      // only the 8 weeks left in the year).
      rangeEnd: defaultPlanRangeEnd(todayISO()),
      budget: 15,
      // A country landing page's preset wins over the geolocated guess - a visitor to
      // /uk should see GB selected regardless of their own browser locale - but an
      // explicit `c` URL param (e.g. a shared link that happens to open on that route)
      // still wins over both, same priority order readFullStateFromURL already applies.
      country: activeCountryPreset()?.code ?? geolocateCountry(),
    };
    if (typeof window === 'undefined') {
      return {
        employerCalendar: undefined as EmployerCalendar | undefined,
        planningVersion: 2 as const,
        planningStyle: 'balanced' as PlanningStyle,
        minimumBreakDays: 3,
        country: defaults.country,
        subdivision: undefined,
        rangeStart: defaults.rangeStart,
        rangeEnd: defaults.rangeEnd,
        budget: defaults.budget,
        w: 30,
        breakCount: 3,
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
        peakCapEnabled: false,
        peakCapStart: undefined,
        peakCapEnd: undefined,
        peakCapMaxDays: 5,
      };
    }
    return readBrowserFullState(window.location.search, window.history.state, defaults);
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
  const localApprovalOptions = typeof window === 'undefined' ? undefined : window.history.state?.plannerApprovalOptions;
  const [reserveApprovedPto, setReserveApprovedPto] = useState(localApprovalOptions?.reserve === true);
  const [applyTrackedRequests, setApplyTrackedRequests] = useState(
    typeof localApprovalOptions?.apply === 'boolean' ? localApprovalOptions.apply : initial.publicShareVersion !== 1 && !initial.landingPreview,
  );
  const [useSharedHolidaySnapshot, setUseSharedHolidaySnapshot] = useState(initial.sharedObservedHolidays !== undefined);
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

  // Phase 5.1: an employer policy cap on how much PTO can be spent inside one window (e.g.
  // "no more than 5 days between Jun and Aug") - off by default, a soft default for most
  // visitors, not a limit this tool assumes. See solve.ts's enforcePeakCap for how the
  // solver honours it (never overriding a day the user has explicitly pinned).
  const [peakCapEnabled, setPeakCapEnabled] = useState(initial.peakCapEnabled ?? false);
  const [peakCapStart, setPeakCapStart] = useState(initial.peakCapStart ?? '');
  const [peakCapEnd, setPeakCapEnd] = useState(initial.peakCapEnd ?? '');
  const [peakCapMaxDays, setPeakCapMaxDays] = useState(initial.peakCapMaxDays ?? 5);

  const [planningVersion, setPlanningVersion] = useState<2 | undefined>(initial.planningVersion);
  const [planningStyle, setPlanningStyleRaw] = useState<PlanningStyle>(initial.planningStyle ?? 'custom');
  const [minimumBreakDays, setMinimumBreakDaysRaw] = useState(initial.minimumBreakDays ?? 0);
  const [w, setWRaw] = useState(initial.w);
  // breakCount 0 from the URL ("Any", now spelled "let the solver decide") maps to the
  // checkbox being checked; 1-7 maps to it being unchecked with that exact slider position.
  const [letSolverDecide, setLetSolverDecideRaw] = useState(initial.breakCount === 0);
  const [manualBreakCount, setManualBreakCountRaw] = useState(
    initial.breakCount === 0 ? DEFAULT_MANUAL_BREAK_COUNT : initial.breakCount,
  );
  const breakCount = letSolverDecide ? 0 : manualBreakCount;
  const setPlanningStyle = useCallback((style: PlanningStyle) => {
    setPlanningVersion(2);
    setPlanningStyleRaw(style);
    const preset = planningStyleSettings(style);
    if (preset) { setWRaw(preset.w); setLetSolverDecideRaw(preset.breakCount === 0); if (preset.breakCount) setManualBreakCountRaw(preset.breakCount); }
  }, []);
  const setMinimumBreakDays = useCallback((days: number) => { setPlanningVersion(2); setMinimumBreakDaysRaw(days); }, []);
  const setW = useCallback((value: number) => { setPlanningVersion(2); setPlanningStyleRaw('custom'); setWRaw(value); }, []);
  const setLetSolverDecide = useCallback((value: boolean) => { setPlanningVersion(2); setPlanningStyleRaw('custom'); setLetSolverDecideRaw(value); }, []);
  const setManualBreakCount = useCallback((value: number) => { setPlanningVersion(2); setPlanningStyleRaw('custom'); setManualBreakCountRaw(value); }, []);
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
    () => (typeof window === 'undefined' ? [] : readOverlapPayloadFromURL(readBrowserPlanSearch(window.location.search, window.history.state))),
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

  const nationalHolidayScope = `${country}|${rangeStart}|${rangeEnd}`;
  const regionalHolidayScope = `${nationalHolidayScope}|${subdivision ?? ''}`;
  const preloadedNational = useMemo(() => readPreloadedConsumerHolidays(country, rangeStart, rangeEnd), [country, rangeStart, rangeEnd]);
  const preloadedRegional = useMemo(() => {
    if (!subdivision) return;
    const holidays = readPreloadedConsumerHolidays(country, rangeStart, rangeEnd, subdivision);
    return holidays && stateHolidayCandidatesFor(holidays, country, subdivision, rangeStart, rangeEnd);
  }, [country, subdivision, rangeStart, rangeEnd]);
  const [nationalCalendar, setNationalCalendar] = useState<LoadedHolidayScope | null>(null);
  const [regionalCalendar, setRegionalCalendar] = useState<LoadedHolidayScope | null>(null);
  const holidayFocusDate = country === initial.country && subdivision === initial.subdivision && initial.holidayFocusDate
    && initial.holidayFocusDate >= rangeStart && initial.holidayFocusDate <= rangeEnd ? initial.holidayFocusDate : undefined;
  const currentEmployerScope = employerScope(country, subdivision);
  const sharedObservedHolidays = useSharedHolidaySnapshot && country === initial.country && subdivision === initial.subdivision
    && rangeStart === initial.rangeStart && rangeEnd === initial.rangeEnd ? initial.sharedObservedHolidays : undefined;
  const calendarForScope = useCallback(() => sharedObservedHolidays !== undefined
    ? defaultEmployerCalendar(country, subdivision) : readEmployerCalendar(country, subdivision),
    [sharedObservedHolidays, country, subdivision]);
  const [employerCalendars, setEmployerCalendars] = useState<Record<string, EmployerCalendar>>(() => ({
    [currentEmployerScope]: initial.employerCalendar ?? calendarForScope(),
  }));
  const employerCalendar = useMemo(() => employerCalendars[currentEmployerScope] ?? calendarForScope(), [employerCalendars, currentEmployerScope, calendarForScope]);
  const restoreMyEmployerCalendar = useCallback(() => {
    setUseSharedHolidaySnapshot(false);
    setEmployerCalendars(previous => ({ ...previous, [currentEmployerScope]: readEmployerCalendar(country, subdivision) }));
  }, [currentEmployerScope, country, subdivision]);
  const [employerCalendarMessage, setEmployerCalendarMessage] = useState('');
  const updateEmployerCalendar = useCallback((update: (current: EmployerCalendar) => EmployerCalendar) => {
    setUseSharedHolidaySnapshot(false);
    setEmployerCalendars(previous => {
      const next = update(previous[currentEmployerScope] ?? calendarForScope());
      if (!encodeEmployerCalendar(next)) { setEmployerCalendarMessage('This calendar is too large to share. Remove an entry before adding another.'); return previous; }
      return { ...previous, [currentEmployerScope]: next };
    });
  }, [currentEmployerScope, calendarForScope]);
  const toggleHoliday = useCallback((date: string, name: string) => {
    updateEmployerCalendar(current => {
      const key = `${date}|${name}`;
      return { ...current, excluded: current.excluded.includes(key) ? current.excluded.filter(item => item !== key) : [...current.excluded, key] };
    });
    setEmployerCalendarMessage('Calendar updated for this plan. Save to use it on future visits.');
    track('holiday_preference_customized');
  }, [updateEmployerCalendar]);
  const saveEmployerHolidays = useCallback(() => {
    if (sharedObservedHolidays !== undefined) return;
    setEmployerCalendarMessage(saveEmployerCalendar(employerCalendar) ? 'Employer calendar saved in this browser.' : 'Browser storage is unavailable. Your changes still apply to this tab.');
  }, [employerCalendar, sharedObservedHolidays]);
  const resetEmployerHolidays = useCallback(() => {
    if (sharedObservedHolidays !== undefined) return;
    const removed = deleteEmployerCalendar(country, subdivision);
    updateEmployerCalendar(() => defaultEmployerCalendar(country, subdivision));
    setEmployerCalendarMessage(removed ? 'Public-holiday defaults restored. Saved customization deleted.' : 'Public-holiday defaults restored for this plan. Browser storage is unavailable.');
  }, [country, subdivision, sharedObservedHolidays, updateEmployerCalendar]);
  const addCustomHoliday = useCallback((date: string, name: string) => {
    if (!validCalendarDate(date)) { setEmployerCalendarMessage('Choose a valid company holiday date.'); return; }
    const cleanName = name.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 160) || 'Company holiday';
    updateEmployerCalendar(current => ({ ...current, custom: [...current.custom.filter(item => item.date !== date || item.name !== cleanName), { date, name: cleanName }], excluded: current.excluded.filter(key => key !== `${date}|${cleanName}`) }));
    setEmployerCalendarMessage('Company holiday added to this plan. Save to keep it in this browser.');
    track('holiday_preference_customized');
  }, [updateEmployerCalendar]);

  const [forced, setForced] = useState<Record<string, ForcedState>>(() => {
    const init: Record<string, ForcedState> = {};
    for (const d of initial.pinnedDays) init[d] = 'include';
    for (const d of initial.ruledOutDays) init[d] = 'exclude';
    return init;
  });

  // Keep a full in-memory snapshot for explicit exports and a safe browser address.
  const urlWriteState: WriteStateInput = useMemo(() => ({
      country,
      subdivision,
      employerCalendar,
      publicShareVersion: initial.publicShareVersion,
      sharedObservedHolidays,
      landingPreview: initial.landingPreview,
      holidayFocusDate,
      planningVersion,
      planningStyle,
      minimumBreakDays,
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
      peakCapEnabled,
      peakCapStart,
      peakCapEnd,
      peakCapMaxDays,
  }), [
    country,
    subdivision,
    employerCalendar,
    initial.publicShareVersion,
    sharedObservedHolidays,
    initial.landingPreview,
    holidayFocusDate,
    planningVersion,
    planningStyle,
    minimumBreakDays,
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
    peakCapEnabled,
    peakCapStart,
    peakCapEnd,
    peakCapMaxDays,
  ]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const historyState = writeBrowserPlanStateToURL(url.searchParams, urlWriteState, window.history.state);
    window.history.replaceState({
      ...historyState,
      plannerApprovalOptions: { apply: applyTrackedRequests, reserve: reserveApprovedPto },
    }, '', url);
  }, [urlWriteState, applyTrackedRequests, reserveApprovedPto]);
  // F1: just this plan's own parameters (no utm or other stray params from the address
  // bar) - the query string the live calendar feed re-solves from.
  const planSearch = useMemo(() => {
    const params = new URLSearchParams();
    writeFullStateToURL(params, urlWriteState);
    return params.toString();
  }, [urlWriteState]);

  // Graceful failure: a network/API failure degrades to cached data (if any was already
  // stored for this country-year) or an empty list - either way the app keeps working with
  // whatever it has (weekends alone still solve a plan) rather than erroring out, but
  // `holidaysDegraded` lets the UI say so instead of silently presenting "no holidays" as
  // if that were a real fact about the calendar.
  useEffect(() => {
    if (preloadedNational !== undefined || !isSupportedPlanningRange(rangeStart, rangeEnd)) return;
    let cancelled = false;
    getHolidaysWithStatus(country, rangeStart, rangeEnd).then(result => {
      if (!cancelled) setNationalCalendar({ ...result, scope: nationalHolidayScope });
    });
    return () => {
      cancelled = true;
    };
  }, [country, rangeStart, rangeEnd, nationalHolidayScope, preloadedNational]);

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
    if (!subdivision || preloadedRegional !== undefined || !isSupportedPlanningRange(rangeStart, rangeEnd)) return;
    let cancelled = false;
    getHolidaysWithStatus(country, rangeStart, rangeEnd, subdivision).then(({ holidays, degraded }) => {
      if (cancelled) return;
      setRegionalCalendar({
        holidays: stateHolidayCandidatesFor(holidays, country, subdivision, rangeStart, rangeEnd),
        degraded,
        scope: regionalHolidayScope,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [country, rangeStart, rangeEnd, subdivision, regionalHolidayScope, preloadedRegional]);

  // BUG FOUND (Phase 2): nationalHolidays can't be used for this - getHolidaysWithStatus's
  // own subdivision filter strips every county-specific holiday out when no subdivision is
  // passed (see getSubdivisionCandidates's comment in holidays.ts for the empirical check
  // that found this). Fetched separately via the one function that bypasses that filter.
  const [subdivisionCalendar, setSubdivisionCalendar] = useState<{ scope: string; holidays: Holiday[] } | null>(null);
  useEffect(() => {
    if (!isSupportedPlanningRange(rangeStart, rangeEnd)) return;
    let cancelled = false;
    getSubdivisionCandidates(country, rangeStart, rangeEnd).then((holidays) => {
      if (!cancelled) setSubdivisionCalendar({ scope: nationalHolidayScope, holidays });
    });
    return () => {
      cancelled = true;
    };
  }, [country, rangeStart, rangeEnd, nationalHolidayScope]);

  const national = nationalCalendar?.scope === nationalHolidayScope ? nationalCalendar : undefined;
  const regional = subdivision && regionalCalendar?.scope === regionalHolidayScope ? regionalCalendar : undefined;
  const subdivisionCandidates = subdivisionCalendar?.scope === nationalHolidayScope ? subdivisionCalendar.holidays : NO_HOLIDAYS;
  const discoveredSubdivisions = useMemo(() => [...new Set([...discoverSubdivisions(subdivisionCandidates), ...(country === 'US' ? Object.keys(SUBDIVISION_NAMES).filter(code => code.startsWith('US-')) : [])])].sort(), [subdivisionCandidates, country]);
  const holidaysDegraded = sharedObservedHolidays === undefined && Boolean(national?.degraded || regional?.degraded);
  const nationalHolidays = preloadedNational ?? national?.holidays;
  const regionalHolidays = preloadedRegional ?? regional?.holidays;
  const holidaysReady = sharedObservedHolidays !== undefined || Boolean(nationalHolidays && (!subdivision || regionalHolidays));

  const holidayEntries: HolidayEntry[] = useMemo(
    () => holidayEntriesFor(nationalHolidays ?? NO_HOLIDAYS, regionalHolidays ?? NO_HOLIDAYS, employerCalendar, rangeStart, rangeEnd, sharedObservedHolidays),
    [nationalHolidays, regionalHolidays, employerCalendar, rangeStart, rangeEnd, sharedObservedHolidays],
  );

  // Alternating Fridays are calendar days off. Pins pass separately so a pinned
  // working day still costs PTO and a pinned holiday keeps its existing zero cost.
  const altFridayOffDates = useMemo(
    () => altFridayOffDatesFor(altFridayEnabled, altFridayStart, rangeStart, rangeEnd),
    [altFridayEnabled, altFridayStart, rangeStart, rangeEnd],
  );

  const effectiveOffDays = useMemo(() => effectiveOffDaysFor(holidayEntries, altFridayOffDates), [holidayEntries, altFridayOffDates]);

  const commitments = useMemo(
    () => plannerRequestCommitments(requests, rangeStart, rangeEnd, balanceAsOf),
    [requests, rangeStart, rangeEnd, balanceAsOf],
  );
  const bookedDates = useMemo(() => new Set(applyTrackedRequests ? commitments.unavailableDates : []), [applyTrackedRequests, commitments]);
  const mustIncludeDays = useMemo(
    () => mustIncludeDaysFor(forced).filter(date => !bookedDates.has(date)),
    [forced, bookedDates],
  );
  const effectiveBlackouts = useMemo(
    () => effectiveBlackoutsFor([...blackouts, ...bookedDates], forced),
    [blackouts, bookedDates, forced],
  );

  // A remaining balance may already account for bookings. Only reserve their cost
  // when the user confirms the entered budget still includes that approved time.
  const approvedPtoCharge = applyTrackedRequests && reserveApprovedPto && !unlimitedPto ? commitments.approvedPtoDays : 0;
  const effectiveBudget = effectiveBudgetFor(budget, reserveDays + approvedPtoCharge);

  // Feature 1 Stage 2A follow-through: routed through the shared policy model
  // (src/policy/model.ts) instead of this file's own parallel ternary logic, so /policy and
  // /pto describe a policy's accrual/reset/carryover the same way. `effectiveBudget` (the
  // reserve-days subtraction) stays a separate, UI-level step applied after - the policy
  // model doesn't know about "reserve days", which isn't a policy concept, it's a planning
  // preference. Equivalence with the old ternary logic, for every combination of these
  // fields, is locked down by src/ui/pto-policy-regression.test.ts.
  const policyAccrualFields = useMemo(
    () => policyAccrualFieldsFor({ budget, accrualEnabled, accrualPerMonth, expiryEnabled, expiryDate, carryoverCap, rangeStart }),
    [budget, accrualEnabled, accrualPerMonth, expiryEnabled, expiryDate, carryoverCap, rangeStart],
  );

  const solveInput: SolveInput = useMemo(
    () => buildSolveInput({
      effectiveOffDays,
      mustIncludeDays,
      effectiveBlackouts,
      effectiveBudget,
      rangeStart,
      rangeEnd,
      budget,
      accrualEnabled,
      accrualPerMonth,
      expiryEnabled,
      expiryDate,
      carryoverCap,
      overlapDays,
      workWeek,
      country,
      w,
      breakCount,
      peakCapEnabled,
      peakCapStart,
      peakCapEnd,
      peakCapMaxDays,
    }, policyAccrualFields),
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
      peakCapEnabled,
      peakCapStart,
      peakCapEnd,
      peakCapMaxDays,
      budget,
      policyAccrualFields,
    ],
  );

  // Validation gate: end-before-start, a negative/absurd PTO budget, or an expiry date
  // outside the selected range are all inputs the solver would otherwise either crash on
  // or "handle" by silently producing a meaningless plan. Per spec, the UI shows an inline
  // message AND keeps the last good plan on screen rather than collapsing to an empty
  // state the moment a field becomes invalid mid-edit (e.g. the instant a user starts
  // retyping the end date and it briefly precedes the start date).
  const validationIssues = useMemo(
    () => validateInputs({ rangeStart, rangeEnd, budget, expiryEnabled, expiryDate, workWeek }),
    [rangeStart, rangeEnd, budget, expiryEnabled, expiryDate, workWeek],
  );
  const isValidInput = validationIssues.length === 0;

  // Wait for the current scope if the embedded calendar does not cover it.
  const waitingForCalendar = isValidInput && !holidaysReady;
  const { solved, scores, pending: computationPending } = usePlannerComputation(
    solveInput, isValidInput && !waitingForCalendar, planningVersion, minimumBreakDays, planningStyle,
  );
  const planningPending = waitingForCalendar || computationPending;
  const solveResult = solved.result;

  // The real outcome of pinning one more day, from the same planning call, cached per
  // input so hovering across the grid never re-solves the same day twice.
  const previewPin = useMemo(() => {
    const cache = new Map<string, PinPreview>();
    return (date: string): PinPreview | null => {
      if (!isValidInput || planningPending || planningVersion !== 2) return null;
      let hit = cache.get(date);
      if (!hit) {
        try {
          hit = previewPinnedDay(solveInput, { minimumBreakDays, style: planningStyle }, date);
        } catch {
          return null;
        }
        cache.set(date, hit);
      }
      return hit;
    };
  }, [solveInput, isValidInput, planningPending, planningVersion, minimumBreakDays, planningStyle]);

  const breaks = solveResult.primary;
  const alternatives = solveResult.alternatives;
  const breakCountRequested = solveResult.breakCountRequested;
  const breakCountActual = solveResult.breakCountActual;
  const budgetSpent = solveResult.budgetSpent;

  // Summary strip: total days off/PTO spent plus the indexed Efficiency/Travel scores.
  const totalDaysOff = useMemo(() => totalDaysOffOf(breaks), [breaks]);

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
  const marginalValues = useMemo(() => isValidInput && !planningPending ? computeMarginalValues(solveInput, breaks) : new Map(), [solveInput, breaks, isValidInput, planningPending]);

  const holidayNameFor = useCallback(
    (iso: string): string | undefined => holidayEntries.find((h) => h.date === iso && h.checked)?.name,
    [holidayEntries],
  );

  /** 'company' for days the employer calendar adds, 'public' for public and state holidays. */
  const holidayKindFor = useCallback(
    (iso: string): 'public' | 'company' | undefined => {
      const entry = holidayEntries.find((h) => h.date === iso && h.checked);
      return entry ? (entry.source === 'custom' ? 'company' : 'public') : undefined;
    },
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

  const isSuggestedPto = useCallback(
    (iso: string) => isSuggestedPtoDay(iso, { blackoutSet, baseOffSet, workWeek, chosenDaySet }),
    [blackoutSet, baseOffSet, workWeek, chosenDaySet],
  );

  const offRuns = useMemo(
    () => isSupportedPlanningRange(rangeStart, rangeEnd) ? computeQualifyingRuns(rangeStart, rangeEnd, isOffForBand, isSuggestedPto) : [],
    [rangeStart, rangeEnd, isOffForBand, isSuggestedPto],
  );
  const holidayOffRun = holidayFocusDate && isValidInput && !planningPending
    ? offRuns.find(run => holidayFocusDate >= run.start && holidayFocusDate <= run.end)
    : undefined;
  const holidayFocusRun = holidayOffRun && {
    ...holidayOffRun,
    length: isoToSerial(holidayOffRun.end) - isoToSerial(holidayOffRun.start) + 1,
  };

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
    () => isSupportedPlanningRange(rangeStart, rangeEnd) ? rangeISO(rangeStart, rangeEnd).filter(isOffForBand) : [],
    [rangeStart, rangeEnd, isOffForBand],
  );

  const buildOverlapLink = useCallback(() => {
    if (typeof window === 'undefined') return '';
    return buildOverlapShareURL(window.location.origin, window.location.pathname, allDaysOff);
  }, [allDaysOff]);

  // Alternatives don't mean much once the plan is already fragmented into many short
  // breaks (breakCount near 7) - there's rarely a meaningful "placement" to swap to.
  const showAlternativesEffective = showAlternatives && breakCount < 7 && !planningPending;

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
    setUseSharedHolidaySnapshot(false);
    setCountry(code);
    setSubdivision(undefined);
  }, []);
  const changeSubdivision = useCallback((value: string | undefined) => {
    setUseSharedHolidaySnapshot(false);
    setSubdivision(value);
  }, []);

  const hoveredAlternative = useMemo(
    () => planningPending ? undefined : alternatives.find((a) => a.id === hoveredAlternativeId),
    [alternatives, hoveredAlternativeId, planningPending],
  );

  const { pinnedPlans, addPinnedPlan, removePinnedPlan, pinMessage } = usePinnedPlans();
  const canPin = pinnedPlans.length < MAX_PINNED_PLANS && !planningPending && !holidaysDegraded && sharedObservedHolidays === undefined;

  const pinPlan = useCallback(() => {
    if (!canPin) return;
    addPinnedPlan({
      country,
      subdivision,
      employerCalendar,
      planningVersion,
      planningStyle,
      minimumBreakDays,
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
      applyTrackedRequests,
      reserveApprovedPto,
      unlimitedPto,
      noticePeriodDays,
      peakCapEnabled,
      peakCapStart,
      peakCapEnd,
      peakCapMaxDays,
      summary: {
        budgetSpent,
        totalDaysOff,
        breakCountActual,
        travelPercentile: scores?.travel.percentile ?? null,
      },
    });
  }, [
    country, subdivision, employerCalendar, planningVersion, planningStyle, minimumBreakDays, rangeStart, rangeEnd, budget, w, letSolverDecide, manualBreakCount,
    weekStartOverride, accrualEnabled, accrualPerMonth, expiryEnabled, expiryDate, carryoverCap,
    overlapDays, blackouts, workWeek, forced, altFridayEnabled, altFridayStart,
    addPinnedPlan, canPin, reserveDays, applyTrackedRequests, reserveApprovedPto, unlimitedPto, noticePeriodDays, peakCapEnabled, peakCapStart, peakCapEnd, peakCapMaxDays,
    budgetSpent, totalDaysOff, breakCountActual, scores,
  ]);

  // Restores every input the snapshot carries - the raw setters (not `changeCountry`, which
  // also clears subdivision) so a pinned plan's subdivision comes back too.
  const restorePlan = useCallback(
    (index: number) => {
      const snap = pinnedPlans[index];
      if (!snap) return;
      setUseSharedHolidaySnapshot(false);
      setCountry(snap.country);
      setSubdivision(snap.subdivision);
      setEmployerCalendars(previous => ({ ...previous, [employerScope(snap.country, snap.subdivision)]: snap.employerCalendar }));
      setRangeStart(snap.rangeStart);
      setRangeEnd(snap.rangeEnd);
      setBudget(snap.budget);
      setPlanningVersion(snap.planningVersion);
      setPlanningStyleRaw(snap.planningStyle);
      setMinimumBreakDaysRaw(snap.minimumBreakDays);
      setWRaw(snap.w);
      setLetSolverDecideRaw(snap.letSolverDecide);
      setManualBreakCountRaw(snap.manualBreakCount);
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
      setApplyTrackedRequests(snap.applyTrackedRequests);
      setReserveApprovedPto(snap.reserveApprovedPto);
      setUnlimitedPtoRaw(snap.unlimitedPto);
      setNoticePeriodDays(snap.noticePeriodDays);
      setPeakCapEnabled(snap.peakCapEnabled);
      setPeakCapStart(snap.peakCapStart);
      setPeakCapEnd(snap.peakCapEnd);
      setPeakCapMaxDays(snap.peakCapMaxDays);
    },
    [pinnedPlans],
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
  // A rejected combination of pinned dates and PTO policy can leave no valid
  // solver plan. Offer an explicit, reversible recovery action without resetting
  // the user's employer calendar, budget, dates or other policy settings.
  const clearForcedDays = useCallback(() => setForced({}), []);

  const swapAlternative = useCallback(
    (alt: Alternative) => {
      if (planningPending) return;
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
    [breaks, baseOffSet, isWeekendDay, planningPending],
  );

  return {
    validationIssues,
    solverIssue: solved.issue,
    planningPending,
    relaxedMinimum: solved.relaxedMinimum,
    previewPin,
    solveInput,
    planSearch,
    planningVersion,
    planningStyle,
    setPlanningStyle,
    minimumBreakDays,
    setMinimumBreakDays,
    holidaysDegraded,
    holidaysReady,
    holidayFocusDate,
    holidayFocusRun,
    country,
    setCountry: changeCountry,
    subdivision,
    setSubdivision: changeSubdivision,
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
    approvedPtoDays: commitments.approvedPtoDays,
    hasHourlyBookings: commitments.hasHourlyBookings,
    hasTrackedRequests: commitments.unavailableDates.length > 0,
    applyTrackedRequests,
    setApplyTrackedRequests,
    isSharedPlan: initial.publicShareVersion === 1,
    isLandingPreview: initial.landingPreview === true,
    hasSharedHolidaySnapshot: sharedObservedHolidays !== undefined,
    restoreMyEmployerCalendar,
    reserveApprovedPto,
    setReserveApprovedPto,
    noticePeriodDays,
    setNoticePeriodDays,
    peakCapEnabled,
    setPeakCapEnabled,
    peakCapStart,
    setPeakCapStart,
    peakCapEnd,
    setPeakCapEnd,
    peakCapMaxDays,
    setPeakCapMaxDays,
    peakCapApplied: solveResult.peakCapApplied,
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
    holidayKindFor,
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
    employerCalendar,
    employerCalendarMessage,
    saveEmployerHolidays,
    resetEmployerHolidays,
    toggleHoliday,
    effectiveOffDays,
    removeHoliday: (date: string, name: string) => updateEmployerCalendar(current => ({ ...current, custom: current.custom.filter(item => item.date !== date || item.name !== name), excluded: [...new Set([...current.excluded, `${date}|${name}`])] })),
    toggleStateHoliday: toggleHoliday,
    addCustomHoliday,
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
    hasBlackouts: blackoutSet.size > 0,
    isSuggestedPto,
    overlapSet,
    offRuns,
    breakBandByRunIndex,
    toggleDay,
    clearForcedDays,
    forced,
    pinnedPlans,
    pinMessage,
    canPin,
    pinPlan,
    restorePlan,
    removePinnedPlan,
  };
}

export type AppState = ReturnType<typeof useAppState>;
