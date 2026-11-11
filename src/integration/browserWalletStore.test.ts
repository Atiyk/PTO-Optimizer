import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { legacyVacationBank } from '../personal/leaveWallet';
import { encodeLeaveWallet, LEAVE_WALLET_STORAGE_KEY } from '../personal/leaveWalletCodec';
import { createPtoRequest, readRequestLedger, writeRequestLedger, type RequestStorage } from '../personal/requestLedger';
import {
  acceptBrowserWalletImport, clearBrowserWallet, persistBrowserRequests, prepareBrowserWalletImport, readBrowserWallet, withWalletLedgerLock,
} from './browserWalletStore';
import { useRequestLedger } from '../ui/useRequestLedger';

const policy = {
  unit: 'days', hoursPerDay: 8, currentBalance: 5, balanceAsOf: '2027-01-01',
  accrual: { kind: 'front-loaded', amount: 0, grantDate: '2027-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure', plannedDays: [],
} as const;
const request = createPtoRequest(
  { start: '2027-01-20', end: '2027-01-20' },
  { workWeek: DEFAULT_WORK_WEEK, offDays: [] },
  'request-1', '2027-01-01T12:00:00Z',
)!;
const bank = legacyVacationBank({ ...policy, plannedDays: [] }, [request]);
const backup = encodeLeaveWallet({ version: 1, banks: [bank] });

function sharedBrowser() {
  const values = new Map<string, string>();
  const storage: RequestStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  const queues = new Map<string, Promise<unknown>>();
  const locks = {
    request<T>(name: string, action: () => T | Promise<T>): Promise<T> {
      const turn = (queues.get(name) ?? Promise.resolve()).then(action);
      queues.set(name, turn.catch(() => undefined));
      return turn;
    },
  };
  vi.stubGlobal('navigator', { locks });
  return storage;
}

afterEach(() => vi.unstubAllGlobals());

describe('browser wallet import coordination', () => {
  it('declines a preview when lock support is absent and leaves existing browser storage alone', async () => {
    const storage = sharedBrowser();
    vi.stubGlobal('navigator', {});
    expect(await prepareBrowserWalletImport(backup, storage)).toBeNull();
    expect(storage.getItem(LEAVE_WALLET_STORAGE_KEY)).toBeNull();
  });

  it('rejects an import behind a queued tracker change without replacing any banks or requests', async () => {
    const storage = sharedBrowser();
    expect(writeRequestLedger([request], storage)).toBe(true);
    storage.setItem(LEAVE_WALLET_STORAGE_KEY, backup);
    const incoming = encodeLeaveWallet({ version: 1, banks: [{ ...bank, name: 'Replacement' }] });
    const preview = (await prepareBrowserWalletImport(incoming, storage))!;
    expect(preview).toBeTruthy();

    const update = withWalletLedgerLock(() => persistBrowserRequests([{ ...request, status: 'approved' }], storage));
    const importResult = acceptBrowserWalletImport(preview, 'replace-all', true, storage);
    expect(await update).toBe(true);
    expect(await importResult).toBe(false);
    expect(storage.getItem(LEAVE_WALLET_STORAGE_KEY)).toBe(backup);
    expect(readRequestLedger(storage).requests[0]?.status).toBe('approved');
  });

  it('commits at most one of two previews of the same stored revision', async () => {
    const storage = sharedBrowser();
    expect(writeRequestLedger([request], storage)).toBe(true);
    const first = (await prepareBrowserWalletImport(backup, storage))!;
    const second = (await prepareBrowserWalletImport(backup, storage))!;
    const results = await Promise.all([
      acceptBrowserWalletImport(first, 'merge', true, storage),
      acceptBrowserWalletImport(second, 'merge', true, storage),
    ]);
    expect(results).toEqual([true, false]);
    expect(readBrowserWallet(storage)?.banks).toEqual([bank]);
    expect(readRequestLedger(storage).requests).toEqual([request]);
  });

  it('rechecks the wallet revision before deletion and leaves tracked requests intact', async () => {
    const storage = sharedBrowser();
    expect(writeRequestLedger([request], storage)).toBe(true);
    const preview = (await prepareBrowserWalletImport(backup, storage))!;
    expect(await acceptBrowserWalletImport(preview, 'merge', true, storage)).toBe(true);
    expect(await clearBrowserWallet('legacy', storage)).toBe(false);
    const current = readBrowserWallet(storage)!;
    expect(await clearBrowserWallet(current.revision, storage)).toBe(true);
    expect(readBrowserWallet(storage)?.banks).toEqual([]);
    expect(readRequestLedger(storage).requests).toEqual([request]);
  });

  it('serializes the real tracker add, update, and delete writers without losing independent edits', async () => {
    sharedBrowser();
    window.localStorage.clear();
    const first = renderHook(useRequestLedger);
    const second = renderHook(useRequestLedger);
    const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
    const add = (tracker: typeof first, date: string) => tracker.result.current.addRequest({ start: date, end: date }, calendar);
    try {
      await act(async () => {
        await Promise.all([add(first, '2027-01-20'), add(second, '2027-01-21')]);
      });
      const [jan20, jan21] = readRequestLedger().requests;
      expect([jan20.start, jan21.start]).toEqual(['2027-01-20', '2027-01-21']);
      await act(async () => {
        await Promise.all([
          first.result.current.updateRequest(jan20.id, { note: 'Keep both edits' }, calendar),
          second.result.current.updateRequest(jan20.id, { status: 'approved' }, calendar),
        ]);
      });
      expect(readRequestLedger().requests[0]).toMatchObject({ note: 'Keep both edits', status: 'approved' });
      await act(async () => {
        await Promise.all([first.result.current.deleteRequest(jan21.id), add(second, '2027-01-22')]);
      });
      expect(readRequestLedger().requests.map((entry) => entry.start)).toEqual(['2027-01-20', '2027-01-22']);
    } finally {
      first.unmount();
      second.unmount();
      window.localStorage.clear();
    }
  });
});

describe('wallet storage shapes and versioned writes', () => {
  it('reads every stored wallet shape, and a wallet write is stamped with revision and updatedAt', async () => {
    const storage = sharedBrowser();
    const stamped = JSON.stringify({ ...JSON.parse(backup), revision: '0d9e6a43-5d8a-4b5e-9f0e-111111111111' });
    for (const [raw, revision] of [[backup, 'legacy'], [stamped, '0d9e6a43-5d8a-4b5e-9f0e-111111111111']] as const) {
      storage.setItem(LEAVE_WALLET_STORAGE_KEY, raw);
      expect(readBrowserWallet(storage)).toMatchObject({ revision, banks: [{ id: bank.id }] });
    }
    // A corrupt wallet is reported as unreadable and is never replaced by an import.
    storage.setItem(LEAVE_WALLET_STORAGE_KEY, '{"version":1,"banks":[');
    expect(readBrowserWallet(storage)).toBeNull();
    expect(await prepareBrowserWalletImport(backup, storage)).toBeNull();
    expect(storage.getItem(LEAVE_WALLET_STORAGE_KEY)).toBe('{"version":1,"banks":[');

    storage.setItem(LEAVE_WALLET_STORAGE_KEY, stamped);
    expect(await clearBrowserWallet('0d9e6a43-5d8a-4b5e-9f0e-111111111111', storage)).toBe(true);
    const cleared = JSON.parse(storage.getItem(LEAVE_WALLET_STORAGE_KEY)!);
    expect(cleared).toMatchObject({ version: 1, banks: [] });
    expect(Number.isFinite(Date.parse(cleared.updatedAt))).toBe(true);
    expect(readBrowserWallet(storage)).toMatchObject({ banks: [] });
  });
});
