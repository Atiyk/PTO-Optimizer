import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { defaultEmployerCalendar, encodeEmployerCalendar } from '../personal/employerCalendar';
import { initialPolicyPreferences, keepPrivatePolicyDraft, readBrowserPolicyDraft } from '../personal/policyPreferences';
import { useAppState } from '../ui/useAppState';
import { PLAN_ADDRESS_KEYS, PLAN_PRIVATE_KEYS, POLICY_PRIVATE_KEYS } from '../ui/shareFormat';
import { buildPublicPlanLink } from '../ui/publicSharePrivacy';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
});

/** A pre-allowlist /pto link carrying every private planner key at once. */
function legacyPlanSearch(): URLSearchParams {
  return new URLSearchParams({
    c: 'US', s: '2027-01-04', e: '2027-03-28', b: '6', w: '30', count: '0',
    eh: encodeEmployerCalendar({ ...defaultEmployerCalendar('US'), custom: [{ date: '2027-01-08', name: 'PRIVATE shutdown' }] }),
    bo: '2027-01-11', od: '2027-01-12', r: '2027-01-13',
    ac: '1', am: '1.5', ex: '1', xd: '2027-03-01', cc: '2',
    np: '21', pc: '1', pcs: '2027-02-01', pce: '2027-02-28', pcm: '2', up: '1',
    salary: '91000', employer: 'PRIVATE Corp',
  });
}

describe('legacy /pto links with private params', () => {
  it('import the private settings on-device and strip them from the address bar on open', () => {
    window.history.replaceState(null, '', `/pto?${legacyPlanSearch()}#planning-assumptions`);
    const view = renderHook(() => useAppState());
    try {
      const address = new URLSearchParams(window.location.search);
      const allowed = new Set<string>(PLAN_ADDRESS_KEYS);
      expect([...address.keys()].filter(key => !allowed.has(key))).toEqual([]);
      for (const key of PLAN_PRIVATE_KEYS) expect(address.has(key), key).toBe(false);
      expect(window.location.href).not.toMatch(/PRIVATE|salary|employer|91000/);
      expect(window.location.hash).toBe('#planning-assumptions');
      // Read once, kept locally: the plan still uses them.
      const state = view.result.current;
      expect(state.holidayNameFor('2027-01-08')).toBe('PRIVATE shutdown');
      expect(state.solveInput.blackouts).toContain('2027-01-11');
      expect(state.noticePeriodDays).toBe(21);
      expect(state.accrualEnabled).toBe(true);
      expect(state.expiryEnabled).toBe(true);
      expect(state.peakCapEnabled).toBe(true);
      expect(state.unlimitedPto).toBe(true);
      // Never re-shared: the public link built from this state omits all of it.
      const share = buildPublicPlanLink(window.location.href, state.planSearch).url;
      for (const key of PLAN_PRIVATE_KEYS) expect(new URL(share).searchParams.has(key), key).toBe(false);
      expect(share).not.toMatch(/PRIVATE|salary|employer|#/);
    } finally {
      view.unmount();
    }
  });

  it('restores the imported private settings after a same-tab refresh without re-adding them to the URL', () => {
    window.history.replaceState(null, '', `/pto?${legacyPlanSearch()}`);
    renderHook(() => useAppState()).unmount();
    const refreshed = renderHook(() => useAppState());
    try {
      expect(refreshed.result.current.noticePeriodDays).toBe(21);
      expect(refreshed.result.current.solveInput.blackouts).toContain('2027-01-11');
      expect(new URLSearchParams(window.location.search).has('np')).toBe(false);
      expect(new URLSearchParams(window.location.search).has('bo')).toBe(false);
    } finally {
      refreshed.unmount();
    }
  });
});

describe('legacy /policy links with balances', () => {
  it('read the balance once, keep it in the history entry and leave only the country in the address bar', () => {
    const legacy = new URLSearchParams({
      c: 'US', ak: 'pp', am: '1.5', fq: 'b', pda: '2027-01-08', cb: '17.5', bao: '2027-01-01',
      car: '3', pd: '2027-02-01', nba: '2', pol: 'p', signin: 'ok', note: 'PRIVATE',
    });
    window.history.replaceState(null, '', `/policy?${legacy}`);
    const policy = initialPolicyPreferences(window.location.search, 'US');
    expect(policy.currentBalance).toBe(17.5);
    const draft = new URLSearchParams(legacy);
    draft.delete('signin');
    draft.delete('note');
    keepPrivatePolicyDraft(draft.toString(), policy.country);
    expect(window.location.search).toBe('?c=US&signin=ok');
    for (const key of POLICY_PRIVATE_KEYS) expect(new URLSearchParams(window.location.search).has(key), key).toBe(false);
    expect(initialPolicyPreferences(window.location.search, 'US', readBrowserPolicyDraft()).currentBalance).toBe(17.5);
  });
});
