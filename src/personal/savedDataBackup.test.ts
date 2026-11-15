import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSavedDataBackup, isBackedUpKey, parseSavedDataBackup, restoreSavedDataBackup, serializeSavedDataBackup, summarizeSavedData,
} from './savedDataBackup';
import { RETENTION_STORAGE_KEY } from './retentionStatus';

const PLANS = 'gapless.personal.pinned-plans.v1';
const REQUESTS = 'gapless.personal.requests.v1';
const POLICY = 'gapless.personal.policy.v1';
const EMPLOYER = 'gapless.employer.v1:US:';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('full saved-data backup (P3 storage honesty)', () => {
  it('copies every saved plan, request, policy and employer record exactly, and nothing else', () => {
    localStorage.setItem(PLANS, '{"version":1,"plans":[]}');
    localStorage.setItem(REQUESTS, '{"version":1,"requests":[],"revision":"r1"}');
    localStorage.setItem(`${REQUESTS}.backup`, '{"version":1,"raw":"old"}');
    localStorage.setItem(EMPLOYER, '{"version":1}');
    localStorage.setItem(RETENTION_STORAGE_KEY, '{"version":1}');
    localStorage.setItem('pto-optimizer:holidays:v1:US:2027', '[]');
    localStorage.setItem('timebower.analytics.breakActions.v1', '[]');
    const backup = buildSavedDataBackup(localStorage, new Date('2026-11-14T10:00:00Z'));
    expect(Object.keys(backup.items)).toEqual([EMPLOYER, PLANS, REQUESTS, `${REQUESTS}.backup`]);
    expect(backup.items[REQUESTS]).toBe('{"version":1,"requests":[],"revision":"r1"}');
    expect(backup.exportedAt).toBe('2026-11-14T10:00:00.000Z');
    expect(isBackedUpKey('gapless.handoff.v1.abc')).toBe(false);
  });

  it('round-trips through the file format', () => {
    localStorage.setItem(POLICY, '{"version":1,"x":1}');
    const text = serializeSavedDataBackup(buildSavedDataBackup(localStorage));
    const parsed = parseSavedDataBackup(text);
    expect(parsed.ok && parsed.backup.items[POLICY]).toBe('{"version":1,"x":1}');
  });

  it('restores into an empty browser', () => {
    const backup = { format: 'timebower-saved-data', version: 1, exportedAt: '2026-01-01T00:00:00Z', items: { [PLANS]: 'P', [REQUESTS]: 'R' } } as const;
    const result = restoreSavedDataBackup(localStorage, backup);
    expect(result.added.sort()).toEqual([PLANS, REQUESTS]);
    expect(localStorage.getItem(PLANS)).toBe('P');
  });

  it('never overwrites anything already saved in this browser', () => {
    localStorage.setItem(PLANS, 'newer plans here');
    localStorage.setItem(REQUESTS, 'R');
    const backup = { format: 'timebower-saved-data', version: 1, exportedAt: '2026-01-01T00:00:00Z', items: { [PLANS]: 'older plans', [REQUESTS]: 'R', [POLICY]: 'policy' } } as const;
    const result = restoreSavedDataBackup(localStorage, backup);
    expect(result).toEqual({ added: [POLICY], same: [REQUESTS], kept: [PLANS], failed: [] });
    expect(localStorage.getItem(PLANS)).toBe('newer plans here');
    expect(localStorage.getItem(POLICY)).toBe('policy');
  });

  it('refuses files that are not a full backup, or that name keys outside saved data', () => {
    expect(parseSavedDataBackup('not json')).toEqual({ ok: false, reason: 'unreadable' });
    expect(parseSavedDataBackup('{"version":1,"banks":[]}')).toEqual({ ok: false, reason: 'balances-only' });
    expect(parseSavedDataBackup('{"format":"timebower-saved-data","version":2,"exportedAt":"x","items":{}}')).toEqual({ ok: false, reason: 'newer-version' });
    expect(parseSavedDataBackup(JSON.stringify({ format: 'timebower-saved-data', version: 1, exportedAt: 'x', items: { 'other.key': 'v' } })))
      .toEqual({ ok: false, reason: 'unreadable' });
    expect(parseSavedDataBackup(JSON.stringify({ format: 'timebower-saved-data', version: 1, exportedAt: 'x', items: { [PLANS]: 5 } })))
      .toEqual({ ok: false, reason: 'unreadable' });
  });

  it('counts what a person would lose', () => {
    expect(summarizeSavedData(localStorage)).toEqual({ pinnedPlans: 0, requests: 0 });
    localStorage.setItem(PLANS, JSON.stringify({ version: 1, plans: [{}, {}] }));
    localStorage.setItem(REQUESTS, JSON.stringify({ version: 1, requests: [{
      id: 'a', start: '2027-01-04', end: '2027-01-04', ptoDates: ['2027-01-04'], status: 'planned', note: '',
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    }] }));
    expect(summarizeSavedData(localStorage)).toEqual({ pinnedPlans: 2, requests: 1, oldestRequestAt: '2026-10-01T00:00:00.000Z' });
  });
});
