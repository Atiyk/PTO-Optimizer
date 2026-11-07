import { describe, expect, it } from 'vitest';
import type { TimeOffPolicy } from '../policy/model';
import { legacyVacationBank } from './leaveWallet';
import {
  acceptLeaveWalletImport, decodeLeaveWallet, encodeLeaveWallet,
  MAX_WALLET_JSON_LENGTH, previewLeaveWalletImport,
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
    expect(preview && acceptLeaveWalletImport(preview, true)).toEqual([bank]);
  });

  it('requires explicit replacement and refuses missing linked requests', () => {
    const bank = { ...legacyVacationBank(policy), requestIds: ['request-1'] };
    const preview = previewLeaveWalletImport(encodeLeaveWallet({ version: 1, banks: [bank] }), [bank]);
    expect(preview?.replacedBankIds).toEqual(['vacation']);
    expect(preview?.unresolvedRequestIds).toEqual(['request-1']);
    expect(preview && acceptLeaveWalletImport(preview, true)).toBeNull();
    expect(preview && acceptLeaveWalletImport(preview, false)).toBeNull();
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
