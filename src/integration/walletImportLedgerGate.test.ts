import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest, type PtoRequest } from '../personal/requestLedger';
import { legacyVacationBank, type LeaveBank } from '../personal/leaveWallet';
import { encodeLeaveWallet } from '../personal/leaveWalletCodec';
import {
  prepareVersionedWalletImport, acceptVersionedWalletImport,
  type VersionedWalletStore, type VersionedWalletState,
} from './walletImportLedgerGate';

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, currentBalance: 5, balanceAsOf: '2027-01-01',
  accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure', plannedDays: [],
};
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
const request = createPtoRequest({
  start: '2027-01-20', end: '2027-01-20', status: 'approved', note: 'PRIVATE HEALTH NOTE',
}, calendar, 'request-1', '2027-01-01T12:00:00Z')!;
const vacation = legacyVacationBank(policy, [request]);
const incoming = { ...vacation, name: 'Imported vacation' };
const raw = encodeLeaveWallet({ version: 1, banks: [incoming] });

function testStore(
  requests: PtoRequest[] = [request], banks: LeaveBank[] = [vacation],
): { store: VersionedWalletStore; state: VersionedWalletState; saves: () => number } {
  const state: VersionedWalletState = { revision: 'v1', requests, banks };
  let saves = 0;
  const store: VersionedWalletStore = {
    readState: () => state,
    saveBanksIfRevisionMatches: (revision, next) => {
      if (revision !== state.revision) return false;
      state.banks = [...next];
      state.revision = 'v2';
      saves++;
      return true;
    },
  };
  return { store, state, saves: () => saves };
}

describe('O versioned wallet import and live request ledger gate', () => {
  it('accepts canonical 100-character legacy request IDs but rejects 101 characters', () => {
    const longRequest = { ...request, id: 'r'.repeat(100) };
    const longBank = legacyVacationBank(policy, [longRequest]);
    const longRaw = encodeLeaveWallet({
      version: 1, banks: [{ ...longBank, name: 'Imported vacation' }],
    });
    expect(longRaw).not.toBe('');
    const { store, saves } = testStore([longRequest], [longBank]);
    const prepared = prepareVersionedWalletImport(longRaw, store);
    expect(prepared).not.toBeNull();
    expect(prepared!.unresolvedRequestIds).toEqual([]);
    expect(acceptVersionedWalletImport(prepared!, store, 'merge', true)).toBe(true);
    expect(saves()).toBe(1);

    const invalidRequest = { ...request, id: 'r'.repeat(101) };
    const invalidBank = legacyVacationBank(policy, [invalidRequest]);
    const invalidStore = testStore([invalidRequest], [invalidBank]);
    expect(prepareVersionedWalletImport(raw, invalidStore.store)).toBeNull();
    expect(invalidStore.saves()).toBe(0);
  });

  it('rejects a same-ID approved-to-requested change without a revision update', () => {
    const { store, state, saves } = testStore();
    const prepared = prepareVersionedWalletImport(raw, store)!;
    expect(prepared.unresolvedRequestIds).toEqual([]);
    state.requests = [{ ...request, status: 'requested' }];
    expect(acceptVersionedWalletImport(prepared, store, 'merge', true)).toBe(false);
    expect(saves()).toBe(0);
  });

  it('rejects same-ID date, amount, private-note and policy mutations and stale revisions', () => {
    for (const changed of [
      { ...request, start: '2027-01-21' },
      { ...request, ptoDays: 0, ptoDates: [] },
      { ...request, note: 'CHANGED PRIVATE NOTE' },
      { ...request, updatedAt: '2027-01-02T12:00:00Z' },
    ]) {
      const { store, state, saves } = testStore();
      const prepared = prepareVersionedWalletImport(raw, store)!;
      state.requests = [changed];
      expect(acceptVersionedWalletImport(prepared, store, 'merge', true)).toBe(false);
      expect(saves()).toBe(0);
    }
    const { store, state } = testStore();
    const prepared = prepareVersionedWalletImport(raw, store)!;
    state.revision = 'v2';
    expect(acceptVersionedWalletImport(prepared, store, 'merge', true)).toBe(false);
  });

  it('commits once with explicit consent and preserves private request data', () => {
    const { store, state, saves } = testStore();
    const prepared = prepareVersionedWalletImport(raw, store)!;
    expect(JSON.stringify(prepared)).not.toContain('PRIVATE HEALTH NOTE');
    expect(acceptVersionedWalletImport(prepared, store, 'merge', false)).toBe(false);
    expect(acceptVersionedWalletImport(prepared, store, 'merge', true)).toBe(true);
    expect(state.banks[0].name).toBe('Imported vacation');
    expect(state.requests).toEqual([request]);
    expect(saves()).toBe(1);
    expect(acceptVersionedWalletImport(prepared, store, 'merge', true)).toBe(false);
  });

  it('uses a revision CAS rather than trusting a successful prewrite read', () => {
    const { store, state } = testStore();
    const prepared = prepareVersionedWalletImport(raw, store)!;
    let persisted = false;
    const racing: VersionedWalletStore = {
      readState: store.readState,
      saveBanksIfRevisionMatches: (revision, next) => {
        state.revision = 'another-tab';
        if (revision !== state.revision) return false;
        state.banks = [...next];
        persisted = true;
        return true;
      },
    };
    expect(acceptVersionedWalletImport(prepared, racing, 'replace-all', true)).toBe(false);
    expect(persisted).toBe(false);
    expect(state.banks).toEqual([vacation]);
  });

  it('rejects corrupted ledgers and forged preview mutations without writing', () => {
    const { store, state, saves } = testStore();
    const prepared = prepareVersionedWalletImport(raw, store)!;
    prepared.incoming.banks[0].name = 'Tampered after approval';
    expect(acceptVersionedWalletImport(prepared, store, 'merge', true)).toBe(false);
    expect(saves()).toBe(0);
    state.requests = [request, { ...request }];
    expect(prepareVersionedWalletImport(raw, store)).toBeNull();
    expect(saves()).toBe(0);
  });
});
