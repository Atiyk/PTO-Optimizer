import { describe, expect, it } from 'vitest';
import { LABOR_US_CA } from '../../rulepacks/labor';
import { evaluateCandidate, isShortNotice, rankCandidates, SCORE_WEIGHTS, type CandidateFacts, type CoverNeed } from './ranking';
import { mergePacks } from './requiredStaff';
import { localInterval } from './timeBlocks';
import type { RulePack } from './types';

const LA = 'America/Los_Angeles';
const DATE = '2026-11-06'; // Friday
const iv = (date: string, s: number, e: number) => localInterval(date, s, e, LA);
const cpr = { anyOf: ['cpr'], ruleId: 'cpr', provenance: { basis: 'org_policy' as const } };

const need: CoverNeed = { siteId: 's1', roomId: 'toddlers', date: DATE, interval: iv(DATE, 420, 660), credentials: [cpr], absentMemberId: 'absent' };
const work: Pick<RulePack, 'rules'> = mergePacks([
  LABOR_US_CA,
  {
    ageGroups: [],
    rules: [
      { id: 'rest', label: 'At least 10 h between shifts', kind: 'min_rest_between_shifts', hours: 10, basis: 'org_policy' },
      { id: 'day', label: 'At most 10 h a day', kind: 'max_hours_per_day', hours: 10, basis: 'org_policy' },
      { id: 'week', label: 'At most 45 h a week', kind: 'max_hours_per_week', hours: 45, basis: 'org_policy' },
      { id: 'run', label: 'At most 6 days in a row', kind: 'max_consecutive_days', days: 6, basis: 'org_policy' },
    ],
  },
]);

function cand(id: string, over: Partial<CandidateFacts> = {}): CandidateFacts {
  return {
    memberId: id,
    active: true,
    homeSiteId: 's1',
    optIn: 'ask',
    shifts: [],
    absences: [],
    credentials: [{ key: 'cpr', expiresOn: '2027-12-31' }],
    fairness: { coverTaken: 0, holidayCover: 0, shortNotice: 0 },
    ...over,
  };
}

describe('cover ranking (COVERAGE-SPEC §4)', () => {
  it('RC3: excludes an expired CPR and a rest-rule breach, says why, and ranks the rest deterministically', () => {
    const people = [
      cand('A', { credentials: [{ key: 'cpr', expiresOn: '2026-11-01' }] }),
      cand('B', { shifts: [{ date: '2026-11-05', interval: iv('2026-11-05', 900, 1380) }] }), // ends 23:00, cover 07:00 → 8 h
      cand('C', { fairness: { coverTaken: 2, holidayCover: 0, shortNotice: 0 } }),
      cand('E'),
      cand('D'),
    ];
    const ranked = rankCandidates(need, people, { pack: work });
    expect(ranked.map((r) => [r.memberId, r.rank, r.score])).toEqual([
      ['D', 1, 0],
      ['E', 2, 0],
      ['C', 3, 200],
      ['A', null, null],
      ['B', null, null],
    ]);
    const a = ranked.find((r) => r.memberId === 'A')!;
    expect(a.excludedBy).toBe('credential_valid');
    expect(a.checks.find((c) => c.id === 'credential_valid')!.detail).toBe('cpr expired on 2026-11-01');
    const b = ranked.find((r) => r.memberId === 'B')!;
    expect(b.excludedBy).toBe('min_rest');
    expect(b.checks.find((c) => c.id === 'min_rest')!.detail).toBe('8 h rest next to the cover; minimum 10 h');
    // Same result whatever the input order.
    expect(rankCandidates(need, [...people].reverse(), { pack: work }).map((r) => r.memberId)).toEqual(ranked.map((r) => r.memberId));
  });

  it('every candidate carries every check it went through', () => {
    const r = evaluateCandidate(need, cand('X'), { pack: work });
    expect(r.checks.map((c) => c.id)).toEqual([
      'active', 'site_allowed', 'opted_in', 'not_on_leave', 'available', 'credential_valid', 'min_rest', 'max_hours_day', 'max_hours_week', 'max_consecutive_days',
    ]);
    expect(r.checks.every((c) => c.passed)).toBe(true);
  });

  const fails: [string, Partial<CandidateFacts> | ((n: CoverNeed) => [CoverNeed, Partial<CandidateFacts>]), string][] = [
    ['active', { active: false }, 'Not an active member'],
    ['site_allowed', { homeSiteId: 's2' }, 'Not set up to cover this site'],
    ['opted_in', { optIn: 'no' }, 'Opted out of cover offers'],
    ['not_on_leave', { absences: [{ status: 'pending', interval: iv(DATE, 0, 1440) }] }, 'Has pending leave at that time'],
    ['available', { shifts: [{ date: DATE, interval: iv(DATE, 600, 900) }] }, 'Already scheduled at an overlapping time'],
    ['credential_valid', { credentials: [] }, 'No valid cpr on 2026-11-06'],
    ['min_rest', { shifts: [{ date: DATE, interval: iv(DATE, 1200, 1380) }] }, '9 h rest next to the cover; minimum 10 h'],
    ['max_hours_day', { shifts: [{ date: DATE, interval: iv(DATE, 1260, 240) }] }, '11 h on 2026-11-06 with the cover; maximum 10 h'],
    [
      'max_hours_week',
      { shifts: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => ({ date: d, interval: iv(d, 360, 1020) })) },
      '48 h in the week of 2026-11-02 with the cover; maximum 45 h',
    ],
    [
      'max_consecutive_days',
      { shifts: ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => ({ date: d, interval: iv(d, 360, 480) })) },
      '7 days in a row with the cover; maximum 6',
    ],
  ];
  for (const [id, over, detail] of fails) {
    it(`hard filter ${id} fails with a reason`, () => {
      const r = evaluateCandidate(need, cand('X', over as Partial<CandidateFacts>), { pack: work });
      expect(r.eligible).toBe(false);
      expect(r.excludedBy).toBe(id);
      expect(r.checks.find((c) => c.id === id)).toMatchObject({ passed: false, detail });
    });
  }

  it('the absent person is never a candidate; other sites pass when agreed', () => {
    expect(evaluateCandidate(need, cand('absent'), { pack: work }).excludedBy).toBe('active');
    const r = evaluateCandidate(need, cand('X', { homeSiteId: 's2', allowedSiteIds: ['s1'] }), { pack: work });
    expect(r).toMatchObject({ eligible: true, score: SCORE_WEIGHTS.otherSite });
  });

  it('score: fairness, opt-in, overtime cost (only when cost-aware) and travel; ties broken by member id', () => {
    const otShifts = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => ({ date: d, interval: iv(d, 480, 1080) })); // 40 h
    const people = [cand('p2', { optIn: 'yes' }), cand('p1', { shifts: otShifts }), cand('p3', { fairness: { coverTaken: 0, holidayCover: 1, shortNotice: 1 } })];
    const plain = rankCandidates(need, people, { pack: work });
    expect(plain.map((r) => [r.memberId, r.score, r.costBand])).toEqual([
      ['p2', -40, 'regular'],
      ['p1', 0, 'overtime'],
      ['p3', 80, 'regular'],
    ]);
    const costly = rankCandidates(need, people, { pack: work, costAware: true });
    expect(costly.map((r) => [r.memberId, r.score])).toEqual([
      ['p2', -40],
      ['p3', 80],
      ['p1', 200],
    ]);
    expect(costly.find((r) => r.memberId === 'p1')!.scoreParts).toEqual({ fairness: 0, preference: 0, cost: 200, travel: 0 });
  });

  it('short notice is under 24 h before the start', () => {
    expect(isShortNotice({ interval: need.interval, requestedAt: need.interval.start - 3_600_000 })).toBe(true);
    expect(isShortNotice({ interval: need.interval, requestedAt: need.interval.start - 25 * 3_600_000 })).toBe(false);
  });
});
