import { planningStyleSettings, type PlanningStyle } from '../planning/optimizer';
import { decodeEmployerCalendar, encodeEmployerCalendar, employerScope, type EmployerCalendar } from '../personal/employerCalendar';
import type { WorkWeek } from '@daysoff/engine/solver/types';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { WeekStart } from '@daysoff/engine/calendar/calendarMath';
import type { NoticeUnit } from '@daysoff/engine/calendar/requestDeadline';
import type { ForcedState } from './types';
import { isPlanAddressKey, partitionPlanParams, PLAN_URL_KEYS } from './shareFormat';

// Maps the old, now-removed named objectives and shape presets to a sensible (w, breakCount)
// pair, so a previously-shared link still opens to something reasonable instead of erroring
// or silently ignoring the parameter.
const OLD_OBJECTIVE_TO_W: Record<string, number> = {
  'most-days-off': 0,
  'one-long-trip': 20,
  'avoid-peak': 90,
  'long-weekends': 30,
  'single-days': 30,
};
const OLD_OBJECTIVE_TO_BREAK_COUNT: Record<string, number> = {
  'most-days-off': 0,
  'one-long-trip': 1,
  'avoid-peak': 0,
  'long-weekends': 7,
  'single-days': 7,
};

export interface SliderURLState {
  w: number;
  breakCount: number;
}

/**
 * Reads w/breakCount from the URL's search params, migrating a legacy `objective` (and the
 * old `shape`/`minBreakLength` params some earlier share links may carry) into a sensible
 * (w, breakCount) pair rather than erroring on an unrecognised value.
 */
export function readSliderStateFromURL(search: string): SliderURLState {
  const params = new URLSearchParams(search);

  const wParam = params.get('w');
  const countParam = params.get('count');
  const legacyObjective = params.get('objective');

  let w = 30;
  let breakCount = 0;

  if (legacyObjective && Object.hasOwn(OLD_OBJECTIVE_TO_W, legacyObjective)) {
    w = OLD_OBJECTIVE_TO_W[legacyObjective];
    breakCount = OLD_OBJECTIVE_TO_BREAK_COUNT[legacyObjective];
  }

  if (wParam !== null) {
    const parsed = Number(wParam);
    if (Number.isFinite(parsed)) w = Math.max(0, Math.min(100, Math.round(parsed / 10) * 10));
  }
  if (countParam !== null) {
    const parsed = Number(countParam);
    if (Number.isFinite(parsed)) breakCount = Math.max(0, Math.min(7, Math.round(parsed)));
  }

  return { w, breakCount };
}

export function writeSliderStateToURL(params: URLSearchParams, state: SliderURLState): void {
  params.set('w', String(state.w));
  params.set('count', String(state.breakCount));
  // Legacy params never get written back out.
  params.delete('objective');
  params.delete('shape');
  params.delete('minBreakLength');
  params.delete('maxBreakLength');
}

// ---------------------------------------------------------------------------------------
// Full app state encoding (legacy read and private in-memory serialization).
//
// The private codec retains every planner input, including employer settings. Public
// copies and the address bar each apply a separate policy before serializing. Two
// scenario fields are NOT safe to omit even when they equal
// "the default," because their default is relative to the viewer, not a fixed constant:
//   - rangeStart/rangeEnd default to "today" through "Dec 31 this year" - omitting them
//     would silently re-anchor to a different today days or years later.
//   - country defaults to a geolocated guess from the browser - omitting it would show a
//     visitor from a different country their own guess instead of the sharer's plan.
// Both are therefore always written, never conditionally dropped.
// ---------------------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Rejects malformed strings and calendar dates that don't round-trip (e.g. month 13, Feb 30). */
/** Exported (Feature 1, PR-C): src/ui/policyUrlState.ts reuses this instead of a second
 * ISO-date validity check. */
export function isValidISODate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseDateList(raw: string | null): string[] {
  if (!raw || raw.length > 44_000) return [];
  const dates = raw
    .split(',')
    .map((s) => s.trim())
    .filter(isValidISODate);
  return dates.length <= 4000 ? [...new Set(dates)] : [];
}

function encodeDateList(dates: string[]): string {
  return dates.join(',');
}

function parseWorkWeek(raw: string | null): WorkWeek | undefined {
  if (!raw || raw.length !== 7 || !/^[01]{7}$/.test(raw) || !raw.includes('1')) return undefined;
  return raw.split('').map((c) => c === '1') as unknown as WorkWeek;
}

function encodeWorkWeek(ww: WorkWeek): string {
  return ww.map((v) => (v ? '1' : '0')).join('');
}

export interface FullURLState {
  planningVersion?: 2;
  planningStyle?: PlanningStyle;
  minimumBreakDays?: number;
  employerCalendar?: EmployerCalendar;
  publicShareVersion?: 1;
  /** Observed dates intentionally shared by the sender, without employer labels. */
  sharedObservedHolidays?: string[];
  landingPreview?: true;
  holidayFocusDate?: string;
  country?: string;
  subdivision?: string;
  rangeStart: string;
  rangeEnd: string;
  budget: number;
  w: number;
  breakCount: number;
  weekStartOverride: WeekStart | 'auto';
  accrualEnabled: boolean;
  accrualPerMonth: number;
  expiryEnabled: boolean;
  expiryDate?: string;
  carryoverCap: number;
  overlapDays: string[];
  blackouts: string[];
  workWeek: WorkWeek;
  pinnedDays: string[];
  ruledOutDays: string[];
  altFridayEnabled: boolean;
  altFridayStart?: string;
  reserveDays: number;
  unlimitedPto: boolean;
  noticePeriodDays: number;
  /** How the notice period is counted (`nu=w`: working days; absent: calendar days). */
  noticeUnit: NoticeUnit;
  peakCapEnabled: boolean;
  peakCapStart?: string;
  peakCapEnd?: string;
  peakCapMaxDays: number;
}

/** Dates needed by the caller to fill in the viewer-relative fields (rangeStart/rangeEnd
 * default, expiry default) when the URL doesn't specify them - computed by the caller
 * (useAppState) so this module stays free of its own notion of "now". */
export interface FullURLDefaults {
  rangeStart: string;
  rangeEnd: string;
  budget: number;
  country: string;
}

/** Reads everything the solver (and the few UI-only settings) needs from the URL, falling
 * back to `defaults` field-by-field for anything missing or malformed. Never throws. */
export function readFullStateFromURL(search: string, defaults: FullURLDefaults): FullURLState {
  const params = new URLSearchParams(search);
  const slider = readSliderStateFromURL(search);
  const isNewPlan = params.get('pv') === '2' || !['s', 'e', 'b', 'w', 'count', 'objective', 'shape'].some(key => params.has(key));
  const styles: PlanningStyle[] = ['balanced', 'long-breaks', 'more-breaks', 'custom'];
  const planningStyle: PlanningStyle = styles.includes(params.get('ps') as PlanningStyle) ? params.get('ps') as PlanningStyle : 'balanced';
  const rawMinimum = params.get('mb');
  const minimum = rawMinimum === null ? 3 : Number(rawMinimum);
  const minimumBreakDays = Number.isInteger(minimum) && minimum >= 0 && minimum <= 60 ? minimum : 3;
  const preset = isNewPlan ? planningStyleSettings(planningStyle) : undefined;

  const s = params.get('s');
  const e = params.get('e');
  const rangeStart = s && isValidISODate(s) ? s : defaults.rangeStart;
  let rangeEnd = e && isValidISODate(e) ? e : defaults.rangeEnd;
  if (rangeEnd < rangeStart) rangeEnd = rangeStart;

  const budgetRaw = params.get('b');
  const budgetParsed = budgetRaw !== null ? Number(budgetRaw) : NaN;
  const budget = Number.isFinite(budgetParsed) && budgetParsed >= 0 ? Math.min(400, budgetParsed) : defaults.budget;

  const country = params.get('c') || defaults.country;
  const subdivision = params.get('sd') || undefined;
  const sharedCalendar = decodeEmployerCalendar(params.get('eh'));
  const publicShareVersion = params.get('sv') === '1' ? 1 : undefined;
  const holidayDates = publicShareVersion ? params.get('ho') : null;
  const sharedObservedHolidays = holidayDates !== null && (
    holidayDates === '' || (holidayDates.length <= 44_000 && holidayDates.split(',').every(isValidISODate))
  ) ? parseDateList(holidayDates).filter(date => date >= rangeStart && date <= rangeEnd) : undefined;
  const employerCalendar = publicShareVersion === undefined && sharedCalendar
    && employerScope(sharedCalendar.country, sharedCalendar.subdivision) === employerScope(country, subdivision)
    ? sharedCalendar : undefined;
  const landingPreview = params.get('lp') === '1';
  const holidayFocus = landingPreview ? params.get('hd') : null;
  const holidayFocusDate = holidayFocus && isValidISODate(holidayFocus)
    && holidayFocus >= rangeStart && holidayFocus <= rangeEnd ? holidayFocus : undefined;

  const wsRaw = params.get('ws');
  const weekStartOverride: WeekStart | 'auto' = wsRaw === '0' ? 0 : wsRaw === '1' ? 1 : 'auto';

  const accrualEnabled = params.get('ac') === '1';
  const amRaw = params.get('am');
  const amParsed = amRaw !== null ? Number(amRaw) : NaN;
  const accrualPerMonth = Number.isFinite(amParsed) && amParsed >= 0 ? amParsed : 1.25;

  const expiryEnabled = params.get('ex') === '1';
  const xd = params.get('xd');
  const expiryDate = xd && isValidISODate(xd) ? xd : undefined;
  const ccRaw = params.get('cc');
  const ccParsed = ccRaw !== null ? Number(ccRaw) : NaN;
  const carryoverCap = Number.isFinite(ccParsed) && ccParsed >= 0 ? ccParsed : 0;

  const overlapDays = parseDateList(params.get('od'));
  const blackouts = parseDateList(params.get('bo'));
  const workWeek = parseWorkWeek(params.get('ww')) ?? DEFAULT_WORK_WEEK;
  const pinnedDays = parseDateList(params.get('p'));
  const ruledOutDays = parseDateList(params.get('r'));

  const altFridayEnabled = params.get('af') === '1';
  const afsRaw = params.get('afs');
  const altFridayStart = afsRaw && isValidISODate(afsRaw) ? afsRaw : undefined;

  const rvRaw = params.get('rv');
  const rvParsed = rvRaw !== null ? Number(rvRaw) : NaN;
  const reserveDays = Number.isFinite(rvParsed) && rvParsed >= 0 ? rvParsed : 3;
  const unlimitedPto = params.get('up') === '1';

  const npRaw = params.get('np');
  const npParsed = npRaw !== null ? Number(npRaw) : NaN;
  const noticePeriodDays = Number.isFinite(npParsed) && npParsed >= 0 ? npParsed : 14;
  const noticeUnit: NoticeUnit = params.get('nu') === 'w' ? 'working' : 'calendar';

  const peakCapEnabled = params.get('pc') === '1';
  const pcs = params.get('pcs');
  const peakCapStart = pcs && isValidISODate(pcs) ? pcs : undefined;
  const pce = params.get('pce');
  const peakCapEnd = pce && isValidISODate(pce) ? pce : undefined;
  const pcmRaw = params.get('pcm');
  const pcmParsed = pcmRaw !== null ? Number(pcmRaw) : NaN;
  const peakCapMaxDays = Number.isFinite(pcmParsed) && pcmParsed >= 0 ? pcmParsed : 5;

  return {
    country,
    subdivision,
    ...(employerCalendar ? { employerCalendar } : {}),
    ...(publicShareVersion ? { publicShareVersion } : {}),
    ...(sharedObservedHolidays !== undefined ? { sharedObservedHolidays } : {}),
    ...(landingPreview ? { landingPreview: true as const } : {}),
    ...(holidayFocusDate ? { holidayFocusDate } : {}),
    rangeStart,
    rangeEnd,
    budget,
    ...(isNewPlan ? { planningVersion: 2 as const, planningStyle, minimumBreakDays } : {}),
    w: preset?.w ?? slider.w,
    breakCount: preset?.breakCount ?? slider.breakCount,
    weekStartOverride,
    accrualEnabled,
    accrualPerMonth,
    expiryEnabled,
    expiryDate,
    carryoverCap,
    overlapDays,
    blackouts,
    workWeek,
    pinnedDays,
    ruledOutDays,
    altFridayEnabled,
    altFridayStart,
    reserveDays,
    unlimitedPto,
    noticePeriodDays,
    noticeUnit,
    peakCapEnabled,
    peakCapStart,
    peakCapEnd,
    peakCapMaxDays,
  };
}

export interface WriteStateInput {
  planningVersion?: 2;
  planningStyle?: PlanningStyle;
  minimumBreakDays?: number;
  employerCalendar?: EmployerCalendar;
  publicShareVersion?: 1;
  sharedObservedHolidays?: readonly string[];
  landingPreview?: true;
  holidayFocusDate?: string;
  country: string;
  subdivision: string | undefined;
  rangeStart: string;
  rangeEnd: string;
  budget: number;
  w: number;
  breakCount: number;
  weekStartOverride: WeekStart | 'auto';
  accrualEnabled: boolean;
  accrualPerMonth: number;
  expiryEnabled: boolean;
  expiryDate: string;
  carryoverCap: number;
  overlapDays: string[];
  blackouts: string[];
  workWeek: WorkWeek;
  forced: Record<string, ForcedState>;
  altFridayEnabled: boolean;
  altFridayStart: string;
  reserveDays: number;
  unlimitedPto: boolean;
  noticePeriodDays: number;
  noticeUnit?: NoticeUnit;
  peakCapEnabled: boolean;
  peakCapStart: string;
  peakCapEnd: string;
  peakCapMaxDays: number;
}

/** Writes private in-memory plan state into `params` in place. For browser addresses,
 * call writeBrowserPlanStateToURL; for public links, pass the query to the public
 * allowlist. `country`/`rangeStart`/`rangeEnd` are
 * always written (see module doc); everything else is omitted when it's at its stable,
 * viewer-independent default, to keep the URL readable. */
export function writeFullStateToURL(params: URLSearchParams, state: WriteStateInput): void {
  writeSliderStateToURL(params, { w: state.w, breakCount: state.breakCount });
  if (state.planningVersion === 2) {
    params.set('pv', '2');
    params.set('ps', state.planningStyle ?? 'custom');
    params.set('mb', String(state.minimumBreakDays ?? 3));
  } else { params.delete('pv'); params.delete('ps'); params.delete('mb'); }
  const calendar = state.employerCalendar ? encodeEmployerCalendar(state.employerCalendar) : '';
  if (calendar) params.set('eh', calendar);
  else params.delete('eh');
  if (state.publicShareVersion === 1 || state.sharedObservedHolidays !== undefined) params.set('sv', '1');
  else params.delete('sv');
  if (state.sharedObservedHolidays !== undefined) {
    params.set('ho', encodeDateList([...new Set(state.sharedObservedHolidays)].sort()));
  } else {
    params.delete('ho');
  }
  if (state.landingPreview) params.set('lp', '1');
  else params.delete('lp');
  if (state.landingPreview && state.holidayFocusDate) params.set('hd', state.holidayFocusDate);
  else params.delete('hd');

  params.set('c', state.country);
  params.set('s', state.rangeStart);
  params.set('e', state.rangeEnd);
  params.set('b', String(state.budget));

  if (state.subdivision) params.set('sd', state.subdivision);
  else params.delete('sd');

  if (state.weekStartOverride === 'auto') params.delete('ws');
  else params.set('ws', String(state.weekStartOverride));

  if (state.accrualEnabled) {
    params.set('ac', '1');
    params.set('am', String(state.accrualPerMonth));
  } else {
    params.delete('ac');
    params.delete('am');
  }

  if (state.expiryEnabled) {
    params.set('ex', '1');
    params.set('xd', state.expiryDate);
    params.set('cc', String(state.carryoverCap));
  } else {
    params.delete('ex');
    params.delete('xd');
    params.delete('cc');
  }

  if (state.overlapDays.length) params.set('od', encodeDateList(state.overlapDays));
  else params.delete('od');

  if (state.blackouts.length) params.set('bo', encodeDateList(state.blackouts));
  else params.delete('bo');

  const wwEncoded = encodeWorkWeek(state.workWeek);
  if (wwEncoded === encodeWorkWeek(DEFAULT_WORK_WEEK)) params.delete('ww');
  else params.set('ww', wwEncoded);

  const pinned = Object.entries(state.forced)
    .filter(([, v]) => v === 'include')
    .map(([d]) => d)
    .sort();
  const ruledOut = Object.entries(state.forced)
    .filter(([, v]) => v === 'exclude')
    .map(([d]) => d)
    .sort();

  if (pinned.length) params.set('p', encodeDateList(pinned));
  else params.delete('p');

  if (ruledOut.length) params.set('r', encodeDateList(ruledOut));
  else params.delete('r');

  if (state.altFridayEnabled && state.altFridayStart) {
    params.set('af', '1');
    params.set('afs', state.altFridayStart);
  } else {
    params.delete('af');
    params.delete('afs');
  }

  if (state.reserveDays !== 3) params.set('rv', String(state.reserveDays));
  else params.delete('rv');

  if (state.unlimitedPto) params.set('up', '1');
  else params.delete('up');

  if (state.noticePeriodDays !== 14) params.set('np', String(state.noticePeriodDays));
  else params.delete('np');

  if (state.noticeUnit === 'working') params.set('nu', 'w');
  else params.delete('nu');

  if (state.peakCapEnabled && state.peakCapStart && state.peakCapEnd) {
    params.set('pc', '1');
    params.set('pcs', state.peakCapStart);
    params.set('pce', state.peakCapEnd);
    params.set('pcm', String(state.peakCapMaxDays));
  } else {
    params.delete('pc');
    params.delete('pcs');
    params.delete('pce');
    params.delete('pcm');
  }

  // 'ov' (partner-overlap payload) is a one-shot input signal consumed on load, never part
  // of ongoing state - always stripped once the app re-derives the URL from its own state.
  params.delete('ov');
}

const PRIVATE_PLAN_HISTORY_KEY = 'gaplessPrivatePlanV1';

function publicPlanFingerprint(params: URLSearchParams): string {
  const publicParams = new URLSearchParams(params);
  publicParams.delete('signin');
  publicParams.delete('jp');
  publicParams.sort();
  return publicParams.toString();
}

function browserHistoryRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** History state that carries `privateSearch` as this entry's private draft for the
 * public `search`, so readBrowserPlanSearch restores it. Only private (non-address) keys
 * are kept: a hand-off can add private inputs but never override public ones. */
export function historyWithPrivatePlanDraft(search: string, historyState: unknown, privateSearch: string): Record<string, unknown> {
  const draft = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(privateSearch)) {
    if (!isPlanAddressKey(key) && PLAN_URL_KEYS[key] === 'private') draft.set(key, value);
  }
  return {
    ...browserHistoryRecord(historyState),
    [PRIVATE_PLAN_HISTORY_KEY]: { publicSearch: publicPlanFingerprint(new URLSearchParams(search)), privateSearch: draft.toString() },
  };
}

/** Restore a draft from the current history entry after refresh. An incoming link
 * has its own history entry, and explicit URL fields always take precedence. */
export function readBrowserPlanSearch(search: string, historyState: unknown): string {
  const params = new URLSearchParams(search);
  const draft = browserHistoryRecord(browserHistoryRecord(historyState)[PRIVATE_PLAN_HISTORY_KEY]);
  if (typeof draft.privateSearch !== 'string' || draft.privateSearch.length > 180_000
    || draft.publicSearch !== publicPlanFingerprint(params)) return search;
  for (const [key, value] of new URLSearchParams(draft.privateSearch)) {
    if (!isPlanAddressKey(key) && !params.has(key)) params.set(key, value);
  }
  return params.toString();
}

/** A public link cannot carry employer settings. The current tab can still
 * restore the employer edits it stored privately after opening that link. */
export function readBrowserFullState(search: string, historyState: unknown, defaults: FullURLDefaults): FullURLState {
  const merged = readBrowserPlanSearch(search, historyState);
  const plan = readFullStateFromURL(merged, defaults);
  if (plan.publicShareVersion !== 1 || plan.sharedObservedHolidays !== undefined || new URLSearchParams(search).has('eh')) return plan;
  const employerCalendar = decodeEmployerCalendar(new URLSearchParams(merged).get('eh'));
  if (!employerCalendar || employerScope(employerCalendar.country, employerCalendar.subdivision) !== employerScope(plan.country ?? defaults.country, plan.subdivision)) return plan;
  return { ...plan, employerCalendar };
}

/** Write public controls into the address bar and private draft state into the
 * current history entry. Does not overwrite a saved employer profile. */
export function writeBrowserPlanStateToURL(params: URLSearchParams, state: WriteStateInput, historyState: unknown): Record<string, unknown> {
  const previous = new URLSearchParams(readBrowserPlanSearch(params.toString(), historyState));
  const full = new URLSearchParams();
  writeFullStateToURL(full, state);
  // Allowlist (src/ui/shareFormat.ts): only public planning keys reach the address bar.
  // Everything else, including any key added later without classification, stays in
  // this tab's history entry.
  const { address, draft } = partitionPlanParams(full);
  for (const key of [...params.keys()]) params.delete(key);
  for (const [key, value] of address) {
    if (key === 'c' && !/^[A-Z]{2}$/.test(value)) continue;
    if (key === 'sd' && !/^[A-Z0-9-]{1,16}$/.test(value)) continue;
    params.set(key, value);
  }
  // The recipient's incoming partner payload remains usable after refresh. The
  // current overlap date state has already consumed the legacy ov payload.
  for (const key of ['pp', 'ov']) {
    const value = previous.get(key);
    if (value && value.length <= 12_000) draft.set(key, value);
  }
  const signin = previous.get('signin');
  if (signin === 'ok' || signin === 'expired') params.set('signin', signin);
  if (previous.get('jp') === '0') params.set('jp', '0');
  return {
    ...browserHistoryRecord(historyState),
    [PRIVATE_PLAN_HISTORY_KEY]: { publicSearch: publicPlanFingerprint(params), privateSearch: draft.toString() },
  };
}

// ---------------------------------------------------------------------------------------
// Partner overlap link (Phase 1D). A minimal, standalone URL - just the sharer's resulting
// days off, nothing else of their own settings - that prefills as the RECIPIENT's overlap
// days. Deliberately a separate param ('ov') from the full-state 'od' (overlap days) so a
// visitor arriving via this link is recognisably "received a partner's days", distinct from
// someone reopening their own previously-shared full-state link.
// ---------------------------------------------------------------------------------------

/** Builds a standalone URL (origin + pathname only, no other state) carrying `daysOff` as
 * the partner-overlap payload for whoever opens it. */
export function buildOverlapShareURL(origin: string, pathname: string, daysOff: string[]): string {
  const params = new URLSearchParams();
  params.set('ov', encodeDateList(daysOff));
  return `${origin}${pathname}?${params.toString()}`;
}

/** Reads the partner-overlap payload from the URL, if present. Malformed or missing days
 * are dropped silently, same as every other date-list param. */
export function readOverlapPayloadFromURL(search: string): string[] {
  const params = new URLSearchParams(search);
  return parseDateList(params.get('ov'));
}
