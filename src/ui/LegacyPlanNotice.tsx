import { useEffect, useState } from 'react';
import { FRESH_VISIT_RESERVE_DAYS, isValidISODate } from './urlState';
import { PRODUCT_NAME } from '../brand';

/**
 * Issue 10: a plan link made before planning version 2 (no `pv=2`) keeps its exact plan,
 * with legacy semantics. This quiet line says so and offers the same country, region,
 * budget and date range with today's fresh-visit defaults, without changing the plan on
 * screen. Self-contained: it reads the arrival query itself, renders nothing during the
 * static prerender and nothing for fresh visits or version-2 links.
 *
 * Mount it once in the /pto planner, directly above the plan (see the run report).
 */

/** True for a saved or shared /pto plan link that predates planning version 2. */
export function isLegacyPlanSearch(search: string): boolean {
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  if (params.get('pv') === '2') return false;
  return params.has('b') || params.has('s') || params.has('e');
}

/** The same scenario with the fresh-visit planner defaults (pv=2, spread-across-the-year style). */
export function todaysPlanHref(search: string, pathname = '/pto'): string {
  const source = new URLSearchParams(search.replace(/^\?/, ''));
  const params = new URLSearchParams();
  const country = source.get('c');
  if (country && /^[A-Z]{2}$/.test(country)) params.set('c', country);
  const region = source.get('sd');
  if (region && /^[A-Z0-9-]{1,16}$/.test(region)) params.set('sd', region);
  const budget = source.get('b');
  if (budget !== null && /^\d+(?:\.\d+)?$/.test(budget) && Number(budget) <= 400) params.set('b', String(Number(budget)));
  for (const key of ['s', 'e'] as const) {
    const value = source.get(key);
    if (value && isValidISODate(value)) params.set(key, value);
  }
  params.set('rv', String(FRESH_VISIT_RESERVE_DAYS));
  params.set('pv', '2');
  params.set('ps', 'year');
  params.set('mb', '3');
  params.set('w', '30');
  params.set('count', '0');
  const path = /^\/[a-z-]*\/?$/i.test(pathname) ? pathname : '/pto';
  return `${path}?${params.toString()}`;
}

export function LegacyPlanNotice({ search }: { search?: string }) {
  const [arrival, setArrival] = useState<{ search: string; pathname: string } | null>(
    search !== undefined ? { search, pathname: '/pto' } : null,
  );
  useEffect(() => {
    if (search === undefined) setArrival({ search: window.location.search, pathname: window.location.pathname });
    // Read once, at arrival: later edits rewrite the address bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!arrival || !isLegacyPlanSearch(arrival.search)) return null;
  return (
    <p data-testid="legacy-plan-notice" className="text-sm text-muted">
      This plan was made with an older version of {PRODUCT_NAME}.{' '}
      <a href={todaysPlanHref(arrival.search, arrival.pathname)} className="link-mark inline-flex min-h-11 items-center font-semibold text-ink">
        See today&rsquo;s recommended plan
      </a>
    </p>
  );
}
