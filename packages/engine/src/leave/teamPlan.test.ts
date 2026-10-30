import { describe, expect, it } from 'vitest';
import { coverageViolations, type CoverageRuleInput } from './coverage';
import { planTeam, type PlannerMember } from './teamPlan';
import type { WorkWeek } from '../solver/types';

const MON_FRI: WorkWeek = [true, true, true, true, true, false, false];
const person = (id: string, need: number, deadline: string, extra: Partial<PlannerMember> = {}): PlannerMember => ({
  id, teamId: 't', tags: ['eng'], workWeek: MON_FRI, out: new Set(), need, deadline, ...extra,
});
const rule = (id: string, minPresent: number, tag: string | null = null): CoverageRuleInput => ({ id, teamId: 't', minPresent, tag, weekdays: '1111100' });

/** Applies a plan to the members and checks the coverage engine finds nothing new. */
function violationsAfter(members: PlannerMember[], rules: CoverageRuleInput[], result: ReturnType<typeof planTeam>, start: string, end: string) {
  const byId = new Map(result.plans.map((p) => [p.memberId, p.days]));
  const after = members.map((m) => ({ ...m, out: new Set([...m.out, ...(byId.get(m.id) ?? [])]) }));
  const before = new Set(coverageViolations(rules, members, start, end).map((v) => `${v.ruleId}|${v.date}`));
  return coverageViolations(rules, after, start, end).filter((v) => !before.has(`${v.ruleId}|${v.date}`));
}

describe('team planner', () => {
  // Mon 2026-12-07 .. Thu 2026-12-31. Christmas Fri 12-25 is a holiday for everyone.
  const xmas = new Set(['2026-12-25']);
  const start = '2026-12-07';
  const end = '2026-12-31';

  it('places everyone when coverage allows, bridging onto weekends and holidays', () => {
    const members = [
      person('a', 3, end, { holidays: xmas }),
      person('b', 2, end, { holidays: xmas }),
      person('c', 0, end, { holidays: xmas }),
      person('d', 0, end, { holidays: xmas }),
    ];
    const r = planTeam({ members, rules: [rule('min2', 2)], start });
    expect(r.totalForfeited).toBe(0);
    expect(r.exact).toBe(true);
    expect(violationsAfter(members, [rule('min2', 2)], r, start, end)).toEqual([]);
    // Every planned block joins a weekend or holiday: no isolated mid-week days.
    for (const p of r.plans) for (const b of p.blocks) expect(b.daysOff).toBeGreaterThan(b.leaveDays);
  });

  it('never breaks coverage, across many random teams (seeded)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 40; trial++) {
      const n = 3 + Math.floor(rnd() * 8);
      const members = Array.from({ length: n }, (_, i) =>
        person(`m${i}`, Math.floor(rnd() * 8), rnd() < 0.5 ? '2026-12-18' : end, {
          tags: rnd() < 0.5 ? ['eng'] : ['ops'],
          out: new Set(rnd() < 0.3 ? ['2026-12-10', '2026-12-11'] : []),
          holidays: xmas,
        }),
      );
      const rules = [rule('all', Math.floor(n / 2)), rule('eng', 1, 'eng'), rule('ops', 1, 'ops')];
      const r = planTeam({ members, rules, start });
      expect(violationsAfter(members, rules, r, start, end)).toEqual([]);
      expect(r.totalPlaced + r.totalForfeited).toBe(r.totalNeed);
    }
  });

  it('is deterministic: same inputs, same plan, whatever the input order', () => {
    const members = [person('a', 4, end), person('b', 4, end), person('c', 4, end), person('d', 1, end)];
    const one = planTeam({ members, rules: [rule('min2', 2)], start });
    const two = planTeam({ members: [...members].reverse(), rules: [rule('min2', 2)], start });
    expect(two.plans).toEqual(one.plans);
    expect(two.heatmap).toEqual(one.heatmap);
  });

  it('when coverage makes zero forfeiture impossible it says so, and forfeits the minimum', () => {
    // 3 people, at least 2 present, 5 working days before the deadline → at most 5 person-days off
    // in total. They need 4 + 4 + 4 = 12. Minimum forfeiture is 12 - 5 = 7.
    const deadline = '2026-12-11';
    const members = [person('a', 4, deadline), person('b', 4, deadline), person('c', 4, deadline)];
    const r = planTeam({ members, rules: [rule('min2', 2)], start });
    expect(r.totalPlaced).toBe(5);
    expect(r.totalForfeited).toBe(7);
    expect(r.exact).toBe(true);
    expect(r.plans.every((p) => p.shortfallReason?.includes('Coverage rules leave room'))).toBe(true);
    expect(violationsAfter(members, [rule('min2', 2)], r, start, deadline)).toEqual([]);
  });

  it('a greedy first-come plan would forfeit more; the flow does not', () => {
    // a can use any day; b can only use Mon/Tue (blackouts). One person off per day.
    // Greedy giving a Mon/Tue first would strand b. Optimal: a takes Wed-Fri, b Mon/Tue.
    const deadline = '2026-12-11';
    const members = [
      person('a', 3, deadline),
      person('b', 2, deadline, { unavailable: new Set(['2026-12-09', '2026-12-10', '2026-12-11']) }),
      person('c', 0, deadline),
    ];
    const r = planTeam({ members, rules: [rule('min2', 2)], start });
    expect(r.totalForfeited).toBe(0);
    expect(r.plans.find((p) => p.memberId === 'b')!.days).toEqual(['2026-12-07', '2026-12-08']);
  });

  it('stays interactive for 50 people over 60 days (measured)', () => {
    const members = Array.from({ length: 50 }, (_, i) =>
      person(`p${String(i).padStart(2, '0')}`, 3 + (i % 8), '2027-01-29', { tags: i % 3 ? ['eng'] : ['ops'], holidays: xmas }),
    );
    const rules = [rule('all', 30), rule('eng', 18, 'eng'), rule('ops', 8, 'ops')];
    const t = performance.now();
    const r = planTeam({ members, rules, start: '2026-12-01', timeBudgetMs: 1500 });
    const ms = performance.now() - t;
    console.log(`50 people × 60 days: ${ms.toFixed(0)} ms, ${r.stats.flowAugmentations} augmentations, ${r.stats.swaps} swaps, placed ${r.totalPlaced}/${r.totalNeed}`);
    expect(ms).toBeLessThan(3000);
    expect(r.stats.stoppedEarly).toBe(false);
    expect(violationsAfter(members, rules, r, '2026-12-01', '2027-01-29')).toEqual([]);

    // Tight: 45 of 50 must be in, so most days cannot be placed.
    const tightRules = [rule('all', 45)];
    const t2 = performance.now();
    const tight = planTeam({ members, rules: tightRules, start: '2026-12-01', timeBudgetMs: 1500 });
    console.log(`tight (45 of 50 in): ${(performance.now() - t2).toFixed(0)} ms, placed ${tight.totalPlaced}/${tight.totalNeed}`);
    expect(tight.stats.stoppedEarly).toBe(false);
    expect(violationsAfter(members, tightRules, tight, '2026-12-01', '2027-01-29')).toEqual([]);
  });
});
