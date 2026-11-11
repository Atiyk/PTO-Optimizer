import { useEffect, useState } from 'react';
import holidayCoverageManifest from '@daysoff/engine/data/holidayCoverage.json';
import { getConsumerHolidaysWithStatus, validScope } from '../personal/consumerHolidays';
import { isValidISODate } from './urlState';

/**
 * Issue 17: holiday data is bundled for three years per build (see
 * scripts/build-holidays.ts); later years rely on a live lookup that may return nothing.
 * Coverage is per country-year: regional holidays come from the same country-year data, so
 * a covered country-year covers its regions too.
 */

function joinYears(years: readonly number[]): string {
  return years.length <= 1 ? years.join('') : `${years.slice(0, -1).join(', ')} and ${years[years.length - 1]}`;
}

/** One plain sentence for the planner, or null when every plan year is covered. */
export function holidayCoverageMessage(years: readonly number[]): string | null {
  if (years.length === 0) return null;
  const which = years.length === 1 ? `in ${years[0]}` : 'in those years';
  return `Holiday data not available for ${joinYears(years)} — results assume no public holidays ${which}. Add your employer’s holidays in More options.`;
}

/** Plan years this build did not bundle holiday data for (they need a live lookup). */
export function yearsOutsideBundledHolidayData(rangeStart: string, rangeEnd: string): number[] {
  if (!isValidISODate(rangeStart) || !isValidISODate(rangeEnd) || rangeEnd < rangeStart) return [];
  // Read the build manifest directly (same data as the engine's bundledHolidayYears()).
  const bundled = new Set<number>(holidayCoverageManifest.bundledYears);
  const years: number[] = [];
  for (let year = Number(rangeStart.slice(0, 4)); year <= Number(rangeEnd.slice(0, 4)) && years.length <= 11; year++) {
    if (!bundled.has(year)) years.push(year);
  }
  return years;
}

/**
 * Plan years with no holiday data. Bundled years are trusted without any request; only the
 * unbundled part of the range is looked up (same cached lookup the planner uses). A failed
 * lookup with no per-year detail counts every unbundled year as uncovered.
 */
export function useUncoveredHolidayYears(country: string, rangeStart: string, rangeEnd: string): number[] {
  const candidates = validScope(country, rangeStart, rangeEnd) ? yearsOutsideBundledHolidayData(rangeStart, rangeEnd) : [];
  const key = `${country}|${rangeStart}|${rangeEnd}|${candidates.join(',')}`;
  const [result, setResult] = useState<{ key: string; years: number[] } | null>(null);

  useEffect(() => {
    if (candidates.length === 0) return;
    let cancelled = false;
    const firstUnbundled = `${candidates[0]}-01-01`;
    const lookupStart = firstUnbundled > rangeStart ? firstUnbundled : rangeStart;
    getConsumerHolidaysWithStatus(country, lookupStart, rangeEnd).then((status) => {
      if (cancelled) return;
      const reported = Array.isArray(status.uncoveredYears) ? status.uncoveredYears : status.degraded ? candidates : [];
      setResult({ key, years: reported.filter(year => candidates.includes(year)) });
    }, () => {
      if (!cancelled) setResult({ key, years: candidates });
    });
    return () => { cancelled = true; };
    // `key` captures country, range and the candidate years.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return candidates.length > 0 && result?.key === key ? result.years : [];
}
