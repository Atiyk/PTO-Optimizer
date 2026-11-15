/**
 * P3 storage honesty: one file with everything Timebower saved in this browser (saved plans,
 * tracked requests, policy, balances, employer calendars and their recovery copies), so a
 * person can keep a copy or move to another browser. Restoring ADDS what is missing and
 * never replaces anything already saved here: an item that differs stays as it is and is
 * counted as kept. Device-local: nothing here is sent anywhere.
 *
 * The values are copied exactly as stored (each record keeps its own version and
 * revision), so the stores' own readers validate them as they always do.
 */
import { PINNED_PLANS_STORAGE_KEY } from '../ui/pinnedPlanStore';
import { parseRequestLedger, REQUEST_STORAGE_KEY } from './requestLedger';
import { RETENTION_STORAGE_KEY } from './retentionStatus';

export const SAVED_DATA_BACKUP_FORMAT = 'timebower-saved-data';
export const MAX_SAVED_DATA_BACKUP_LENGTH = 5_000_000;
const MAX_ITEMS = 500;

export interface SavedDataBackup {
  format: typeof SAVED_DATA_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  items: Record<string, string>;
}

export interface EnumerableStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Personal data and employer calendars. Not the retention facts about this device, the
 * one-time plan hand-off, or the holiday cache (public data the app fetches again). */
export function isBackedUpKey(key: string): boolean {
  if (key === RETENTION_STORAGE_KEY) return false;
  return key.startsWith('gapless.personal.') || key.startsWith('gapless.employer.');
}

export function buildSavedDataBackup(storage: EnumerableStorage, now = new Date()): SavedDataBackup {
  const items: Record<string, string> = {};
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && isBackedUpKey(key)) keys.push(key);
  }
  for (const key of keys.sort()) {
    const value = storage.getItem(key);
    if (value !== null) items[key] = value;
  }
  return { format: SAVED_DATA_BACKUP_FORMAT, version: 1, exportedAt: now.toISOString(), items };
}

export function serializeSavedDataBackup(backup: SavedDataBackup): string {
  return JSON.stringify(backup, null, 2);
}

export type ParsedBackup =
  | { ok: true; backup: SavedDataBackup }
  | { ok: false; reason: 'unreadable' | 'balances-only' | 'newer-version' };

export function parseSavedDataBackup(text: string): ParsedBackup {
  if (text.length > MAX_SAVED_DATA_BACKUP_LENGTH) return { ok: false, reason: 'unreadable' };
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'unreadable' };
    const record = value as Record<string, unknown>;
    if (record.format !== SAVED_DATA_BACKUP_FORMAT) {
      // The balances file from "Download a backup file" has { version, banks }.
      return Array.isArray(record.banks) ? { ok: false, reason: 'balances-only' } : { ok: false, reason: 'unreadable' };
    }
    if (typeof record.version === 'number' && record.version > 1) return { ok: false, reason: 'newer-version' };
    if (record.version !== 1 || typeof record.exportedAt !== 'string' || !record.items || typeof record.items !== 'object'
      || Array.isArray(record.items)) return { ok: false, reason: 'unreadable' };
    const entries = Object.entries(record.items as Record<string, unknown>);
    if (entries.length > MAX_ITEMS || !entries.every(([key, item]) => typeof item === 'string' && isBackedUpKey(key))) {
      return { ok: false, reason: 'unreadable' };
    }
    return { ok: true, backup: { format: SAVED_DATA_BACKUP_FORMAT, version: 1, exportedAt: record.exportedAt, items: Object.fromEntries(entries) as Record<string, string> } };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

export interface RestoreResult {
  /** Items written because nothing was saved under that name here. */
  added: string[];
  /** Items already saved here with the same content. */
  same: string[];
  /** Items saved here with different content: left exactly as they were. */
  kept: string[];
  /** Items that could not be written (storage full or unavailable). */
  failed: string[];
}

/** Adds what this browser lacks. Never overwrites, merges or deletes saved data. */
export function restoreSavedDataBackup(storage: EnumerableStorage, backup: SavedDataBackup): RestoreResult {
  const result: RestoreResult = { added: [], same: [], kept: [], failed: [] };
  for (const [key, value] of Object.entries(backup.items)) {
    if (!isBackedUpKey(key)) continue;
    try {
      const current = storage.getItem(key);
      if (current === null) {
        storage.setItem(key, value);
        result.added.push(key);
      } else if (current === value) {
        result.same.push(key);
      } else {
        result.kept.push(key);
      }
    } catch {
      result.failed.push(key);
    }
  }
  return result;
}

export interface SavedDataSummary {
  pinnedPlans: number;
  requests: number;
  /** The oldest saved item this browser can date (a request's createdAt), if any. */
  oldestRequestAt?: string;
}

/** Counts what a person would lose: saved plans and tracked requests. */
export function summarizeSavedData(storage: Pick<EnumerableStorage, 'getItem'> | null): SavedDataSummary {
  if (!storage) return { pinnedPlans: 0, requests: 0 };
  let pinnedPlans = 0;
  try {
    const raw = storage.getItem(PINNED_PLANS_STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (value && typeof value === 'object' && Array.isArray((value as { plans?: unknown }).plans)) {
      pinnedPlans = (value as { plans: unknown[] }).plans.length;
    }
  } catch { /* unreadable: counted as none */ }
  let requests: ReturnType<typeof parseRequestLedger> = [];
  try { requests = parseRequestLedger(storage.getItem(REQUEST_STORAGE_KEY)); } catch { /* none */ }
  const oldestRequestAt = requests.map((request) => request.createdAt).sort()[0];
  return { pinnedPlans, requests: requests.length, ...(oldestRequestAt ? { oldestRequestAt } : {}) };
}

export function backupFileName(now = new Date()): string {
  return `timebower-saved-data-${now.toISOString().slice(0, 10)}.json`;
}

/** Browser download of everything saved here. Returns false when nothing could be read. */
export function downloadSavedDataBackup(storage: EnumerableStorage | null, now = new Date()): boolean {
  if (!storage || typeof document === 'undefined') return false;
  try {
    const backup = buildSavedDataBackup(storage, now);
    const url = URL.createObjectURL(new Blob([serializeSavedDataBackup(backup)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFileName(now);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

export function browserEnumerableStorage(): EnumerableStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
