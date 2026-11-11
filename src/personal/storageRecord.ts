/**
 * Versioned, recoverable local storage records for personal data (see
 * docs/runs/gapless-p012/PERSISTENCE.md). Every record keeps its schema `version`
 * and gains a `revision` and `updatedAt` on write. Writes go through `guardedWrite`:
 *   - stale-write detection: a write that names the revision this tab loaded is refused
 *     when another tab has since saved a different one (never silently overwrites newer data);
 *   - newer schema: a record written by a newer app version is never downgraded;
 *   - corrupt or partially unreadable data is copied to `<key>.quarantine` first, and the
 *     write is refused when that copy cannot be kept;
 *   - a legacy record (no revision yet) is copied to `<key>.backup` once before its first
 *     versioned write, so the migration is recoverable.
 * Device-local only: nothing here is ever placed in a URL or sent anywhere.
 */
export interface RecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const BACKUP_SUFFIX = '.backup';
export const QUARANTINE_SUFFIX = '.quarantine';
const MAX_QUARANTINED = 3;
const REVISION = /^[a-zA-Z0-9-]{1,56}$/;

export type GuardedWriteResult =
  | { status: 'saved'; revision: string; quarantined: boolean }
  | { status: 'stale' | 'newer-version' | 'unavailable' };

export interface GuardOptions {
  /** The revision this tab loaded; omit to skip stale detection (e.g. nothing was loaded). */
  expectedRevision?: string;
  /** False when the stored value cannot be fully read; it is quarantined before replacement. */
  isClean: (raw: string) => boolean;
  /** True when the stored value was written by a newer schema; it is never replaced. */
  isNewer?: (raw: string) => boolean;
  /** Record formats that gain revision metadata keep a one-time migration backup. Default true. */
  migrates?: boolean;
}

function newRevision(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 53-bit FNV-1a style content hash for records that predate revisions. */
function contentHash(raw: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return `h:${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}-${raw.length.toString(36)}`;
}

function storedRevisionField(raw: string): string | undefined {
  if (!raw.startsWith('{')) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    const revision = value && typeof value === 'object' ? (value as Record<string, unknown>).revision : undefined;
    return typeof revision === 'string' && REVISION.test(revision) ? revision : undefined;
  } catch {
    return undefined;
  }
}

/** The identity of a stored value: its revision, a content hash for legacy values, or 'missing'. */
export function recordRevision(raw: string | null): string {
  if (raw === null) return 'missing';
  return storedRevisionField(raw) ?? contentHash(raw);
}

/** Serialize a schema record with a fresh revision and updatedAt. */
export function stampRecord(record: object, now = new Date().toISOString()): string {
  return JSON.stringify({ ...record, revision: newRevision(), updatedAt: now });
}

export interface PreservedCopy {
  savedAt: string;
  reason: 'migration' | 'unreadable';
  raw: string;
}

export function readQuarantine(storage: RecordStorage, key: string): PreservedCopy[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key + QUARANTINE_SUFFIX) ?? '[]');
    return Array.isArray(value) ? value.filter((entry): entry is PreservedCopy => !!entry && typeof entry.raw === 'string') : [];
  } catch {
    return [];
  }
}

export function readBackup(storage: RecordStorage, key: string): PreservedCopy | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key + BACKUP_SUFFIX) ?? 'null');
    return value && typeof value === 'object' && typeof (value as PreservedCopy).raw === 'string' ? value as PreservedCopy : null;
  } catch {
    return null;
  }
}

function quarantine(storage: RecordStorage, key: string, raw: string): void {
  const existing = readQuarantine(storage, key);
  if (existing.some(entry => entry.raw === raw)) return;
  const next = [...existing, { savedAt: new Date().toISOString(), reason: 'unreadable', raw }].slice(-MAX_QUARANTINED);
  storage.setItem(key + QUARANTINE_SUFFIX, JSON.stringify(next));
}

/** Read-compare-write of one record. Call within the same task (or lock) as the read it is based on. */
export function guardedWrite(storage: RecordStorage, key: string, next: string, options: GuardOptions): GuardedWriteResult {
  try {
    const current = storage.getItem(key);
    let quarantined = false;
    if (current !== null) {
      if (options.expectedRevision !== undefined && recordRevision(current) !== options.expectedRevision) return { status: 'stale' };
      if (options.isNewer?.(current)) return { status: 'newer-version' };
      if (!options.isClean(current)) {
        quarantine(storage, key, current);
        quarantined = true;
      } else if (options.migrates !== false && storedRevisionField(current) === undefined && storage.getItem(key + BACKUP_SUFFIX) === null) {
        const backup: PreservedCopy = { savedAt: new Date().toISOString(), reason: 'migration', raw: current };
        storage.setItem(key + BACKUP_SUFFIX, JSON.stringify({ version: 1, ...backup }));
      }
    }
    storage.setItem(key, next);
    return { status: 'saved', revision: recordRevision(next), quarantined };
  } catch {
    return { status: 'unavailable' };
  }
}
