import type { LeaveBank } from '../personal/leaveWallet';
import { decodeLeaveWallet, encodeLeaveWallet, LEAVE_WALLET_STORAGE_KEY, MAX_WALLET_JSON_LENGTH } from '../personal/leaveWalletCodec';
import { browserRequestStorage, parseRequestLedger, REQUEST_STORAGE_KEY, writeRequestLedger, type PtoRequest, type RequestStorage } from '../personal/requestLedger';
import {
  acceptVersionedWalletImport, prepareVersionedWalletImport, type PreparedWalletImport, type VersionedWalletStore,
} from './walletImportLedgerGate';

const WALLET_LEDGER_LOCK = 'gapless.personal.leave-wallet-and-requests.v1';
export const WALLET_BANKS_CHANGED = 'gapless:wallet-banks-changed';

export type LedgerAction<T> = T | Promise<T>;

/** Older browsers retain their existing tracker behavior. Import requires a real lock. */
export function canLockWalletLedger(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
}

export function withWalletLedgerLock<T>(action: () => T): LedgerAction<T> {
  return canLockWalletLedger() ? navigator.locks.request(WALLET_LEDGER_LOCK, action) : action();
}

export function settleLedgerAction<T, R>(action: LedgerAction<T>, done: (value: T) => R): LedgerAction<R> {
  return action instanceof Promise ? action.then(done) : done(action);
}

function revisionFrom(raw: string | null): string {
  if (raw === null) return 'missing';
  const revision: unknown = JSON.parse(raw).revision;
  return typeof revision === 'string' && /^[a-zA-Z0-9-]{1,56}$/.test(revision) ? revision : 'legacy';
}

function newRevision(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function writeRevision(storage: RequestStorage, key: string, value: string, limit: number): void {
  const encoded = `${value.slice(0, -1)},"revision":"${newRevision()}"}`;
  if (encoded.length > limit) throw new Error('Private storage exceeds its size limit.');
  storage.setItem(key, encoded);
}

/** Call within the same lock used for the preceding ledger read and mutation. */
export function persistBrowserRequests(requests: readonly PtoRequest[], storage: RequestStorage | null): boolean {
  if (!storage || !canLockWalletLedger()) return writeRequestLedger(requests, storage);
  return writeRequestLedger(requests, {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => writeRevision(storage, key, value, 1_000_000),
  });
}

function storedBanks(raw: string | null): LeaveBank[] | null {
  if (raw === null) return [];
  if (raw.length > MAX_WALLET_JSON_LENGTH) return null;
  const wallet = decodeLeaveWallet(raw);
  if (wallet) return wallet.banks;
  // A revisioned empty wallet marks a deletion without letting an old preview replay.
  const value: unknown = JSON.parse(raw);
  return value && typeof value === 'object' && 'version' in value && value.version === 1
    && 'banks' in value && Array.isArray(value.banks) && value.banks.length === 0
    && revisionFrom(raw) !== 'legacy' ? [] : null;
}

export function readBrowserWallet(storage: RequestStorage | null = browserRequestStorage()): { revision: string; banks: LeaveBank[] } | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LEAVE_WALLET_STORAGE_KEY);
    const banks = storedBanks(raw);
    return banks ? { banks, revision: revisionFrom(raw) } : null;
  } catch {
    return null;
  }
}

/** A store instance is used only within a live browser lock, never across await points. */
function lockedStore(storage: RequestStorage): VersionedWalletStore {
  function readState() {
    const rawLedger = storage.getItem(REQUEST_STORAGE_KEY);
    const rawBanks = storage.getItem(LEAVE_WALLET_STORAGE_KEY);
    const banks = storedBanks(rawBanks);
    if (!banks) return null;
    const requests = parseRequestLedger(rawLedger);
    if (rawLedger !== null) {
      if (rawLedger.length > 1_000_000) return null;
      const envelope: unknown = JSON.parse(rawLedger);
      if (!envelope || typeof envelope !== 'object' || !('version' in envelope) || envelope.version !== 1
        || !('requests' in envelope) || !Array.isArray(envelope.requests) || envelope.requests.length !== requests.length) return null;
    }
    return { revision: `${revisionFrom(rawLedger)}:${revisionFrom(rawBanks)}`, requests, banks };
  }
  return {
    readState,
    saveBanksIfRevisionMatches(expected, next) {
      if (readState()?.revision !== expected) return false;
      const encoded = encodeLeaveWallet({ version: 1, banks: next });
      if (!encoded) return false;
      writeRevision(storage, LEAVE_WALLET_STORAGE_KEY, encoded, MAX_WALLET_JSON_LENGTH);
      return true;
    },
  };
}

export async function clearBrowserWallet(
  expectedRevision: string, storage: RequestStorage | null = browserRequestStorage(),
): Promise<boolean> {
  if (!storage || !canLockWalletLedger()) return false;
  try {
    const saved = await withWalletLedgerLock(() => {
      const current = readBrowserWallet(storage);
      if (!current || current.revision !== expectedRevision || current.banks.length === 0) return false;
      writeRevision(storage, LEAVE_WALLET_STORAGE_KEY, '{"version":1,"banks":[]}', MAX_WALLET_JSON_LENGTH);
      return true;
    });
    if (saved && typeof window !== 'undefined') window.dispatchEvent(new Event(WALLET_BANKS_CHANGED));
    return saved;
  } catch {
    return false;
  }
}

export async function prepareBrowserWalletImport(
  raw: string, storage: RequestStorage | null = browserRequestStorage(),
): Promise<PreparedWalletImport | null> {
  if (!storage || !canLockWalletLedger()) return null;
  try {
    return await withWalletLedgerLock(() => prepareVersionedWalletImport(raw, lockedStore(storage)));
  } catch {
    return null;
  }
}

export async function acceptBrowserWalletImport(
  preview: PreparedWalletImport, mode: 'merge' | 'replace-all', confirmed: boolean,
  storage: RequestStorage | null = browserRequestStorage(),
): Promise<boolean> {
  if (!storage || !canLockWalletLedger()) return false;
  try {
    const saved = await withWalletLedgerLock(() => acceptVersionedWalletImport(preview, lockedStore(storage), mode, confirmed));
    if (saved && typeof window !== 'undefined') window.dispatchEvent(new Event(WALLET_BANKS_CHANGED));
    return saved;
  } catch {
    return false;
  }
}
