import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { rangeISO } from './dateUtils';
import { solve } from './solve';
import { PLANNER_REVISION } from './revision';
import type { SolveInput } from './types';

// Full-result fingerprints. These include alternatives, tags and tie-breaking, rather
// than checking totals alone. Originally captured from the pre-optimization
// implementation; re-captured once for the deliberate issue 5/6 plan changes (breaks are
// whole, separate absences; US travel uses the seasonal figure) - see
// breakShape.test.ts for the behaviour those changes guarantee.
const LEGACY_RESULTS = [
  '20461ab1f71a161812d38661ca3e81049873ae1ccf731c34e6aabb9bb4d48f07',
  'e5bda38c9c424b1455e910737fa2ea4dd1862590d653ca1575b1cb58e3d38918',
  'bf054aff24e7c2061f26acd9097b3fa07e259f2a2211f3ca62378f75afd55c78',
  'a91d212a82088d7abc4a999012e1f015ff941810a1608e71a5c2e2b5054886d6',
  '7c9048a90bf5788e4cbd7cc04e761f41e88c1d86aaa49c0fa71763c40f4f07de',
  '957076e9e3e77923a7afc41412355c4c7617218cefd10419901f5825454dcef9',
  '8fc93412641dff774331ec5cf7eec79b0eea4dd97946c0ef6a95638c64e6fc42',
  'a087d5246b13284d14b2c9ce52b5df124144e2a973cc3d125126334d0fa7ce5a',
  '9b8323325ac5574a46234813cce3dda94eb998fcb41626f7c274abd6dd7f6ec1',
  'db20b7b2a73cd65f4a3726e82d6d8443d560b0cbdf532b20d0f9f25897e3a78c',
  '9a297a8d4195da4873d735f9a8a5327fb08f6c2aa8d8985583848d42439f57bf',
  '78b597a8dcb5385836c5c5aeb8f52c6d7d57afdb3b483310af9cd9c4189a4ba7',
  '7a3d7dc8ed59ad472c6376018fcf9404ed3d49a887106b73168152b50eba2a82',
  '3abe1be44257eebe5eb113cc9bfceac30a93ffecae1acb853efd98eeeb7f41bb',
  'eb998fafe6d6262cbdf8b610adfba74183f52f3ff93ee6829590e7e2b229bb3d',
  'aaa4f64122867c3210e9016f8b4751480732d6877c0490f87d543614940ab1ea',
  'acda7531f7abbd0daeccab7f405880c368f4dd76b0fec93a6587485c9d12e979',
  '5a91666ba6092dfc41a33c93e313f2eff93ee6e7c952e09578d3ef04dba725ca',
  '5cc3d47a9d7bbfea393267e7bfc3cb45a00f07c74a4f15a8be3c46638d2ab390',
  '6e326147d8f858ac71f8d68b5dd5f5a14a2ecb2fbc7a797a342078da97571389',
  'bbfa137ccb8abb7c83963919c535e563cb5fedc5c6598e66c240c029913713c0',
  'e03a5c92ad0233076fdea0530c9bf8b8f5aef9abd3c7c7db9aeed3888894089c',
  '90786deba77b5f7021fb355603e528bddf4654461729dc37a837bfb7a9da0401',
  '424505c089f3413a06a44a50e0349e5331e5dbcaaa0874bc9e1352663c372f12',
];

describe('DP performance optimizations preserve legacy plans', () => {
  it('keeps complete results byte-identical across deterministic varied inputs', () => {
    for (let seed = 0; seed < LEGACY_RESULTS.length; seed++) {
      const input: SolveInput = {
        offDays: ['2028-02-14', '2028-02-21'],
        rangeStart: '2028-02-01', rangeEnd: '2028-03-15', budget: seed % 7 + 1,
        w: seed % 11 * 10, breakCount: seed % 8, country: seed % 2 ? 'US' : 'GB',
        blackouts: seed % 5 === 0 ? ['2028-02-11'] : [],
        workWeek: seed % 4 === 0 ? [true, true, true, true, false, false, false] : undefined,
        accrualPerMonth: seed % 6 === 0 ? 3 : undefined,
        expiryDate: seed % 7 === 0 ? '2028-02-29' : undefined,
        carryoverCap: seed % 7 === 0 ? 1 : undefined,
        mustIncludeDays: seed % 9 === 0 ? ['2028-02-09'] : [],
      };
      const fingerprint = createHash('sha256').update(JSON.stringify(solve(input))).digest('hex');
      expect(fingerprint, `legacy fixture ${seed}`).toBe(LEGACY_RESULTS[seed]);
    }
  });

  it('still maximizes spend after determining the maximum feasible count', () => {
    // Four days accrue on Sunday Feb 1. Only one separate break is possible, but
    // it can use all four PTO days. Finding the count using cost-1 suffixes must
    // not incorrectly restrict the final value DP to cost-1 candidates.
    const result = solve({
      offDays: [], rangeStart: '2026-01-01', rangeEnd: '2026-02-01',
      budget: 4, accrualPerMonth: 4, breakCount: 7, w: 0,
      blackouts: rangeISO('2026-01-01', '2026-01-26'),
    });
    expect(result.breakCountActual).toBe(1);
    expect(result.budgetSpent).toBe(4);
    expect(result.primary[0].start).toBe('2026-01-27');
    expect(result.primary[0].end).toBe('2026-02-01');
  });
});

describe('planner revision (issue 9)', () => {
  it('is bumped whenever the legacy plan fingerprints are re-captured', () => {
    // Shared links record PLANNER_REVISION so recipients learn when a plan was
    // recalculated. If you re-capture LEGACY_RESULTS for a deliberate plan change, bump
    // PLANNER_REVISION in revision.ts and add the new digest here.
    const digest = createHash('sha256').update(LEGACY_RESULTS.join(',')).digest('hex');
    const KNOWN: Record<number, string> = { 2: 'f6f3b539770272dfe0e80c52eaab8f57fc9b05c43bcfdcab97d6933998f09c06' };
    expect(KNOWN[PLANNER_REVISION]).toBe(digest);
  });
});
