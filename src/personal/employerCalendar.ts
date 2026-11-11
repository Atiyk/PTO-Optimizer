import { guardedWrite, recordRevision, type GuardedWriteResult } from './storageRecord';

/** Consumer-only employer calendars. Editing a shared URL never writes browser storage. */
export interface EmployerCalendar {
  version: 1;
  country: string;
  subdivision?: string;
  excluded: string[];
  custom: { date: string; name: string }[];
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

export function defaultEmployerCalendar(country: string, subdivision?: string): EmployerCalendar {
  return { version: 1, country, ...(subdivision ? { subdivision } : {}), excluded: [], custom: [] };
}

function validate(value: unknown): EmployerCalendar | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Partial<EmployerCalendar>;
  if (data.version !== 1 || typeof data.country !== 'string' || !/^[A-Z]{2}$/.test(data.country)) return undefined;
  if (data.subdivision !== undefined && (typeof data.subdivision !== 'string' || !/^[A-Z0-9-]{1,16}$/.test(data.subdivision))) return undefined;
  if (!Array.isArray(data.excluded) || !Array.isArray(data.custom) || data.excluded.length > MAX_ENTRIES || data.custom.length > MAX_ENTRIES) return undefined;
  if (!data.excluded.every(key => typeof key === 'string' && key[10] === '|' && validCalendarDate(key.slice(0, 10)) && key.length > 11 && key.length <= 171)) return undefined;
  if (!data.custom.every(item => item && typeof item.date === 'string' && validCalendarDate(item.date) && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 160 && !/[\u0000-\u001f]/.test(item.name))) return undefined;
  const unique = new Map(data.custom.map(item => [`${item.date}|${item.name.trim()}`, { date: item.date, name: item.name.trim() }]));
  return { ...defaultEmployerCalendar(data.country, data.subdivision), excluded: [...new Set(data.excluded)].sort(), custom: [...unique.values()].sort((a, b) => `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`)) };
}

export function encodeEmployerCalendar(calendar: EmployerCalendar): string {
  const valid = validate(calendar);
  if (!valid) return '';
  const value = `1.${JSON.stringify([valid.country, valid.subdivision ?? '', valid.excluded, valid.custom.map(h => [h.date, h.name])])}`;
  return value.length <= MAX_PAYLOAD ? value : '';
}

export function decodeEmployerCalendar(raw: string | null): EmployerCalendar | undefined {
  if (!raw || raw.length > MAX_PAYLOAD || !raw.startsWith('1.')) return undefined;
  try {
    const [country, subdivision, excluded, custom] = JSON.parse(raw.slice(2));
    if (!Array.isArray(custom)) return undefined;
    return validate({ version: 1, country, subdivision: subdivision || undefined, excluded, custom: custom.map(item => Array.isArray(item) ? { date: item[0], name: item[1] } : null) });
  } catch { return undefined; }
}

/** Per scope, the stored revision this tab last loaded or wrote (stale-save detection). */
const loadedRevisions = new Map<string, string>();

export function readEmployerCalendar(country: string, subdivision?: string): EmployerCalendar {
  try {
    const key = EMPLOYER_STORAGE_PREFIX + employerScope(country, subdivision);
    const raw = localStorage.getItem(key);
    loadedRevisions.set(key, recordRevision(raw));
    const calendar = decodeEmployerCalendar(raw);
    if (calendar && employerScope(calendar.country, calendar.subdivision) === employerScope(country, subdivision)) return calendar;
  } catch { /* Disabled storage leaves live planning functional. */ }
  return defaultEmployerCalendar(country, subdivision);
}

/**
 * Explicit save. 'stale' means another tab saved this scope after this tab loaded it:
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
