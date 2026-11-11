import { decodeEmployerCalendar } from '../personal/employerCalendar';
import { isValidISODate, parseDateList } from './urlState';
import { isPlanShareKey, PLAN_PRIVATE_KEYS, PUBLIC_SHARE_VERSION } from './shareFormat';

/** Imported, user-authored calendar names and excluded holiday labels are private. */
export function employerLabelsWouldBeShared(query: string): boolean {
  const raw = new URLSearchParams(query).get('eh');
  if (!raw) return false;
  const calendar = decodeEmployerCalendar(raw);
  return !calendar || calendar.custom.length > 0 || calendar.excluded.length > 0;
}

// Private scheduling and policy settings, from the shared classification. `eh` is
// reported separately as a calendar omission; `hd` is a landing-preview focus date.
const PRIVATE_PLAN_FIELDS = PLAN_PRIVATE_KEYS.filter(key => key !== 'eh' && key !== 'hd');
const NUMBER_FIELDS = { b: 400, w: 100, count: 7, mb: 60, rv: 400 } as const;
const DATE_FIELDS = ['s', 'e', 'afs'] as const;
const STYLE_NAMES = ['balanced', 'long-breaks', 'more-breaks', 'custom'];

/** Build the versioned, allowlisted public scenario. The optional dates are a
 * separate, deliberate selection, never extracted from the private query. */
export function buildPublicPlanSearch(planSearch: string, observedHolidayDates?: readonly string[]): string {
  const source = new URLSearchParams(planSearch);
  const params = new URLSearchParams({ sv: String(PUBLIC_SHARE_VERSION) });
  const country = source.get('c');
  if (country && /^[A-Z]{2}$/.test(country)) params.set('c', country);
  const subdivision = source.get('sd');
  if (subdivision && /^[A-Z0-9-]{1,16}$/.test(subdivision)) params.set('sd', subdivision);
  for (const key of DATE_FIELDS) {
    const value = source.get(key);
    if (value && isValidISODate(value)) params.set(key, value);
  }
  for (const [key, limit] of Object.entries(NUMBER_FIELDS)) {
    const value = source.get(key);
    if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) continue;
    const number = Number(value);
    if (number <= limit && (key === 'b' || key === 'rv' || Number.isInteger(number))) {
      params.set(key, String(number));
    }
  }
  const style = source.get('ps');
  if (source.get('pv') === '2') {
    params.set('pv', '2');
    if (style && STYLE_NAMES.includes(style)) params.set('ps', style);
  }
  const weekStart = source.get('ws');
  if (weekStart === '0' || weekStart === '1') params.set('ws', weekStart);
  const workWeek = source.get('ww');
  if (workWeek && /^[01]{7}$/.test(workWeek) && workWeek.includes('1')) params.set('ww', workWeek);
  if (source.get('af') === '1' && params.has('afs')) params.set('af', '1');
  else params.delete('afs');
  const pins = parseDateList(source.get('p')).sort();
  if (pins.length) params.set('p', pins.join(','));

  if (observedHolidayDates !== undefined) {
    const dates = [...new Set(observedHolidayDates.filter(isValidISODate))].sort();
    if (dates.length <= 4000) params.set('ho', dates.join(','));
  }
  // Defence in depth: the per-field validation above is itself an allowlist, and this
  // final pass guarantees nothing outside the versioned share format is ever emitted.
  for (const key of [...params.keys()]) if (!isPlanShareKey(key)) params.delete(key);
  return params.toString();
}

export function publicPlanOmissions(search: string): { calendar: boolean; settings: boolean } {
  const params = new URLSearchParams(search);
  return {
    calendar: employerLabelsWouldBeShared(search) || params.has('ho'),
    settings: PRIVATE_PLAN_FIELDS.some(key => params.has(key)),
  };
}

/** Never copy incidental browser query keys or fragments. */
export function buildPublicPlanLink(currentHref: string, planSearch: string, observedHolidayDates?: readonly string[]): {
  url: string;
  omittedPrivateCalendar: boolean;
} {
  const original = new URL(currentHref);
  // Fix the origin first: a pathname beginning // must never replace the host.
  const result = new URL(original.origin);
  result.pathname = original.pathname;
  result.search = buildPublicPlanSearch(planSearch, observedHolidayDates);
  return {
    url: result.toString(),
    omittedPrivateCalendar: observedHolidayDates === undefined && publicPlanOmissions(planSearch).calendar,
  };
}
