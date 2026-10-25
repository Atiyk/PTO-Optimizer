import type { WorkWeek } from '../solver/types';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import type { WeekStart } from './calendarMath';
import type { ForcedState } from './types';

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

  if (legacyObjective && legacyObjective in OLD_OBJECTIVE_TO_W) {
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
// Full app state encoding (Phase 1A: shareable URL).
//
// The solver is deterministic, so encoding every input it reads - plus the few UI-only
// settings a recipient needs to see the same calendar - means the same URL reproduces the
// same plan for anyone, at any time. Two fields are NOT safe to omit even when they equal
// "the default," because their default is relative to the viewer, not a fixed constant:
//   - rangeStart/rangeEnd default to "today" through "Dec 31 this year" - omitting them
//     would silently re-anchor to a different today days or years later.
//   - country defaults to a geolocated guess from the browser - omitting it would show a
//     visitor from a different country their own guess instead of the sharer's plan.
// Both are therefore always written, never conditionally dropped.
// ---------------------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Rejects malformed strings and calendar dates that don't round-trip (e.g. month 13, Feb 30). */
function isValidISODate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parseDateList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(isValidISODate);
}

function encodeDateList(dates: string[]): string {
  return dates.join(',');
}

function parseWorkWeek(raw: string | null): WorkWeek | undefined {
  if (!raw || raw.length !== 7 || !/^[01]{7}$/.test(raw)) return undefined;
  return raw.split('').map((c) => c === '1') as unknown as WorkWeek;
}

function encodeWorkWeek(ww: WorkWeek): string {
  return ww.map((v) => (v ? '1' : '0')).join('');
}

export interface FullURLState {
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

  return {
    country,
    subdivision,
    rangeStart,
    rangeEnd,
    budget,
    w: slider.w,
    breakCount: slider.breakCount,
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
  };
}

export interface WriteStateInput {
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
}

/** Writes the full app state into `params` in place. `country`/`rangeStart`/`rangeEnd` are
 * always written (see module doc); everything else is omitted when it's at its stable,
 * viewer-independent default, to keep the URL readable. */
export function writeFullStateToURL(params: URLSearchParams, state: WriteStateInput): void {
  writeSliderStateToURL(params, { w: state.w, breakCount: state.breakCount });

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

  // 'ov' (partner-overlap payload) is a one-shot input signal consumed on load, never part
  // of ongoing state - always stripped once the app re-derives the URL from its own state.
  params.delete('ov');
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
