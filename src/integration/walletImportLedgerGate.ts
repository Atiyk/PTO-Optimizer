import type { LeaveBank } from '../personal/leaveWallet';
import type { PtoRequest } from '../personal/requestLedger';
import { REQUEST_STATUSES, validRequestRange } from '../personal/requestLedger';
import { validCalendarDate } from '../personal/employerCalendar';
import {
  acceptLeaveWalletImport, encodeLeaveWallet, previewLeaveWalletImport,
  replaceLeaveWalletFromImport, type WalletImportPreview,
} from '../personal/leaveWalletCodec';

/**
 * Opt-in integration contract for private wallet imports. A store must provide
 * an actual atomic compare-and-swap keyed on an opaque revision; merely setting
 * localStorage is NOT an atomic implementation across tabs/devices.
 *
 * No ledger content or request notes are copied into public URLs or telemetry.
 * The private request snapshot lives only in this module's WeakMap.
 */
export interface VersionedWalletState {
  revision: string;
  banks: readonly LeaveBank[];
  requests: readonly PtoRequest[];
}
export interface VersionedWalletStore {
  readState(): VersionedWalletState | null;
  /** Must atomically reject a changed revision, not unconditionally write. */
  saveBanksIfRevisionMatches(expectedRevision: string, nextBanks: readonly LeaveBank[]): boolean;
}
export type PreparedWalletImport = WalletImportPreview;
interface PrivatePreviewState {
  revision: string;
  ledgerSnapshot: string;
  importedEnvelope: string;
  existingEnvelope: string;
}
const previewStates = new WeakMap<PreparedWalletImport, PrivatePreviewState>();

/** All meaningful request fields are compared, not only IDs. No lossy hash. */
function serializeLedger(requests: readonly PtoRequest[]): string | null {
  if (!Array.isArray(requests) || requests.length > 300) return null;
  const seen = new Set<string>();
  const normalized: Array<{
    id: string; start: string; end: string; ptoDates: string[]; ptoDays: number;
    status: PtoRequest['status']; note: string; createdAt: string; updatedAt: string;
  }> = [];
  for (const req of requests) {
    if (!req || typeof req.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(req.id)
      || seen.has(req.id) || !validRequestRange(req.start, req.end)
      || !Array.isArray(req.ptoDates) || req.ptoDates.length > 1096
      || req.ptoDates.some((d: string) => typeof d !== 'string' || !validCalendarDate(d) || d < req.start || d > req.end)
      || !Number.isInteger(req.ptoDays) || req.ptoDays !== new Set(req.ptoDates).size
      || !REQUEST_STATUSES.includes(req.status) || typeof req.note !== 'string' || req.note.length > 1000
      || typeof req.createdAt !== 'string' || Number.isNaN(Date.parse(req.createdAt))
      || typeof req.updatedAt !== 'string' || Number.isNaN(Date.parse(req.updatedAt))) return null;
    seen.add(req.id);
    normalized.push({
      id: req.id, start: req.start, end: req.end, ptoDates: [...req.ptoDates].sort(),
      ptoDays: req.ptoDays, status: req.status, note: req.note,
      createdAt: req.createdAt, updatedAt: req.updatedAt,
    });
  }
  normalized.sort((a, b) => a.id.localeCompare(b.id));
  const snapshot = JSON.stringify(normalized);
  return snapshot.length <= 1_000_000 ? snapshot : null;
}
function envelope(banks: readonly LeaveBank[]): string {
  return banks.length ? encodeLeaveWallet({ version: 1, banks: [...banks] }) : '';
}
function validRevision(revision: string): boolean {
  return typeof revision === 'string' && revision.length > 0 && revision.length <= 128;
}

/**
 * Prepare a private review. Neither request IDs nor bank IDs are sufficient to
 * verify a later commit; request status/date/amount/notes and revision all matter.
 */
export function prepareVersionedWalletImport(raw: string, store: VersionedWalletStore): PreparedWalletImport | null {
  try {
    const state = store.readState();
    if (!state || !validRevision(state.revision)) return null;
    const ledgerSnapshot = serializeLedger(state.requests);
    const existingEnvelope = envelope(state.banks);
    if (ledgerSnapshot === null || (state.banks.length > 0 && !existingEnvelope)) return null;
    const preview = previewLeaveWalletImport(raw, state.banks, state.requests);
    if (!preview) return null;
    const importedEnvelope = encodeLeaveWallet(preview.incoming);
    if (!importedEnvelope) return null;
    previewStates.set(preview, {
      revision: state.revision, ledgerSnapshot, existingEnvelope, importedEnvelope,
    });
    return preview;
  } catch { return null; }
}

/**
 * Re-read all live data, reject any changed ledger payload or bank revision,
 * and delegate the final write to the store's REQUIRED atomic CAS operation.
 * Never use this with a blind localStorage.setItem implementation.
 */
export function acceptVersionedWalletImport(
  preview: PreparedWalletImport,
  store: VersionedWalletStore,
  mode: 'merge' | 'replace-all',
  confirmed: boolean,
): boolean {
  const expected = preview && previewStates.get(preview);
  if (!expected || !confirmed || (mode !== 'merge' && mode !== 'replace-all')) return false;
  try {
    const state = store.readState();
    if (!state || !validRevision(state.revision) || state.revision !== expected.revision
      || serializeLedger(state.requests) !== expected.ledgerSnapshot
      || envelope(state.banks) !== expected.existingEnvelope
      || encodeLeaveWallet(preview.incoming) !== expected.importedEnvelope) return false;

    const next = mode === 'merge'
      ? acceptLeaveWalletImport(preview, true, state.banks, state.requests)
      : replaceLeaveWalletFromImport(preview, true, state.banks, state.requests);
    if (!next) return false;
    // A repeated invocation must not replay a stale approval, even if the store
    // is faulty. Real cross-tab safety still requires the store's CAS semantics.
    previewStates.delete(preview);
    return store.saveBanksIfRevisionMatches(expected.revision, next) === true;
  } catch { return false; }
}
