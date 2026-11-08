import type { ISODate } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import type { PolicyEvent, BalancePoint } from '../policy/projection';
import { forecastWithRequests } from './forecast';
import type { PtoRequest } from './requestLedger';

/**
 * Consumer-only multi-bank wallet adapter. It does not implement accrual arithmetic:
 * all numerical projections come from the existing canonical policy model.
 *
 * Request records are untyped in the legacy ledger. A caller must explicitly assign
 * request IDs to exactly one bank; only legacyVacationBank opts a single existing
 * vacation bank into consuming the legacy requests. This prevents double deduction.
 */
export const MAX_WALLET_BANKS = 12;
export const MAX_BANK_REQUEST_IDS = 300;

export type LeaveBankCategory =
  | 'vacation'
  | 'sick'
  | 'personal'
  | 'floating-holiday'
  | 'comp-time'
  | 'custom';

export interface LeaveBank {
  version: 1;
  /** Stable local-only identifier; do not put this or the policy in public share URLs. */
  id: string;
  name: string;
  category: LeaveBankCategory;
  policy: TimeOffPolicy;
  /** Explicit legacy requests owned by this bank, not implicitly all user requests. */
  requestIds: readonly string[];
}

export interface WalletTimelineEvent {
  bankId: string;
  date: ISODate;
  /** Raw event from the canonical policy projection; no invented accrual/debit values. */
  event: PolicyEvent;
}

export interface WalletBankSnapshot {
  id: string;
  name: string;
  category: LeaveBankCategory;
  unit: TimeOffPolicy['unit'];
  asOf: ISODate;
  through: ISODate;
  openingBalance: number | null;
  confirmedBalance: number | null;
  tentativeBalance: number | null;
  earned: number;
  confirmedScheduled: number;
  tentativeScheduled: number;
  confirmedExpired: number;
  confirmedLostAccrual: number;
  confirmedUnfunded: number;
  /** Balance series and events remain in this bank's native policy unit. */
  series: BalancePoint[];
  events: WalletTimelineEvent[];
  /** True only when the bank is an explicit owner of all its linked requests. */
  linkedRequestCount: number;
}

export interface LeaveWalletProjection {
  through: ISODate;
  banks: WalletBankSnapshot[];
  /** Multiple banks may use different units: never sum totals across banks. */
  bankCount: number;
}

const BANK_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Match the existing request-ledger contract (which permits 100-character IDs). */
export function validWalletRequestId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
}
const CATEGORIES: readonly LeaveBankCategory[] = [
  'vacation', 'sick', 'personal', 'floating-holiday', 'comp-time', 'custom',
];

/** Safely adapt a legacy single-policy user without changing their persisted records. */
export function legacyVacationBank(
  policy: TimeOffPolicy,
  requests: readonly PtoRequest[] = [],
): LeaveBank {
  return {
    version: 1, id: 'vacation', name: 'Vacation / PTO', category: 'vacation',
    policy,
    // Preserve every legacy link; projection rejects oversized wallets rather than silently dropping requests.
    requestIds: [...new Set(requests.map((r) => r.id))],
  };
}

/**
 * An explicit owner for every request prevents a single approval subtracting leave
 * from two banks. Missing request IDs are ignored, not guessed into another bank.
 * Returns null on unsafe/malformed input or an invalid canonical forecast.
 */
export function projectLeaveWallet(
  banks: readonly LeaveBank[],
  through: ISODate,
  requests: readonly PtoRequest[] = [],
): LeaveWalletProjection | null {
  if (!Array.isArray(banks) || banks.length === 0 || banks.length > MAX_WALLET_BANKS
    || !Array.isArray(requests) || requests.length > MAX_BANK_REQUEST_IDS) return null;

  const bankIds = new Set<string>();
  const requestOwners = new Set<string>();
  const requestById = new Map<string, PtoRequest>();
  for (const request of requests) {
    if (!request || !validWalletRequestId(request.id) || requestById.has(request.id)) return null;
    requestById.set(request.id, request);
  }

  const snapshots: WalletBankSnapshot[] = [];
  for (const bank of banks) {
    if (!bank || bank.version !== 1 || typeof bank.id !== 'string'
      || !BANK_ID.test(bank.id) || bankIds.has(bank.id)
      || typeof bank.name !== 'string' || !bank.name.trim() || bank.name.length > 80
      || !CATEGORIES.includes(bank.category)
      || !Array.isArray(bank.requestIds) || bank.requestIds.length > MAX_BANK_REQUEST_IDS
      || bank.requestIds.some((id: string) => !validWalletRequestId(id))
      || !bank.policy || typeof bank.policy !== 'object') return null;
    bankIds.add(bank.id);

    const linkedRequests: PtoRequest[] = [];
    const localIds = new Set<string>();
    for (const id of bank.requestIds) {
      if (localIds.has(id) || requestOwners.has(id)) return null;
      localIds.add(id);
      requestOwners.add(id);
      const request = requestById.get(id);
      if (request) linkedRequests.push(request);
    }
    const projection = forecastWithRequests(bank.policy, through, linkedRequests);
    if (!projection) return null;
    const confirmed = projection.confirmed;
    const tentative = projection.tentative;
    snapshots.push({
      id: bank.id,
      name: bank.name,
      category: bank.category,
      unit: bank.policy.unit,
      asOf: bank.policy.balanceAsOf,
      through,
      openingBalance: bank.policy.accrual.kind === 'unlimited' ? null : bank.policy.currentBalance,
      confirmedBalance: confirmed.balance,
      tentativeBalance: tentative.balance,
      earned: confirmed.accrued,
      confirmedScheduled: confirmed.scheduled,
      tentativeScheduled: tentative.scheduled,
      confirmedExpired: confirmed.expired,
      confirmedLostAccrual: confirmed.lostAccrual,
      confirmedUnfunded: confirmed.unfunded,
      series: confirmed.series,
      events: confirmed.events.map((event) => ({ bankId: bank.id, date: event.date, event })),
      linkedRequestCount: linkedRequests.length,
    });
  }

  return { through, banks: snapshots, bankCount: snapshots.length };
}
