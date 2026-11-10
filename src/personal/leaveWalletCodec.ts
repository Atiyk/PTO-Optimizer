import type { LeaveBank } from './leaveWallet';
import { MAX_WALLET_BANKS, MAX_BANK_REQUEST_IDS, projectLeaveWallet, validWalletRequestId } from './leaveWallet';
import { parseRequestLedger, type PtoRequest } from './requestLedger';

/** Private, local-only transfer format. Never embed in plan URLs or telemetry. */
export const LEAVE_WALLET_STORAGE_KEY = 'gapless.personal.leave-wallet.v1';
export const MAX_WALLET_JSON_LENGTH = 250_000;

export interface LeaveWalletEnvelope {
  version: 1;
  banks: LeaveBank[];
}

export interface WalletImportPreview {
  incoming: LeaveWalletEnvelope;
  existing: LeaveWalletEnvelope | null;
  removedBankIdsOnFullReplace: string[];
  addedBankIds: string[];
  replacedBankIds: string[];
  /** Import does not modify the request ledger; callers must preserve linked requests. */
  unresolvedRequestIds: string[];
  /** Private in-memory revision of the live request ledger at preview time. Excludes notes. */
  requestLedgerSnapshot: string;
}

function normalize(value: unknown): LeaveWalletEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== 1 || !Array.isArray(envelope.banks)
    || envelope.banks.length < 1 || envelope.banks.length > MAX_WALLET_BANKS) return null;
  // Reuse canonical policy validation, not a separate accrual/policy engine.
  const banks = envelope.banks as LeaveBank[];
  for (const bank of banks) {
    if (!bank || typeof bank !== 'object' || !bank.policy || typeof bank.policy !== 'object'
      || !Array.isArray(bank.requestIds) || bank.requestIds.length > MAX_BANK_REQUEST_IDS) return null;
    const asOf = bank.policy.balanceAsOf;
    if (typeof asOf !== 'string' || !projectLeaveWallet([bank], asOf)) return null;
  }
  const ids = new Set<string>();
  const requestIds = new Set<string>();
  for (const bank of banks) {
    if (ids.has(bank.id)) return null;
    ids.add(bank.id);
    for (const id of bank.requestIds) {
      if (requestIds.has(id)) return null;
      requestIds.add(id);
    }
  }
  // Copy only the declared versioned schema; discard unknown extension fields.
  return { version: 1, banks: banks.map((bank) => ({
    version: 1, id: bank.id, name: bank.name, category: bank.category,
    policy: structuredPolicyCopy(bank.policy), requestIds: [...bank.requestIds],
  })) };
}

function structuredPolicyCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function encodeLeaveWallet(value: unknown): string {
  try {
    const normalized = normalize(value);
    if (!normalized) return '';
    const json = JSON.stringify(normalized);
    return json.length <= MAX_WALLET_JSON_LENGTH ? json : '';
  } catch { return ''; }
}

export function decodeLeaveWallet(raw: string | null): LeaveWalletEnvelope | null {
  if (!raw || raw.length > MAX_WALLET_JSON_LENGTH) return null;
  try { return normalize(JSON.parse(raw)); } catch { return null; }
}

/**
 * Normalize with the existing ledger parser, reject partially corrupt ledgers,
 * then snapshot only schedule/debit-relevant fields. No private notes or titles
 * are stored in an import preview. Sorting makes record reordering harmless.
 */
function requestLedgerSnapshot(requests: readonly PtoRequest[]): string | null {
  if (!Array.isArray(requests) || requests.length > MAX_BANK_REQUEST_IDS) return null;
  try {
    const parsed = parseRequestLedger(JSON.stringify({ version: 1, requests }));
    if (parsed.length !== requests.length || parsed.some((r) => !validWalletRequestId(r.id))) return null;
    return JSON.stringify(parsed.sort((a, b) => a.id.localeCompare(b.id)).map((r) => ({
      id: r.id, start: r.start, end: r.end, ptoDates: r.ptoDates, ptoMinutes: r.ptoMinutes, partialMinutes: r.partialMinutes,
      status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt,
    })));
  } catch { return null; }
}

/** Preview only. Never silently overwrite existing banks or request records. */
export function previewLeaveWalletImport(
  raw: string,
  existing: readonly LeaveBank[],
  requests: readonly PtoRequest[] = [],
): WalletImportPreview | null {
  const incoming = decodeLeaveWallet(raw);
  if (!incoming || !Array.isArray(existing) || existing.length > MAX_WALLET_BANKS
    || !Array.isArray(requests) || requests.length > MAX_BANK_REQUEST_IDS) return null;
  const existingEnvelope = existing.length ? decodeLeaveWallet(encodeLeaveWallet({ version: 1, banks: [...existing] })) : null;
  if (existing.length && !existingEnvelope) return null;
  // Reject malformed/duplicate records and snapshot statuses/dates at preview,
  // not just IDs: an existing request may change while an import dialog is open.
  const ledgerSnapshot = requestLedgerSnapshot(requests);
  if (ledgerSnapshot === null) return null;
  const requestIds = new Set(requests.map((request) => request.id));
  const existingIds = new Set(existing.map((bank) => bank.id));
  return {
    incoming,
    existing: existingEnvelope,
    removedBankIdsOnFullReplace: existing.filter((bank) => !incoming.banks.some((next) => next.id === bank.id)).map((bank) => bank.id),
    addedBankIds: incoming.banks.filter((bank) => !existingIds.has(bank.id)).map((bank) => bank.id),
    replacedBankIds: incoming.banks.filter((bank) => existingIds.has(bank.id)).map((bank) => bank.id),
    unresolvedRequestIds: [...new Set(incoming.banks.flatMap((bank) => bank.requestIds))]
      .filter((id) => !requestIds.has(id)),
    requestLedgerSnapshot: ledgerSnapshot,
  };
}

/** Recheck the live ledger at acceptance, not only at preview time. */
function linkedRequestsStillResolve(
  banks: readonly LeaveBank[], requests: readonly PtoRequest[], expectedSnapshot: string,
): boolean {
  const actualSnapshot = requestLedgerSnapshot(requests);
  if (actualSnapshot === null || actualSnapshot !== expectedSnapshot) return false;
  const ids = new Set(requests.map((request) => request.id));
  return banks.every((bank) => bank.requestIds.every((id) => ids.has(id)));
}

/** Merge by default: retain every unrelated existing bank. Conflicting IDs require consent. */
export function acceptLeaveWalletImport(preview: WalletImportPreview, replaceConflicts: boolean, currentBanks: readonly LeaveBank[], currentRequests: readonly PtoRequest[] = []): LeaveBank[] | null {
  if (!preview || !Array.isArray(preview.unresolvedRequestIds) || preview.unresolvedRequestIds.length) return null;
  const incoming = decodeLeaveWallet(encodeLeaveWallet(preview.incoming));
  const existing = preview.existing ? decodeLeaveWallet(encodeLeaveWallet(preview.existing)) : null;
  if (!incoming || (preview.existing && !existing)) return null;
  // Fail closed if the wallet changed since preview. The caller must re-read the
  // current local state immediately before committing; do not persist a stale result.
  if (!Array.isArray(currentBanks)) return null;
  const currentEncoded = currentBanks.length ? encodeLeaveWallet({ version: 1, banks: [...currentBanks] }) : '';
  const previewEncoded = existing ? encodeLeaveWallet(existing) : '';
  if ((currentBanks.length && !currentEncoded)
    || (existing ? currentEncoded !== previewEncoded : currentBanks.length !== 0)) return null;
  const current = existing?.banks ?? [];
  const ids = new Set(incoming.banks.map((bank) => bank.id));
  if (!replaceConflicts && current.some((bank) => ids.has(bank.id))) return null;
  const merged = [...current.filter((bank) => !ids.has(bank.id)), ...incoming.banks];
  if (!linkedRequestsStillResolve(merged, currentRequests, preview.requestLedgerSnapshot)) return null;
  return decodeLeaveWallet(encodeLeaveWallet({ version: 1, banks: merged }))?.banks ?? null;
}

/** Destructive full replacement is separate and requires explicit confirmation. */
export function replaceLeaveWalletFromImport(preview: WalletImportPreview, confirmFullReplacement: boolean, currentBanks: readonly LeaveBank[], currentRequests: readonly PtoRequest[] = []): LeaveBank[] | null {
  if (!confirmFullReplacement || !preview || preview.unresolvedRequestIds.length || !Array.isArray(currentBanks)) return null;
  const expected = preview.existing ? encodeLeaveWallet(preview.existing) : '';
  const actual = currentBanks.length ? encodeLeaveWallet({ version: 1, banks: [...currentBanks] }) : '';
  if ((currentBanks.length && !actual) || actual !== expected) return null;
  const incoming = decodeLeaveWallet(encodeLeaveWallet(preview.incoming));
  if (!incoming || !linkedRequestsStillResolve(incoming.banks, currentRequests, preview.requestLedgerSnapshot)) return null;
  return incoming.banks;
}
