import type { LeaveBank } from './leaveWallet';
import { MAX_WALLET_BANKS, MAX_BANK_REQUEST_IDS, projectLeaveWallet } from './leaveWallet';
import type { PtoRequest } from './requestLedger';

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
  const existingIds = new Set(existing.map((bank) => bank.id));
  const requestIds = new Set(requests.map((request) => request.id));
  return {
    incoming,
    existing: existingEnvelope,
    removedBankIdsOnFullReplace: existing.filter((bank) => !incoming.banks.some((next) => next.id === bank.id)).map((bank) => bank.id),
    addedBankIds: incoming.banks.filter((bank) => !existingIds.has(bank.id)).map((bank) => bank.id),
    replacedBankIds: incoming.banks.filter((bank) => existingIds.has(bank.id)).map((bank) => bank.id),
    unresolvedRequestIds: [...new Set(incoming.banks.flatMap((bank) => bank.requestIds))]
      .filter((id) => !requestIds.has(id)),
  };
}

/** Merge by default: retain every unrelated existing bank. Conflicting IDs require consent. */
export function acceptLeaveWalletImport(preview: WalletImportPreview, replaceConflicts: boolean): LeaveBank[] | null {
  if (!preview || !Array.isArray(preview.unresolvedRequestIds) || preview.unresolvedRequestIds.length) return null;
  const incoming = decodeLeaveWallet(encodeLeaveWallet(preview.incoming));
  const existing = preview.existing ? decodeLeaveWallet(encodeLeaveWallet(preview.existing)) : null;
  if (!incoming || (preview.existing && !existing)) return null;
  const current = existing?.banks ?? [];
  const ids = new Set(incoming.banks.map((bank) => bank.id));
  if (!replaceConflicts && current.some((bank) => ids.has(bank.id))) return null;
  const merged = [...current.filter((bank) => !ids.has(bank.id)), ...incoming.banks];
  return decodeLeaveWallet(encodeLeaveWallet({ version: 1, banks: merged }))?.banks ?? null;
}

/** Destructive full replacement is separate and requires explicit confirmation. */
export function replaceLeaveWalletFromImport(preview: WalletImportPreview, confirmFullReplacement: boolean): LeaveBank[] | null {
  if (!confirmFullReplacement || !preview || preview.unresolvedRequestIds.length) return null;
  return decodeLeaveWallet(encodeLeaveWallet(preview.incoming))?.banks ?? null;
}
