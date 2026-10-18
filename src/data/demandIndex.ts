import rawIndex from './demandIndex.json';

/** MM-DD -> throughput normalized to the annual mean. 1.0 = average day. */
export const US_DEMAND_INDEX: Record<string, number> = rawIndex;

export interface DemandLookup {
  /** Normalized demand level; 1.0 = average. */
  value: number;
  /** True when this came from the generic non-US heuristic, not real TSA data. */
  estimated: boolean;
}

function mmdd(iso: string): string {
  return iso.slice(5, 10);
}

function usDemand(iso: string): number {
  const key = mmdd(iso);
  return US_DEMAND_INDEX[key] ?? US_DEMAND_INDEX['02-28']; // Feb 29 fallback; the index has no leap day
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
    return { value: usDemand(iso), estimated: false };
  }
  return { value: genericSeasonalDemand(iso), estimated: true };
}
