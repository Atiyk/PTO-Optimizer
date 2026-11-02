import { COUNTRIES } from '@daysoff/engine/data/countries';
import { addDays, isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate } from './urlState';
import { defaultEmployerCalendar, encodeEmployerCalendar, type EmployerCalendar } from '../personal/employerCalendar';

export interface LandingState {
  country: string;
  budget: number;
  rangeStart: string;
  rangeEnd: string;
}

export const LANDING_MAX_RANGE_DAYS = 730;

export function validLandingRange(start: string, end: string): boolean {
  return isValidISODate(start) && isValidISODate(end) && end >= start
    && isoToSerial(end) - isoToSerial(start) < LANDING_MAX_RANGE_DAYS;
}

/** The explicit home marker separates new homepage links from historic optimizer links. */
export function readLandingState(search: string, today: string, country: string): LandingState {
  const defaults = { country, budget: 15, rangeStart: today, rangeEnd: addDays(today, 364) };
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

export function landingSearch(state: LandingState): string {
  const params = new URLSearchParams({
    home: '1', c: state.country, b: String(state.budget), s: state.rangeStart, e: state.rangeEnd,
  });
  return `?${params}`;
}

export function landingPlanHref(state: LandingState, pinnedDate?: string, employer = defaultEmployerCalendar(state.country)): string {
  const params = new URLSearchParams({
    c: state.country, b: String(state.budget), s: state.rangeStart, e: state.rangeEnd,
    rv: '0', pv: '2', ps: 'balanced', mb: '3', w: '30', count: '3',
  });
  const calendar: EmployerCalendar = employer.country === state.country && !employer.subdivision ? employer : defaultEmployerCalendar(state.country);
  params.set('eh', encodeEmployerCalendar(calendar));
  if (pinnedDate && isValidISODate(pinnedDate)) params.set('p', pinnedDate);
  return `/pto?${params}`;
}
