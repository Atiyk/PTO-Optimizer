import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, readRequestLedger, REQUEST_STORAGE_KEY, saveRequestLedger } from '../personal/requestLedger';
import { useRequestLedger } from './useRequestLedger';

/** Issue 4: a second browser tab is simulated by writing storage directly, without this tab's events. */
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
const otherTabRequest = createPtoRequest({ start: '2027-03-01', end: '2027-03-02', status: 'approved' }, calendar, 'other-tab', '2027-01-01T00:00:00.000Z')!;
function otherTabWrites() {
  const loaded = readRequestLedger(localStorage);
  expect(saveRequestLedger([...loaded.requests, otherTabRequest], localStorage, loaded.revision).status).toBe('saved');
}

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

describe('request ledger across tabs', () => {
  it('merges a write from another tab instead of losing it (no lost update)', async () => {
    const tabA = renderHook(() => useRequestLedger());
    otherTabWrites();
    await act(async () => { await tabA.result.current.addRequest({ start: '2027-04-05', end: '2027-04-05' }, calendar); });
    expect(readRequestLedger(localStorage).requests.map(r => r.id)).toContain('other-tab');
    expect(readRequestLedger(localStorage).requests).toHaveLength(2);
    expect(tabA.result.current.requests).toHaveLength(2);
  });

  it('refreshes from a storage event raised by another tab', () => {
    const tabA = renderHook(() => useRequestLedger());
    otherTabWrites();
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: REQUEST_STORAGE_KEY })); });
    expect(tabA.result.current.requests.map(r => r.id)).toEqual(['other-tab']);
  });
});

describe('request ledger recovery', () => {
  it('tells the user about unreadable saved requests and keeps a copy before the next change replaces them', async () => {
    localStorage.setItem(REQUEST_STORAGE_KEY, '{"version":1,"requests":[{"id":"lost"');
    const ledger = renderHook(() => useRequestLedger());
    expect(ledger.result.current.storageNotice).toMatch(/could not be read/);
    await act(async () => { await ledger.result.current.addRequest({ start: '2027-04-05', end: '2027-04-05' }, calendar); });
    expect(JSON.parse(localStorage.getItem(`${REQUEST_STORAGE_KEY}.quarantine`)!)[0].raw).toBe('{"version":1,"requests":[{"id":"lost"');
    expect(ledger.result.current.storageNotice).toMatch(/copy .* kept in this browser/);
    expect(readRequestLedger(localStorage).requests).toHaveLength(1);
  });

  it('never overwrites requests saved by a newer version, keeping new entries for this visit only', async () => {
    const newer = JSON.stringify({ version: 2, entries: [{ id: 'future' }] });
    localStorage.setItem(REQUEST_STORAGE_KEY, newer);
    const ledger = renderHook(() => useRequestLedger());
    expect(ledger.result.current.storageNotice).toMatch(/newer version/);
    await act(async () => { await ledger.result.current.addRequest({ start: '2027-04-05', end: '2027-04-05' }, calendar); });
    expect(localStorage.getItem(REQUEST_STORAGE_KEY)).toBe(newer);
    expect(ledger.result.current.storageAvailable).toBe(false);
  });
});
