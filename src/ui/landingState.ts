import { COUNTRIES } from '@daysoff/engine/data/countries';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { defaultPlanRangeEnd, solvePlan } from '../autopilot/planFromSearch';
import { planningStyleSettings } from '../planning/optimizer';
import { isValidISODate } from './urlState';

export interface LandingState {
  country: string;
  budget: number;
  rangeStart: string;
  rangeEnd: string;
}

export const LANDING_MAX_RANGE_DAYS = 730;
const PREVIEW_STYLE = 'balanced';
const PREVIEW_VERSION = 2;
const PREVIEW_MINIMUM = 3;

export function computeLandingPlan(state: LandingState, holidays: readonly { date: string }[]) {
  return solvePlan({
    ...state,
    ...planningStyleSettings(PREVIEW_STYLE),
    offDays: [...new Set(holidays.map(({ date }) => date))],
    workWeek: DEFAULT_WORK_WEEK,
  }, PREVIEW_VERSION, PREVIEW_MINIMUM, PREVIEW_STYLE);
}

export function validLandingRange(start: string, end: string): boolean {
  return isValidISODate(start) && isValidISODate(end) && end >= start
    && isoToSerial(end) - isoToSerial(start) < LANDING_MAX_RANGE_DAYS;
}

/** The explicit home marker separates new homepage links from historic optimizer links. */
export function readLandingState(search: string, today: string, country: string): LandingState {
  const defaults = { country, budget: 15, rangeStart: today, rangeEnd: defaultPlanRangeEnd(today) };
  const params = new URLSearchParams(search);
  if (params.get('home') !== '1') return defaults;
  const requestedCountry = params.get('c');
  const requestedBudget = params.get('b');
  const budget = requestedBudget !== null && /^\d+$/.test(requestedBudget) ? Number(requestedBudget) : defaults.budget;
  const start = params.get('s') ?? defaults.rangeStart;
  const end = params.get('e') ?? defaults.rangeEnd;
  return {
    country: COUNTRIES.some((entry) => entry.code === requestedCountry) ? requestedCountry! : country,
    budget: Number.isInteger(budget) && budget >= 0 && budget <= 60 ? budget : defaults.budget,
    rangeStart: validLandingRange(start, end) ? start : defaults.rangeStart,
    rangeEnd: validLandingRange(start, end) ? end : defaults.rangeEnd,
  };
}

/** A blank PTO field has no number to record, so `b` is left out rather than kept at the last value. */
export function landingSearch(state: LandingState, budgetBlank = false): string {
  const params = new URLSearchParams({
    home: '1', c: state.country, b: String(state.budget), s: state.rangeStart, e: state.rangeEnd,
  });
  if (budgetBlank) params.delete('b');
  return `?${params}`;
}

/** R2: with a blank PTO field the link omits `b`, so the planner opens on its own starting
 * plan instead of carrying a number the visitor cleared. */
export function landingPlanHref(state: LandingState, pinnedDate?: string, budgetBlank = false): string {
  const params = new URLSearchParams({
    c: state.country, b: String(state.budget), s: state.rangeStart, e: state.rangeEnd,
    rv: '0', pv: String(PREVIEW_VERSION), ps: PREVIEW_STYLE, mb: String(PREVIEW_MINIMUM), lp: '1',
  });
  if (budgetBlank) params.delete('b');
  const preset = planningStyleSettings(PREVIEW_STYLE);
  if (preset) {
    params.set('w', String(preset.w));
    params.set('count', String(preset.breakCount));
  }
  if (!budgetBlank && state.budget > 0 && pinnedDate && dateInLandingRange(state, pinnedDate)) params.set('p', pinnedDate);
  return `/pto?${params}`;
}

function dateInLandingRange(state: LandingState, date: string): boolean {
  return isValidISODate(date) && date >= state.rangeStart && date <= state.rangeEnd;
}

/** Keep the observed date distinct from the working day that connects its off-runs. */
export function landingHolidayHref(state: LandingState, date: string, bridgeDate?: string): string {
  if (!dateInLandingRange(state, date)) return landingPlanHref(state);
  return `${landingPlanHref(state, bridgeDate === date ? undefined : bridgeDate)}&hd=${date}#holiday-focus`;
}
