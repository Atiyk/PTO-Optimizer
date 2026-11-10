import { addDays, isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { MAX_FAMILY_PTO } from '../personal/familyPlan';
import { MAX_SCHOOL_CALENDAR_DAYS } from '../personal/schoolCalendar';
import { decodePartnerAvailability, encodePartnerAvailability, PARTNER_PARAM, type PartnerAvailability } from '../planning/partner';
import { isValidISODate } from './urlState';

/**
 * URL round-tripping for /family, same conventions as sabbaticalUrlState.ts: clamp numbers
 * on read, only write non-defaults, and leave `c`/`s` undefined when absent so the viewer's
 * own country and today take over. Private dates and district selections are read from
 * legacy links or intentionally shared links, and then stay in the current history entry.
 * A malformed param is reported in `invalid` and treated as absent.
 */
export const DEFAULT_FAMILY_PTO = 10;
export const MAX_FAMILY_DATES_PARAM = 1500;
const MAX_SEARCH_LENGTH = 50_000;
/** Base36 fields are at most 4 chars (1,679,615): enough for any gap or run in range. */
const FIELD = '[0-9a-z]{1,4}';
const FIRST_RANGE = new RegExp(`^(\\d{8})\\.(${FIELD})$`);
const NEXT_RANGE = new RegExp(`^(${FIELD})\\.(${FIELD})$`);
const DISTRICT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const COUNTRY = /^[A-Za-z]{2}$/;
const FAMILY_DRAFT_PARAMS = ['d', 'sd', 'x', PARTNER_PARAM] as const;

export interface FamilyURLState {
  country?: string;
  start?: string;
  ptoBudget: number;
  districtId?: string;
  customOffDays: string[];
  excludedBreaks: string[];
  /** The other adult's shared availability (`pp`), when present and valid. */
  availability?: PartnerAvailability;
  ask: boolean;
  /** Param names that were present but malformed, e.g. ['sd']. */
  invalid: string[];
}

export interface FamilyURLWriteState {
  country?: string;
  start?: string;
  /** The start a fresh visit would compute (today); `s` is omitted when equal. */
  defaultStart?: string;
  ptoBudget: number;
  districtId?: string;
  customOffDays: readonly string[];
  excludedBreaks: readonly string[];
  availability?: PartnerAvailability | null;
  ask?: boolean;
}

function normalize(dates: readonly string[]): string[] {
  return [...new Set(dates.filter(date => typeof date === 'string' && isValidISODate(date)))].sort();
}

/**
 * Compact runs: the first as `YYYYMMDD.len`, each later one as `gap.len`, where gap counts
 * days from the previous run's end to this run's start. Numbers are base36. A school year's
 * closures fit in well under 100 chars, e.g. "20261221.c,9.2" = Dec 21 - Jan 1, Jan 10 - 11.
 * Invalid dates are dropped.
 */
export function encodeDateRanges(dates: readonly string[]): string {
  const values = normalize(dates);
  const parts: string[] = [];
  let prevEnd: string | undefined;
  for (let i = 0; i < values.length; i++) {
    const start = values[i];
    let end = start;
    while (i + 1 < values.length && values[i + 1] === addDays(end, 1)) end = values[++i];
    const length = (isoToSerial(end) - isoToSerial(start) + 1).toString(36);
    parts.push(prevEnd === undefined
      ? `${start.replaceAll('-', '')}.${length}`
      : `${(isoToSerial(start) - isoToSerial(prevEnd)).toString(36)}.${length}`);
    prevEnd = end;
  }
  return parts.join(',');
}

/** Strict inverse of encodeDateRanges; null for anything malformed or oversized. */
export function decodeDateRanges(raw: string): string[] | null {
  if (typeof raw !== 'string' || raw.length > MAX_FAMILY_DATES_PARAM) return null;
  if (raw === '') return [];
  const dates: string[] = [];
  let cursor: string | undefined;
  for (const item of raw.split(',')) {
    let start: string;
    let length: number;
    if (cursor === undefined) {
      const match = FIRST_RANGE.exec(item);
      if (!match) return null;
      start = `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`;
      if (!isValidISODate(start)) return null;
      length = parseInt(match[2], 36);
    } else {
      const match = NEXT_RANGE.exec(item);
      if (!match) return null;
      const gap = parseInt(match[1], 36);
      // Gap 1 would be adjacent; the encoder merges those, but they are still unambiguous.
      if (gap < 1) return null;
      start = addDays(cursor, gap);
      length = parseInt(match[2], 36);
    }
    if (length < 1 || dates.length + length > MAX_SCHOOL_CALENDAR_DAYS) return null;
    for (let offset = 0; offset < length; offset++) dates.push(addDays(start, offset));
    cursor = dates[dates.length - 1];
    if (!isValidISODate(cursor)) return null; // ran past year 9999
  }
  return dates;
}

function clampedPto(raw: string | null): number | null {
  if (raw === null) return DEFAULT_FAMILY_PTO;
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(MAX_FAMILY_PTO, Math.round(parsed)));
}

export function readFamilyStateFromURL(search: string): FamilyURLState {
  const state: FamilyURLState = { ptoBudget: DEFAULT_FAMILY_PTO, customOffDays: [], excludedBreaks: [], ask: false, invalid: [] };
  // Bound before parsing so a pathological link never expands into huge arrays.
  if (typeof search !== 'string' || search.length > MAX_SEARCH_LENGTH) {
    state.invalid.push('search');
    return state;
  }
  const params = new URLSearchParams(search);
  const bad = (name: string) => state.invalid.push(name);

  const country = params.get('c');
  if (country !== null) { if (COUNTRY.test(country)) state.country = country.toUpperCase(); else bad('c'); }
  const start = params.get('s');
  if (start !== null) { if (isValidISODate(start)) state.start = start; else bad('s'); }
  const pto = clampedPto(params.get('pto'));
  if (pto === null) bad('pto'); else state.ptoBudget = pto;
  const district = params.get('d');
  if (district !== null) { if (DISTRICT_ID.test(district)) state.districtId = district; else bad('d'); }
  for (const [name, key] of [['sd', 'customOffDays'], ['x', 'excludedBreaks']] as const) {
    const raw = params.get(name);
    if (raw === null) continue;
    const dates = decodeDateRanges(raw);
    if (dates) state[key] = dates; else bad(name);
  }
  const pp = params.get(PARTNER_PARAM);
  if (pp !== null) {
    const availability = decodePartnerAvailability(pp);
    if (availability) state.availability = availability; else bad(PARTNER_PARAM);
  }
  const ask = params.get('ask');
  if (ask !== null) { if (ask === '1') state.ask = true; else bad('ask'); }
  return state;
}

/** An incoming share takes precedence over private state in the current history entry. */
export function readFamilyBrowserState(search: string, draft: unknown): FamilyURLState {
  const state = readFamilyStateFromURL(search);
  if (typeof draft !== 'string' || state.invalid.includes('search')) return state;
  const incoming = new URLSearchParams(search);
  if (FAMILY_DRAFT_PARAMS.some((key) => incoming.has(key))) return state;
  const { districtId, customOffDays, excludedBreaks, availability } = readFamilyStateFromURL(draft);
  return { ...state, districtId, customOffDays, excludedBreaks, availability };
}

function setOrDelete(params: URLSearchParams, name: string, value: string | undefined): void {
  if (value === undefined || value === '') params.delete(name);
  else params.set(name, value);
}

/**
 * Writes only non-default values and deletes the rest, so a plain `/family` stays plain.
 * Returns the names of params that could not be written because they would exceed the
 * link size limit (the UI should say so rather than silently drop dates).
 */
export function writeFamilyStateToURL(params: URLSearchParams, state: FamilyURLWriteState): string[] {
  const skipped: string[] = [];
  setOrDelete(params, 'c', state.country);
  setOrDelete(params, 's', state.start && state.start !== state.defaultStart ? state.start : undefined);
  const pto = Math.max(0, Math.min(MAX_FAMILY_PTO, Math.round(state.ptoBudget)));
  setOrDelete(params, 'pto', Number.isFinite(pto) && pto !== DEFAULT_FAMILY_PTO ? String(pto) : undefined);
  setOrDelete(params, 'd', state.districtId);
  for (const [name, dates] of [['sd', state.customOffDays], ['x', state.excludedBreaks]] as const) {
    const encoded = encodeDateRanges(dates);
    if (encoded.length > MAX_FAMILY_DATES_PARAM) { skipped.push(name); params.delete(name); }
    else setOrDelete(params, name, encoded);
  }
  let pp: string | undefined;
  if (state.availability?.days.length) {
    try { pp = encodePartnerAvailability(state.availability); } catch { skipped.push(PARTNER_PARAM); }
  }
  setOrDelete(params, PARTNER_PARAM, pp);
  setOrDelete(params, 'ask', state.ask ? '1' : undefined);
  return skipped;
}

/** Allowlist the address and keep private inputs in the same tab's history entry. */
export function writeFamilyBrowserState(state: FamilyURLWriteState): { search: string; draft: string; skipped: string[] } {
  const publicParams = new URLSearchParams();
  const skipped = writeFamilyStateToURL(publicParams, state);
  const draft = new URLSearchParams();
  for (const key of FAMILY_DRAFT_PARAMS) {
    const value = publicParams.get(key);
    if (value !== null) draft.set(key, value);
    publicParams.delete(key);
  }
  return { search: publicParams.toString(), draft: draft.toString(), skipped };
}

/**
 * Share link: school dates (d and/or sd) + optional sender availability as pp. Dates only:
 * the sender's budget, window, excluded breaks and anything typed are never included.
 * Throws the partner encoder's own user-facing error if the availability is too large.
 */
export function buildFamilyShareURL(origin: string, opts: {
  districtId?: string;
  customOffDays: readonly string[];
  country?: string;
  availability?: PartnerAvailability;
  ask?: boolean;
}): string {
  const params = new URLSearchParams();
  if (opts.country && COUNTRY.test(opts.country)) params.set('c', opts.country.toUpperCase());
  if (opts.districtId && DISTRICT_ID.test(opts.districtId)) params.set('d', opts.districtId);
  const sd = encodeDateRanges(opts.customOffDays);
  if (sd.length > MAX_FAMILY_DATES_PARAM) throw new Error('Too many school dates to share in a link.');
  if (sd) params.set('sd', sd);
  if (opts.availability?.days.length) params.set(PARTNER_PARAM, encodePartnerAvailability(opts.availability));
  if (opts.ask) params.set('ask', '1');
  const query = params.toString();
  return `${origin}/family${query ? `?${query}` : ''}`;
}
