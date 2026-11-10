import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest, type PtoRequest } from './requestLedger';
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

const requestCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
const requestNow = '2027-01-01T00:00:00.000Z';
function linkedRequest(id: string = 'request-1'): PtoRequest {
  return createPtoRequest(
    { start: '2027-01-20', end: '2027-01-20', status: 'approved', note: 'PRIVATE' },
    requestCalendar, id, requestNow,
  )!;
}

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
    expect(preview && acceptLeaveWalletImport(preview, false, [vacation, sick])).toBeNull();
    expect(preview && acceptLeaveWalletImport(preview, true, [vacation, sick])?.map((bank) => bank.id)).toEqual(['sick', 'vacation']);
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

  it('fails import preview atomically for duplicate or malformed live request IDs', () => {
    const bank = { ...legacyVacationBank(policy), requestIds: ['request-1'] };
    const raw = encodeLeaveWallet({ version: 1, banks: [bank] });
    const record = linkedRequest();
    expect(previewLeaveWalletImport(raw, [], [record, { ...record }])).toBeNull();
    expect(previewLeaveWalletImport(raw, [], [{ id: '' } as PtoRequest])).toBeNull();
    expect(previewLeaveWalletImport(raw, [], [null as unknown as PtoRequest])).toBeNull();
    // Valid identifiers still allow the preview to resolve linked requests.
    expect(previewLeaveWalletImport(raw, [], [record])?.unresolvedRequestIds).toEqual([]);
  });


  it('revalidates live linked requests at commit time and rejects ledger races', () => {
    const bank = { ...legacyVacationBank(policy), requestIds: ['request-1'] };
    const raw = encodeLeaveWallet({ version: 1, banks: [bank] });
    const linked = linkedRequest();
    const preview = previewLeaveWalletImport(raw, [], [linked])!;
    expect(preview.unresolvedRequestIds).toEqual([]);
    expect(acceptLeaveWalletImport(preview, false, [])).toBeNull();
    expect(acceptLeaveWalletImport(preview, false, [], [linked])).toEqual([bank]);
    expect(acceptLeaveWalletImport(preview, false, [], [linked, { ...linked }])).toBeNull();
    expect(replaceLeaveWalletFromImport(preview, true, [])).toBeNull();
    expect(replaceLeaveWalletFromImport(preview, true, [], [linked])).toEqual([bank]);
    // A forged preview flag cannot override a missing live request.
    preview.unresolvedRequestIds = [];
    expect(acceptLeaveWalletImport(preview, false, [], [])).toBeNull();
  });

  it('invalidates import acceptance when a same-ID request changes status or dates', () => {
    const linked = linkedRequest();
    const bank = { ...legacyVacationBank(policy), requestIds: [linked.id] };
    const preview = previewLeaveWalletImport(encodeLeaveWallet({ version: 1, banks: [bank] }), [], [linked])!;
    expect(preview).not.toBeNull();
    expect(preview.requestLedgerSnapshot).not.toContain('PRIVATE');
    expect(acceptLeaveWalletImport(preview, false, [], [linked])).toEqual([bank]);
    expect(replaceLeaveWalletFromImport(preview, true, [], [linked])).toEqual([bank]);

    const canceled = { ...linked, status: 'canceled' as const };
    const shifted = { ...linked, start: '2027-01-21', end: '2027-01-21',
      ptoDates: ['2027-01-21'] };
    const newRevision = { ...linked, updatedAt: '2027-01-02T00:00:00.000Z' };
    for (const stale of [canceled, shifted, newRevision]) {
      expect(acceptLeaveWalletImport(preview, false, [], [stale])).toBeNull();
      expect(replaceLeaveWalletFromImport(preview, true, [], [stale])).toBeNull();
    }
    // Reordering unrelated requests is harmless, but editing them invalidates the preview.
    const unrelated = linkedRequest('other');
    const anotherPreview = previewLeaveWalletImport(
      encodeLeaveWallet({ version: 1, banks: [bank] }), [], [linked, unrelated],
    )!;
    expect(acceptLeaveWalletImport(anotherPreview, false, [], [unrelated, linked])).toEqual([bank]);
    expect(acceptLeaveWalletImport(anotherPreview, false, [], [
      linked, { ...unrelated, status: 'completed' },
    ])).toBeNull();
  });

  it('roundtrips the full 100-character request-ledger ID range', () => {
    const linked = linkedRequest('r'.repeat(100));
    expect(linked).not.toBeNull();
    const bank = { ...legacyVacationBank(policy), requestIds: [linked.id] };
    const json = encodeLeaveWallet({ version: 1, banks: [bank] });
    expect(json).not.toBe('');
    const preview = previewLeaveWalletImport(json, [], [linked])!;
    expect(preview?.unresolvedRequestIds).toEqual([]);
    expect(acceptLeaveWalletImport(preview, false, [], [linked])).toEqual([bank]);
    expect(encodeLeaveWallet({ version: 1, banks: [
      { ...bank, requestIds: ['r'.repeat(101)] },
    ] })).toBe('');
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
