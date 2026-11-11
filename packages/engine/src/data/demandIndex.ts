import rawIndex from './demandIndex.json';

/** MM-DD -> throughput normalized to the annual mean. 1.0 = average day. */
export const US_DEMAND_INDEX: Record<string, number> = rawIndex;

export interface DemandLookup {
  /** Normalized demand level; 1.0 = average. */
  value: number;
  /** True when this came from the generic non-US heuristic, not US TSA observations. */
  estimated: boolean;
}

/** The index's single source year (TSA checkpoint throughput). Non-leap. */
export const US_DEMAND_SOURCE_YEAR = 2025;
/** Days either side of the month-day included in the seasonal mean (7 days in all). */
const SEASONAL_HALF_WINDOW = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Issue 6: the raw index is ONE year (2025) keyed by month-day, so every value carries
 * 2025's weekday pattern - Tuesdays and Wednesdays read ~0.7, Fridays and Sundays ~1.1.
 * Copying that number onto the same month-day of another year moves the weekday (2027-01-21
 * is a Thursday; 2025-01-21 was a Tuesday), so the solver used to prefer dates that were
 * merely quiet WEEKDAYS in 2025, and tag them "Low travel demand". A centred 7-day mean
 * contains every weekday exactly once, which removes that single-year weekday signal and
 * keeps only the broad seasonal one the data can honestly support. It is still a rough
 * historical proxy for one country, not a forecast and not a price.
 */
const US_SEASONAL_INDEX: Record<string, number> = (() => {
  const seasonal: Record<string, number> = {};
  for (const key of Object.keys(US_DEMAND_INDEX)) {
    const center = Date.UTC(US_DEMAND_SOURCE_YEAR, Number(key.slice(0, 2)) - 1, Number(key.slice(3, 5)));
    let sum = 0;
    let count = 0;
    for (let offset = -SEASONAL_HALF_WINDOW; offset <= SEASONAL_HALF_WINDOW; offset++) {
      // Wraps across the year boundary: Jan 1 averages Dec 29-Jan 4 of the source year.
      const observed = US_DEMAND_INDEX[new Date(center + offset * DAY_MS).toISOString().slice(5, 10)];
      if (Number.isFinite(observed) && observed > 0) {
        sum += observed;
        count++;
      }
    }
    seasonal[key] = sum / count;
  }
  return seasonal;
})();

/** Seasonal US figure for any date. Feb 29 uses Feb 28 (the source year has no leap day). */
export function usSeasonalDemand(iso: string): number {
  const key = iso.slice(5, 10);
  return US_SEASONAL_INDEX[key === '02-29' ? '02-28' : key];
}

/**
 * Generic, country-agnostic seasonal heuristic for non-US countries, where we
 * have no real throughput data. Deliberately coarse: a broad Dec holidays /
 * summer travel bump, flat otherwise. Never presented as more precise than
 * that — callers should label results from this as "Estimated".
 */
function genericSeasonalDemand(iso: string): number {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if ((month === 12 && day >= 20) || (month === 1 && day <= 2)) return 1.35;
  if (month === 7 || month === 8) return 1.15;
  if (month === 3 || month === 4) return 1.1;
  return 1.0;
}

export function demandFor(iso: string, countryCode: string | undefined): DemandLookup {
  if (countryCode === 'US') {
    return { value: usSeasonalDemand(iso), estimated: false };
  }
  return { value: genericSeasonalDemand(iso), estimated: true };
}
