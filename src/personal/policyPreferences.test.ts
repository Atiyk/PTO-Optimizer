import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePolicyPreferences, initialPolicyPreferences, savePolicyPreferences } from './policyPreferences';
import { readPolicyStateFromURL, writePolicyStateToURL } from '../ui/policyUrlState';

const KEY = 'gapless.personal.policy.v1';
const saved = 'c=US&cb=18&bao=2027-02-01&ak=pp&am=1&fq=m&pda=2027-02-15&cm=a&ace=0&fd=2027-04-01&car=2&cue=1&cub=2027-03-31';
beforeEach(() => window.localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe('optional local policy preferences', () => {
  it('defaults an unsaved quick forecast to no assumed balance or forfeiture', () => {
    expect(initialPolicyPreferences('', 'GB')).toMatchObject({ country: 'GB', currentBalance: 0, carryoverMode: 'all', accrualCapEnabled: false });
  });
  it('round-trips saved policy fields including forecast date and native carried balance', () => {
    expect(savePolicyPreferences(saved)).toBe(true);
    expect(initialPolicyPreferences('', 'CA')).toMatchObject({ country: 'US', currentBalance: 18, balanceAsOf: '2027-02-01', forecastDate: '2027-04-01', currentCarriedBalance: 2 });
  });
  it('uses explicit URL policy fields ahead of a saved policy without writing storage', () => {
    savePolicyPreferences(saved);
    const before = window.localStorage.getItem(KEY);
    const incoming = initialPolicyPreferences('?cb=4&bao=2027-01-01&ak=fl&am=0&gd=2027-01-01&cm=a&ace=0&fd=2027-03-01', 'GB');
    expect(incoming).toMatchObject({ currentBalance: 4, balanceAsOf: '2027-01-01', forecastDate: '2027-03-01' });
    expect(window.localStorage.getItem(KEY)).toBe(before);
    expect(initialPolicyPreferences('', 'GB').currentBalance).toBe(18);
  });
  it('allows a date-only link to change the forecast of the locally saved policy', () => {
    savePolicyPreferences(saved);
    expect(initialPolicyPreferences('?fd=2027-05-01', 'US')).toMatchObject({ currentBalance: 18, forecastDate: '2027-05-01' });
    expect(initialPolicyPreferences('', 'US').forecastDate).toBe('2027-04-01');
  });
  it('filters unrelated/private data rather than persisting all parameters in a link', () => {
    savePolicyPreferences(`${saved}&note=Private%20note&status=approved&employer=Private%20company&token=secret&unrelated=test`);
    const value = window.localStorage.getItem(KEY)!;
    for (const text of ['Private', 'approved', 'token', 'secret', 'unrelated']) expect(value).not.toContain(text);
    expect(initialPolicyPreferences('', 'US').currentBalance).toBe(18);
  });
  it('rejects oversized or malformed stored preferences and handles unavailable storage', () => {
    expect(savePolicyPreferences('x'.repeat(14001))).toBe(false);
    for (const raw of ['{', JSON.stringify({ version: 2, search: saved }), JSON.stringify({ version: 1, search: {} })]) {
      window.localStorage.setItem(KEY, raw);
      expect(initialPolicyPreferences('', 'US').currentBalance).toBe(0);
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
    expect(initialPolicyPreferences('', 'US').currentBalance).toBe(0);
    expect(savePolicyPreferences(saved)).toBe(false);
  });
  it('lets users delete the saved policy while leaving the current URL untouched', () => {
    savePolicyPreferences(saved);
    const search = window.location.search;
    expect(deletePolicyPreferences()).toBe(true);
    expect(initialPolicyPreferences('', 'US').currentBalance).toBe(0);
    expect(window.location.search).toBe(search);
  });
  it('keeps legacy cb distinct from new car and handles malformed new parameters', () => {
    const state = readPolicyStateFromURL('?cb=80&car=24&u=1&hpd=8&fd=2027-04-01', 'US');
    expect(state).toMatchObject({ currentBalance: 80, currentCarriedBalance: 24, unit: 'hours', hoursPerDay: 8, forecastDate: '2027-04-01' });
    const params = new URLSearchParams(); writePolicyStateToURL(params, state);
    expect(params.get('cb')).toBe('80'); expect(params.get('car')).toBe('24'); expect(params.get('fd')).toBe('2027-04-01');
    const invalid = readPolicyStateFromURL('?cb=80&car=Infinity&fd=2027-02-30', 'US');
    expect(invalid.currentCarriedBalance).toBe(0);
    expect(invalid.forecastDate).toBeUndefined();
  });
});
