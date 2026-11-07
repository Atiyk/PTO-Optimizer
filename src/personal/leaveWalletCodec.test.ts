import { describe, expect, it } from 'vitest';
import type { TimeOffPolicy } from '../policy/model';
import { legacyVacationBank } from './leaveWallet';
import {
  acceptLeaveWalletImport, decodeLeaveWallet, encodeLeaveWallet,
  MAX_WALLET_JSON_LENGTH, previewLeaveWalletImport, replaceLeaveWalletFromImport,
} from './leaveWalletCodec';

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, currentBalance: 8, balanceAsOf: '2027-01-01',
  accrual: { kind: 'per-pay-period', amount: 1.25, frequency: 'monthly', payDateAnchor: '2027-01-15' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure', plannedDays: [],
};

describe('private leave wallet transfer codec', () => {
  it('roundtrips a versioned single-bank legacy adapter without altering its policy', () => {
    const bank = legacyVacationBank(policy);
    const json = encodeLeaveWallet({ version: 1, banks: [bank] });
    expect(decodeLeaveWallet(json)).toEqual({ version: 1, banks: [bank] });
    const preview = previewLeaveWalletImport(json, []);
    expect(preview?.addedBankIds).toEqual(['vacation']);
    expect(preview?.replacedBankIds).toEqual([]);
    expect(preview && acceptLeaveWalletImport(preview, true, [])).toEqual([bank]);
  });

  it('requires explicit replacement and refuses missing linked requests', () => {
    const bank = { ...legacyVacationBank(policy), requestIds: ['request-1'] };
    const preview = previewLeaveWalletImport(encodeLeaveWallet({ version: 1, banks: [bank] }), [bank]);
    expect(preview?.replacedBankIds).toEqual(['vacation']);
    expect(preview?.unresolvedRequestIds).toEqual(['request-1']);
    expect(preview && acceptLeaveWalletImport(preview, true, [bank])).toBeNull();
    expect(preview && acceptLeaveWalletImport(preview, false, [bank])).toBeNull();
  });

  it('merges an imported sick bank without silently deleting an existing vacation bank', () => {
    const vacation = legacyVacationBank(policy);
    const sick = { ...vacation, id: 'sick', name: 'Sick', category: 'sick' as const,
      policy: { ...policy, payoutOnLeaving: 'doesnt' as const } };
    const preview = previewLeaveWalletImport(encodeLeaveWallet({ version: 1, banks: [sick] }), [vacation]);
    expect(preview?.removedBankIdsOnFullReplace).toEqual(['vacation']);
    expect(preview && acceptLeaveWalletImport(preview, false, [vacation])?.map((bank) => bank.id)).toEqual(['vacation', 'sick']);
    expect(preview && replaceLeaveWalletFromImport(preview, false, [vacation])).toBeNull();
    expect(preview && replaceLeaveWalletFromImport(preview, true, [vacation])?.map((bank) => bank.id)).toEqual(['sick']);
  });

  it('requires conflict-specific consent but retains unrelated banks', () => {
    const vacation = legacyVacationBank(policy);
    const sick = { ...vacation, id: 'sick', category: 'sick' as const, name: 'Sick' };
    const changed = { ...vacation, name: 'Updated vacation' };
    const preview = previewLeaveWalletImport(encodeLeaveWallet({ version: 1, banks: [changed] }), [vacation, sick]);
    expect(preview && acceptLeaveWalletImport(preview, false, [bank])).toBeNull();
    expect(preview && acceptLeaveWalletImport(preview, true)?.map((bank) => bank.id)).toEqual(['sick', 'vacation']);
  });

  it('refuses stale previews after any bank change, including unrelated additions', () => {
    const vacation = legacyVacationBank(policy);
    const sick = { ...vacation, id: 'sick', category: 'sick' as const, name: 'Sick' };
    const raw = encodeLeaveWallet({ version: 1, banks: [sick] });
    const preview = previewLeaveWalletImport(raw, [vacation]);
    const changed = { ...vacation, policy: { ...policy, currentBalance: 9 } };
    expect(preview && acceptLeaveWalletImport(preview, false, [changed])).toBeNull();
    expect(preview && replaceLeaveWalletFromImport(preview, true, [changed])).toBeNull();
    expect(preview && acceptLeaveWalletImport(preview, false, [vacation, sick])).toBeNull();
    expect(preview && acceptLeaveWalletImport(preview, false, [vacation])?.map(b => b.id)).toEqual(['vacation', 'sick']);
  });

  it('rejects corrupt, oversized, duplicated and invalid-policy data', () => {
    expect(decodeLeaveWallet('{')).toBeNull();
    expect(decodeLeaveWallet('x'.repeat(MAX_WALLET_JSON_LENGTH + 1))).toBeNull();
    expect(decodeLeaveWallet(JSON.stringify({ version: 2, banks: [] }))).toBeNull();
    const bank = legacyVacationBank(policy);
    expect(encodeLeaveWallet({ version: 1, banks: [bank, bank] })).toBe('');
    expect(encodeLeaveWallet({ version: 1, banks: [{ ...bank, policy: { ...policy, balanceAsOf: '2027-02-30' } }] })).toBe('');
    expect(encodeLeaveWallet({ version: 1, banks: [{ ...bank, policy: { ...policy, currentBalance: Infinity } }] })).toBe('');
  });
});
