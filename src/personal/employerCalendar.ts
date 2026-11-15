import { guardedWrite, recordRevision, type GuardedWriteResult } from './storageRecord';

/**
 * Consumer-only employer calendars. Editing a shared URL never writes browser storage.
 *
 * Version 1 (legacy, still read and written unchanged): every public AND regional holiday
 * is a day off unless its `date|name` key is in `excluded`; `custom` adds company days.
 *
 * Version 2 keeps both fields with the same meaning and separates three kinds of day:
 * - public (national) holidays: on unless their name is in `skipped` (every year) or a
 *   single `date|name` is in `excluded`;
 * - regional (state/province) holidays: in the US, OFF unless their name is in `regional`,
 *   so picking a state never turns its government holidays into employer days off by
 *   default; elsewhere on unless skipped (see regionalHolidaysOptIn);
 * - employer-observed days: named extras the company gives (`extras`, e.g. Christmas Eve)
 *   and `custom` company days.
 * A version 1 calendar is never rewritten on read; it is upgraded only when the user edits
 * it, carrying the regional days that were on (see upgradeEmployerCalendar).
 */
export interface EmployerCalendar {
  version: 1 | 2;
  country: string;
  subdivision?: string;
  excluded: string[];
  custom: { date: string; name: string }[];
  /** v2: public holiday names the employer does not give, in any year. */
  skipped?: string[];
  /** v2: regional holiday names the employer does give. */
  regional?: string[];
  /** v2: employer-only extra days switched on, by id (see employerHolidayChoices). */
  extras?: string[];
}

const MAX_PAYLOAD = 16000;
const MAX_ENTRIES = 300;
export const EMPLOYER_STORAGE_PREFIX = 'gapless.employer.v1:';

export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function employerScope(country: string, subdivision?: string): string {
  return `${country}:${subdivision ?? ''}`;
}

/** The legacy public-holiday default: every public and regional holiday observed. Links
 * and feeds without an employer calendar keep this meaning. */
export function defaultEmployerCalendar(country: string, subdivision?: string): EmployerCalendar {
  return { version: 1, country, ...(subdivision ? { subdivision } : {}), excluded: [], custom: [] };
}

/** A new visitor's calendar: public holidays on, regional and employer-only days opt-in. */
export function freshEmployerCalendar(country: string, subdivision?: string): EmployerCalendar {
  return { version: 2, country, ...(subdivision ? { subdivision } : {}), excluded: [], custom: [], skipped: [], regional: [], extras: [] };
}

/** True when the calendar differs from "every public holiday, nothing else". */
export function employerCalendarCustomized(calendar: EmployerCalendar): boolean {
  return calendar.excluded.length > 0 || calendar.custom.length > 0
    || (calendar.skipped?.length ?? 0) > 0 || (calendar.regional?.length ?? 0) > 0 || (calendar.extras?.length ?? 0) > 0;
}

/**
 * Lossless v1 -> v2 upgrade, used on the first edit of a legacy calendar. In v1 every
 * regional holiday was on unless excluded, so the regional names in scope are carried as
 * opted in; exclusions and company days are kept as they are. Never drops data.
 */
export function upgradeEmployerCalendar(calendar: EmployerCalendar, regionalNamesInScope: readonly string[]): EmployerCalendar {
  if (calendar.version === 2) return calendar;
  return {
    ...calendar, version: 2, skipped: [], extras: [],
    regional: [...new Set(regionalNamesInScope)].sort(),
  };
}

const NAME = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  && value.length <= 160 && !/[\u0000-\u001f]/.test(value);
const EXTRA_ID = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value);

function nameList(value: unknown, valid: (v: unknown) => v is string): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES || !value.every(valid)) return undefined;
  return [...new Set(value.map((item: string) => item.trim()))].sort();
}

function validate(value: unknown): EmployerCalendar | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Partial<EmployerCalendar>;
  if ((data.version !== 1 && data.version !== 2) || typeof data.country !== 'string' || !/^[A-Z]{2}$/.test(data.country)) return undefined;
  if (data.subdivision !== undefined && (typeof data.subdivision !== 'string' || !/^[A-Z0-9-]{1,16}$/.test(data.subdivision))) return undefined;
  if (!Array.isArray(data.excluded) || !Array.isArray(data.custom) || data.excluded.length > MAX_ENTRIES || data.custom.length > MAX_ENTRIES) return undefined;
  if (!data.excluded.every(key => typeof key === 'string' && key[10] === '|' && validCalendarDate(key.slice(0, 10)) && key.length > 11 && key.length <= 171)) return undefined;
  if (!data.custom.every(item => item && typeof item.date === 'string' && validCalendarDate(item.date) && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 160 && !/[\u0000-\u001f]/.test(item.name))) return undefined;
  const unique = new Map(data.custom.map(item => [`${item.date}|${item.name.trim()}`, { date: item.date, name: item.name.trim() }]));
  const base = {
    excluded: [...new Set(data.excluded)].sort(),
    custom: [...unique.values()].sort((a, b) => `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`)),
  };
  if (data.version === 1) return { ...defaultEmployerCalendar(data.country, data.subdivision), ...base };
  const skipped = nameList(data.skipped ?? [], NAME);
  const regional = nameList(data.regional ?? [], NAME);
  const extras = nameList(data.extras ?? [], EXTRA_ID);
  if (!skipped || !regional || !extras) return undefined;
  return { ...freshEmployerCalendar(data.country, data.subdivision), ...base, skipped, regional, extras };
}

export function encodeEmployerCalendar(calendar: EmployerCalendar): string {
  const valid = validate(calendar);
  if (!valid) return '';
  const fields = [valid.country, valid.subdivision ?? '', valid.excluded, valid.custom.map(h => [h.date, h.name])];
  // Version 1 keeps its exact historical encoding, so old links round-trip byte for byte.
  const value = valid.version === 1 ? `1.${JSON.stringify(fields)}`
    : `2.${JSON.stringify([...fields, valid.skipped ?? [], valid.regional ?? [], valid.extras ?? []])}`;
  return value.length <= MAX_PAYLOAD ? value : '';
}

export function decodeEmployerCalendar(raw: string | null): EmployerCalendar | undefined {
  if (!raw || raw.length > MAX_PAYLOAD || !(raw.startsWith('1.') || raw.startsWith('2.'))) return undefined;
  const version = raw.startsWith('1.') ? 1 : 2;
  try {
    const fields: unknown = JSON.parse(raw.slice(2));
    if (!Array.isArray(fields) || fields.length !== (version === 1 ? 4 : 7)) return undefined;
    const [country, subdivision, excluded, custom, skipped, regional, extras] = fields;
    if (!Array.isArray(custom)) return undefined;
    return validate({
      version, country, subdivision: subdivision || undefined, excluded,
      custom: custom.map(item => Array.isArray(item) ? { date: item[0], name: item[1] } : null) as EmployerCalendar['custom'],
      ...(version === 2 ? { skipped, regional, extras } : {}),
    });
  } catch { return undefined; }
}

/** Per scope, the stored revision this tab last loaded or wrote (stale-save detection). */
const loadedRevisions = new Map<string, string>();

function readStoredCalendar(country: string, subdivision?: string): EmployerCalendar | undefined {
  const key = EMPLOYER_STORAGE_PREFIX + employerScope(country, subdivision);
  const raw = localStorage.getItem(key);
  loadedRevisions.set(key, recordRevision(raw));
  const calendar = decodeEmployerCalendar(raw);
  return calendar && employerScope(calendar.country, calendar.subdivision) === employerScope(country, subdivision) ? calendar : undefined;
}

/**
 * The saved calendar for this country and region. With nothing saved for a region, the
 * country-wide choices (skipped public days, company days, extras) carry over and that
 * region's own holidays start opt-in. With nothing saved at all: freshEmployerCalendar.
 */
export function readEmployerCalendar(country: string, subdivision?: string): EmployerCalendar {
  try {
    const own = readStoredCalendar(country, subdivision);
    if (own) return own;
    if (subdivision) {
      const national = readStoredCalendar(country);
      if (national) {
        const upgraded = upgradeEmployerCalendar(national, []);
        return { ...upgraded, subdivision, regional: [] };
      }
    }
  } catch { /* Disabled storage leaves live planning functional. */ }
  return freshEmployerCalendar(country, subdivision);
}

/** True when this exact country/region has a saved calendar (not an inherited one). */
export function hasStoredEmployerCalendar(country: string, subdivision?: string): boolean {
  try { return readStoredCalendar(country, subdivision) !== undefined; } catch { return false; }
}

/**
 * Save (the planner auto-saves edits, debounced). 'stale' means another tab saved this scope after this tab loaded it:
 * nothing is overwritten, and saving again replaces it deliberately. An unreadable stored
 * calendar is quarantined first.
 */
export function writeEmployerCalendar(calendar: EmployerCalendar): GuardedWriteResult['status'] {
  const value = encodeEmployerCalendar(calendar);
  if (!value) return 'unavailable';
  const key = EMPLOYER_STORAGE_PREFIX + employerScope(calendar.country, calendar.subdivision);
  let storage: Storage;
  try { storage = localStorage; } catch { return 'unavailable'; }
  const result = guardedWrite(storage, key, value, {
    expectedRevision: loadedRevisions.get(key),
    isClean: raw => decodeEmployerCalendar(raw) !== undefined,
    // A calendar written by a newer app version is never downgraded by this one.
    isNewer: raw => /^[3-9]\./.test(raw),
    migrates: false,
  });
  if (result.status === 'saved') loadedRevisions.set(key, result.revision);
  else if (result.status === 'stale') { try { loadedRevisions.set(key, recordRevision(storage.getItem(key))); } catch { /* unchanged */ } }
  return result.status;
}

export function saveEmployerCalendar(calendar: EmployerCalendar): boolean {
  return writeEmployerCalendar(calendar) === 'saved';
}

export function deleteEmployerCalendar(country: string, subdivision?: string): boolean {
  try {
    const key = EMPLOYER_STORAGE_PREFIX + employerScope(country, subdivision);
    localStorage.removeItem(key);
    loadedRevisions.set(key, 'missing');
    return true;
  }
  catch { return false; }
}
