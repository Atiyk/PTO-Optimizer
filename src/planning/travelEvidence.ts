import { US_DEMAND_SOURCE_YEAR, demandFor, usSeasonalDemand } from '@daysoff/engine/data/demandIndex';
import { validCalendarDate } from '../personal/employerCalendar';

/**
 * Consumer evidence adapter: provenance and caveats for the travel figure.
 * The raw US index is 2025 TSA throughput by month/day. Using a given 2025 Friday
 * value to score the corresponding date in 2027 can invert weekday preferences.
 *
 * A centred seven-day *seasonal* mean deliberately removes that single-year weekday
 * signal. The solver uses the same figure (engine `usSeasonalDemand`), so what this
 * reports is what the planner weighed. It is still a rough historical proxy, not a
 * forecast or a price.
 */
export type TravelEvidenceKind =
  | 'historical-seasonal-estimate'
  | 'generic-seasonal-heuristic'
  | 'unavailable';

export interface TravelEvidence {
  date: string;
  country: string;
  value: number | null;
  kind: TravelEvidenceKind;
  /** A value of 1.0 represents the source/index mean, never an airfare price. */
  units: 'relative-demand-index';
  source: string;
  sourceYear: number | null;
  method: string;
  /** Descriptive only; no false statistical confidence interval. */
  confidence: 'low' | 'none';
  /** The exact data-quality caveat safe to surface in any consumer UI. */
  caveat: string;
}

const TSA_SOURCE_YEAR = US_DEMAND_SOURCE_YEAR;

/** The SAME seasonal figure the planner's solver uses (one source of truth, issue 6). */
function seasonalUS(day: string): number | null {
  const value = usSeasonalDemand(day);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Source-labeled estimate for comparing broad travel seasons, never flight prices.
 * Other countries use the repo's preexisting broad seasonal rule (not US data).
 */
export function travelEvidenceFor(date: string, country: string): TravelEvidence | null {
  if (!validCalendarDate(date) || !/^[A-Z]{2}$/.test(country)) return null;
  if (country === 'US') {
    const value = seasonalUS(date);
    return {
      date, country, value,
      kind: value === null ? 'unavailable' : 'historical-seasonal-estimate',
      units: 'relative-demand-index',
      source: 'US TSA checkpoint throughput, historical 2025 index',
      sourceYear: TSA_SOURCE_YEAR,
      method: 'Centered 7-day seasonal average of 2025 daily throughput',
      confidence: value === null ? 'none' : 'low',
      caveat: 'Rough seasonality from one historical US year. Not live demand, airfare, hotel pricing or a day-of-week forecast.',
    };
  }
  const heuristic = demandFor(date, country);
  const value = Number.isFinite(heuristic.value) && heuristic.value > 0 ? heuristic.value : null;
  return {
    date, country, value,
    kind: value === null ? 'unavailable' : 'generic-seasonal-heuristic',
    units: 'relative-demand-index',
    source: 'Simple generic seasonal rule; no country-specific travel observations',
    sourceYear: null,
    method: 'Four broad seasonal bands, not measured local demand',
    confidence: value === null ? 'none' : 'low',
    caveat: 'Generic seasonality estimate only. Not based on observed trips in this country, and not a forecast or price.',
  };
}

/** How far below the yearly mean a window's US index must sit before the planner says it
 * had fewer flyers than usual: 15%, so ordinary week-to-week noise never earns the label. */
export const FEWER_FLYERS_THRESHOLD = 0.85;
export const FEWER_FLYERS_LABEL = `Fewer flyers than usual (${TSA_SOURCE_YEAR} TSA data)`;

let yearlyMean: number | null = null;
/** Mean of the seasonal US index over every day of the source year. */
export function usSeasonalYearlyMean(): number {
  if (yearlyMean !== null) return yearlyMean;
  let sum = 0;
  let count = 0;
  for (let t = Date.UTC(TSA_SOURCE_YEAR, 0, 1); t < Date.UTC(TSA_SOURCE_YEAR + 1, 0, 1); t += 86_400_000) {
    const value = seasonalUS(new Date(t).toISOString().slice(0, 10));
    if (value !== null) { sum += value; count += 1; }
  }
  yearlyMean = count ? sum / count : 1;
  return yearlyMean;
}

/**
 * True only when the window's average US checkpoint index (same seasonal figure the solver
 * uses) is at least 15% below the source year's mean. A statement about how many people
 * flew on these dates in 2025, never about prices or this year's crowds.
 */
export function fewerFlyersThanUsual(start: string, end: string): boolean {
  if (!validCalendarDate(start) || !validCalendarDate(end) || start > end) return false;
  let sum = 0;
  let count = 0;
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`) && count <= 60; t += 86_400_000) {
    const value = seasonalUS(new Date(t).toISOString().slice(0, 10));
    if (value === null) return false;
    sum += value;
    count += 1;
  }
  return count > 0 && sum / count <= FEWER_FLYERS_THRESHOLD * usSeasonalYearlyMean();
}
