import type { WorkWeek } from '@daysoff/engine/solver/types';
import {
  decodeEmployerCalendar, encodeEmployerCalendar, employerScope,
  validCalendarDate, type EmployerCalendar,
} from './employerCalendar';

/**
 * Named LOCAL presets, not the active legacy employer calendar and never a URL payload.
 * Existing gapless.employer.v1:* entries remain the source of truth for older plans.
 * Applying a preset is a pure operation: it does not overwrite a saved calendar.
 */
export const EMPLOYER_PROFILES_STORAGE_KEY = 'gapless.employer.profiles.v1';
export const MAX_EMPLOYER_PROFILES = 12;
const MAX_SERIALIZED_BYTES = 64_000;
const MAX_BLACKOUT_DAYS = 1_096;

export interface EmployerWorkProfile {
  version: 1;
  id: string;
  name: string;
  calendar: EmployerCalendar;
  /** Monday through Sunday, same ordering as the consumer planner. */
  workWeek: WorkWeek;
  altFridayEnabled: boolean;
  altFridayStart: string | null;
  blackoutDays: string[];
  /** A recurring calendar reset date, not an inferred accrual or legal rule. */
  planningYearStart: { month: number; day: number };
}

export interface EmployerProfileOverrides {
  calendar?: EmployerCalendar;
  workWeek?: WorkWeek;
  altFridayEnabled?: boolean;
  altFridayStart?: string | null;
  blackoutDays?: readonly string[];
}

export interface ResolvedEmployerWorkCalendar {
  calendar: EmployerCalendar;
  workWeek: WorkWeek;
  altFridayEnabled: boolean;
  altFridayStart: string | null;
  blackoutDays: string[];
  planningYearStart: { month: number; day: number };
  /** Explicit plan overrides are ephemeral and must not mutate local presets. */
  overridden: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validWeek(value: unknown): value is WorkWeek {
  return Array.isArray(value) && value.length === 7
    && value.every((day) => typeof day === 'boolean') && value.some(Boolean);
}

function normalizeDays(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_BLACKOUT_DAYS
    || !value.every((day) => typeof day === 'string' && validCalendarDate(day))) return null;
  return [...new Set(value as string[])].sort();
}

function validPlanningYear(value: unknown): value is { month: number; day: number } {
  const v = asRecord(value);
  if (!v || !Number.isInteger(v.month) || !Number.isInteger(v.day)) return false;
  const month = v.month as number;
  const day = v.day as number;
  // A recurring Feb 29 reset is ambiguous in non-leap years: require an annual date.
  return month >= 1 && month <= 12 && day >= 1
    && validCalendarDate(`2027-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

function normalizeCalendar(value: unknown): EmployerCalendar | null {
  if (!asRecord(value)) return null;
  const encoded = encodeEmployerCalendar(value as unknown as EmployerCalendar);
  return encoded ? decodeEmployerCalendar(encoded) ?? null : null;
}

/** Rejects invalid versions, cross-scope data and malformed storage; never coerces dates. */
export function normalizeEmployerWorkProfile(value: unknown): EmployerWorkProfile | null {
  const v = asRecord(value);
  if (!v || v.version !== 1 || typeof v.id !== 'string'
    || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(v.id)
    || typeof v.name !== 'string' || v.name !== v.name.trim()
    || v.name.length < 1 || v.name.length > 64
    || /[\u0000-\u001f\u007f]/.test(v.name)) return null;
  const calendar = normalizeCalendar(v.calendar);
  const days = normalizeDays(v.blackoutDays);
  if (!calendar || !validWeek(v.workWeek) || !days || !validPlanningYear(v.planningYearStart)
    || typeof v.altFridayEnabled !== 'boolean'
    || !(v.altFridayStart === null || (typeof v.altFridayStart === 'string'
      && validCalendarDate(v.altFridayStart)))
    || (v.altFridayEnabled && v.altFridayStart === null)
    || (!v.altFridayEnabled && v.altFridayStart !== null)) return null;

  return {
    version: 1, id: v.id, name: v.name, calendar,
    workWeek: [...v.workWeek] as WorkWeek,
    altFridayEnabled: v.altFridayEnabled,
    altFridayStart: v.altFridayStart as string | null,
    blackoutDays: days,
    planningYearStart: { month: v.planningYearStart.month, day: v.planningYearStart.day },
  };
}

function normalizeCollection(value: unknown): EmployerWorkProfile[] | null {
  if (!Array.isArray(value) || value.length > MAX_EMPLOYER_PROFILES) return null;
  const profiles: EmployerWorkProfile[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    const profile = normalizeEmployerWorkProfile(entry);
    if (!profile || ids.has(profile.id)) return null;
    ids.add(profile.id);
    profiles.push(profile);
  }
  return profiles.sort((a, b) => a.id.localeCompare(b.id));
}

export function encodeEmployerWorkProfiles(value: unknown): string {
  const profiles = normalizeCollection(value);
  if (!profiles) return '';
  const encoded = JSON.stringify({ version: 1, profiles });
  return encoded.length <= MAX_SERIALIZED_BYTES ? encoded : '';
}

export function decodeEmployerWorkProfiles(raw: string | null): EmployerWorkProfile[] | null {
  if (!raw || raw.length > MAX_SERIALIZED_BYTES) return null;
  try {
    const value = asRecord(JSON.parse(raw));
    return value?.version === 1 ? normalizeCollection(value.profiles) : null;
  } catch { return null; }
}

/** Named presets have their own local key and never overwrite the existing active calendar. */
export function readEmployerWorkProfiles(): EmployerWorkProfile[] {
  try { return decodeEmployerWorkProfiles(localStorage.getItem(EMPLOYER_PROFILES_STORAGE_KEY)) ?? []; }
  catch { return []; }
}

export function saveEmployerWorkProfiles(value: unknown): boolean {
  const encoded = encodeEmployerWorkProfiles(value);
  if (!encoded) return false;
  try { localStorage.setItem(EMPLOYER_PROFILES_STORAGE_KEY, encoded); return true; }
  catch { return false; }
}

export function deleteEmployerWorkProfiles(): boolean {
  try { localStorage.removeItem(EMPLOYER_PROFILES_STORAGE_KEY); return true; }
  catch { return false; }
}

/** Pure update for UI editors. No storage write, URL update or cross-country fallback. */
export function upsertEmployerWorkProfile(
  existing: readonly EmployerWorkProfile[], candidate: unknown,
): EmployerWorkProfile[] | null {
  const profile = normalizeEmployerWorkProfile(candidate);
  const collection = normalizeCollection(existing);
  if (!profile || !collection) return null;
  return normalizeCollection([...collection.filter((item) => item.id !== profile.id), profile]);
}

export function removeEmployerWorkProfile(
  existing: readonly EmployerWorkProfile[], id: string,
): EmployerWorkProfile[] | null {
  const collection = normalizeCollection(existing);
  if (!collection) return null;
  return collection.filter((item) => item.id !== id);
}

/**
 * A URL-opened plan may override a local preset for this view only. An invalid or
 * cross-jurisdiction override is rejected, not silently persisted or applied.
 * This function never writes to localStorage or serializes private profile details.
 */
export function resolveEmployerWorkProfile(
  candidate: unknown, overrides: EmployerProfileOverrides = {},
): ResolvedEmployerWorkCalendar | null {
  const profile = normalizeEmployerWorkProfile(candidate);
  if (!profile) return null;
  const override = asRecord(overrides);
  if (!override) return null;
  const calendar = overrides.calendar === undefined ? profile.calendar : normalizeCalendar(overrides.calendar);
  if (!calendar || employerScope(calendar.country, calendar.subdivision)
    !== employerScope(profile.calendar.country, profile.calendar.subdivision)) return null;
  const week = overrides.workWeek === undefined ? profile.workWeek : overrides.workWeek;
  const days = overrides.blackoutDays === undefined ? profile.blackoutDays : normalizeDays(overrides.blackoutDays);
  const altFridayEnabled = overrides.altFridayEnabled ?? profile.altFridayEnabled;
  const altFridayStart = overrides.altFridayStart === undefined ? profile.altFridayStart : overrides.altFridayStart;
  if (!validWeek(week) || !days || typeof altFridayEnabled !== 'boolean'
    || !(altFridayStart === null || (typeof altFridayStart === 'string' && validCalendarDate(altFridayStart)))
    || (altFridayEnabled && altFridayStart === null)
    || (!altFridayEnabled && altFridayStart !== null)) return null;
  return {
    calendar, workWeek: [...week] as WorkWeek,
    altFridayEnabled, altFridayStart, blackoutDays: days,
    planningYearStart: { ...profile.planningYearStart },
    overridden: Object.values(overrides).some((value) => value !== undefined),
  };
}
