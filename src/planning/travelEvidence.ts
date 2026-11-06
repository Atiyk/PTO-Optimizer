import { US_DEMAND_INDEX, demandFor } from '@daysoff/engine/data/demandIndex';
import { validCalendarDate } from '../personal/employerCalendar';

/**
 * Consumer-only evidence adapter; does not alter the shared solver's legacy scoring.
 * The raw US index is 2025 TSA throughput by month/day. Using a given 2025 Friday
 * value to score the corresponding date in 2027 can invert weekday preferences.
 *
 * A centred seven-day *seasonal* mean deliberately removes much of that single-
 * year weekday signal. It is still a rough historical proxy, not a forecast or
 * a price. Full objective integration requires separate benchmarks and critic QA.
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

const DAY_MS = 24 * 60 * 60 * 1000;
const TSA_SOURCE_YEAR = 2025;
const SEASONAL_HALF_WINDOW = 3;

function seasonalUS(day: string): number | null {
  const md = day.slice(5);
  // The source year is non-leap. Feb 29 uses the adjacent Feb 28 signal.
  const sourceMD = md === '02-29' ? '02-28' : md;
  const mm = Number(sourceMD.slice(0, 2));
  const dd = Number(sourceMD.slice(3, 5));
  const center = Date.UTC(TSA_SOURCE_YEAR, mm - 1, dd);
  let sum = 0;
  let n = 0;
  for (let offset = -SEASONAL_HALF_WINDOW; offset <= SEASONAL_HALF_WINDOW; offset++) {
    const key = new Date(center + offset * DAY_MS).toISOString().slice(5, 10);
    const observed = US_DEMAND_INDEX[key];
    if (Number.isFinite(observed) && observed > 0) {
      sum += observed;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
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
