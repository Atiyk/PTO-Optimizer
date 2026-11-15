/**
 * P3 PWA: small device-local facts that keep the returning view honest and quiet. When the
 * first plan was saved, when this browser last downloaded a full backup, which hints were
 * dismissed, and whether persistent storage was already asked for (so it is asked once).
 * A new key; no existing key or record changes. Never placed in a URL or sent anywhere.
 *
 * A stored value this version cannot read (corrupt, or written by a newer version) is never
 * replaced: reads return defaults and writes are skipped.
 */
export const RETENTION_STORAGE_KEY = 'gapless.personal.retention.v1';

export interface RetentionStatus {
  /** ISO timestamp of the first plan saved in this browser (set once). */
  firstSavedAt?: string;
  /** ISO timestamp of the last full backup download. */
  lastBackupAt?: string;
  backupReminderDismissedAt?: string;
  installHintDismissedAt?: string;
  /** Set once navigator.storage.persist() has been called, whatever it answered. */
  persistRequestedAt?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const FIELDS = ['firstSavedAt', 'lastBackupAt', 'backupReminderDismissedAt', 'installHintDismissedAt', 'persistRequestedAt'] as const;

export function browserStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** `null` when the stored value can't be read by this version and must be left alone. */
function parse(raw: string | null): RetentionStatus | null {
  if (raw === null) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1) return null;
    const status: RetentionStatus = {};
    for (const field of FIELDS) {
      const entry = record[field];
      if (typeof entry === 'string' && Number.isFinite(Date.parse(entry))) status[field] = entry;
    }
    return status;
  } catch {
    return null;
  }
}

export function readRetentionStatus(storage: StorageLike | null = browserStorage()): RetentionStatus {
  try { return parse(storage?.getItem(RETENTION_STORAGE_KEY) ?? null) ?? {}; } catch { return {}; }
}

/** Merges `patch` into the stored status. Returns false (and writes nothing) when the stored
 * value is unreadable here, or storage is unavailable. */
export function updateRetentionStatus(patch: Partial<RetentionStatus>, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    const current = parse(storage.getItem(RETENTION_STORAGE_KEY));
    if (current === null) return false;
    storage.setItem(RETENTION_STORAGE_KEY, JSON.stringify({ version: 1, ...current, ...patch }));
    return true;
  } catch {
    return false;
  }
}

/** Records the first save once; later saves keep the original date. */
export function noteFirstSave(now = new Date(), storage: StorageLike | null = browserStorage()): void {
  if (readRetentionStatus(storage).firstSavedAt) return;
  updateRetentionStatus({ firstSavedAt: now.toISOString() }, storage);
}

const DAY_MS = 86_400_000;

/**
 * The backup reminder (P3, storage honesty): only when there is meaningful saved data,
 * the data is more than 14 days old, there has been no backup for 90 days (or ever), and
 * the reminder was not dismissed in the last 90 days.
 */
export function backupReminderDue(input: {
  hasMeaningfulData: boolean;
  /** The oldest known saved item, as an ISO timestamp. */
  dataSince?: string;
  status: RetentionStatus;
  now: Date;
}): boolean {
  const { hasMeaningfulData, dataSince, status, now } = input;
  if (!hasMeaningfulData || !dataSince) return false;
  const age = (iso: string | undefined) => iso ? (now.getTime() - Date.parse(iso)) / DAY_MS : Infinity;
  if (age(dataSince) <= 14) return false;
  if (age(status.lastBackupAt) <= 90) return false;
  if (age(status.backupReminderDismissedAt) <= 90) return false;
  return true;
}

/**
 * Asks the browser once to keep this site's storage (feature-detected). Browsers decide on
 * their own: Chromium answers without a prompt, Firefox may show one, which is why this is
 * asked at most once, after the first save. A grant is a hint to the browser, not a promise
 * the data survives clearing site data or a lost device, and no copy says otherwise.
 */
export async function requestPersistentStorageOnce(
  storage: StorageLike | null = browserStorage(),
  nav: { storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> } } | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): Promise<boolean | null> {
  const manager = nav?.storage;
  if (!manager || typeof manager.persist !== 'function') return null;
  if (readRetentionStatus(storage).persistRequestedAt) return null;
  if (!updateRetentionStatus({ persistRequestedAt: new Date().toISOString() }, storage)) return null;
  try {
    if (typeof manager.persisted === 'function' && await manager.persisted()) return true;
    return await manager.persist();
  } catch {
    return null;
  }
}
