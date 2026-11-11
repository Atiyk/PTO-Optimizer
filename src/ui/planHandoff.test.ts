import { describe, expect, it } from 'vitest';
import { adoptPlanHandoff, HANDOFF_PARAM, storePlanHandoff } from './planHandoff';
import { readBrowserPlanSearch } from './urlState';
import { isPlanAddressKey } from './shareFormat';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

const HREF = '/pto?c=US&s=2026-11-11&e=2026-12-10&b=15&rv=0';

describe('on-device /pto hand-off for private planner inputs', () => {
  it('puts only a random nonce in the link and keeps the private dates in session storage', () => {
    const storage = memoryStorage();
    const href = storePlanHandoff(HREF, 'bo=2026-11-23,2026-11-24', storage, () => 'n0nce');
    const url = new URL(href, 'https://gapless.example');
    expect(url.searchParams.get(HANDOFF_PARAM)).toBe('n0nce');
    expect(href).not.toContain('2026-11-23');
    for (const key of url.searchParams.keys()) expect(isPlanAddressKey(key), key).toBe(true);
    expect(storage.length).toBe(1);
  });

  it('leaves the link unchanged when there is nothing private to hand over or storage is blocked', () => {
    expect(storePlanHandoff(HREF, '', memoryStorage())).toBe(HREF);
    const blocked = { ...memoryStorage(), setItem: () => { throw new Error('blocked'); } } as Storage;
    expect(storePlanHandoff(HREF, 'bo=2026-11-23', blocked)).toBe(HREF);
  });

  it('is consumed once on arrival: strips the nonce and restores the dates as private draft state', () => {
    const storage = memoryStorage();
    const href = storePlanHandoff(HREF, 'bo=2026-11-23,2026-11-24&b=99&salary=1', storage, () => 'abc123');
    const search = new URL(href, 'https://gapless.example').search;
    const adopted = adoptPlanHandoff(search, { other: 1 }, storage);
    expect(adopted).not.toBeNull();
    expect(new URLSearchParams(adopted!.search).has(HANDOFF_PARAM)).toBe(false);
    expect(adopted!.historyState.other).toBe(1);
    const merged = new URLSearchParams(readBrowserPlanSearch(adopted!.search, adopted!.historyState));
    expect(merged.get('bo')).toBe('2026-11-23,2026-11-24');
    // A hand-off can add private inputs, never override public ones.
    expect(merged.get('b')).toBe('15');
    expect(storage.length).toBe(0);
    expect(adoptPlanHandoff(search, null, storage)?.historyState).toEqual({});
  });

  it('ignores unknown, malformed or expired nonces but still strips them from the address', () => {
    const storage = memoryStorage();
    expect(adoptPlanHandoff('?c=US', null, storage)).toBeNull();
    const missing = adoptPlanHandoff('?c=US&hx=nope', null, storage);
    expect(missing?.search).toBe('c=US');
    storePlanHandoff(HREF, 'bo=2026-11-23', storage, () => 'old', 0);
    const expired = adoptPlanHandoff('?c=US&hx=old', null, storage, 60 * 60 * 1000);
    expect(new URLSearchParams(readBrowserPlanSearch(expired!.search, expired!.historyState)).has('bo')).toBe(false);
  });
});
