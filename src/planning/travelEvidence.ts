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
