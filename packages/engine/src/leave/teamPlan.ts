import { addDays, mondayIndexedDow, rangeISO } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';
import { isScheduled, ruleApplies, type CoverageMember, type CoverageRuleInput } from './coverage';

/*
 * Team planner ("clear expiring leave"): place each person's at-risk days so that
 *   1. as few days as possible are forfeited, then
 *   2. each person gets long stretches off (bridges onto weekends, holidays, booked leave),
 * without ever breaking a coverage rule.
 *
 * Algorithm (see docs/teams/PLANNER.md for the write-up and timings):
 *   Stage 1, min-cost max-flow. Source → person (capacity = days needed) → (day, innermost
 *   coverage rule containing the person) → (day, enclosing rule) → … → day → sink. A rule's
 *   node passes at most its slack that day (people present minus the minimum). Max flow =
 *   the most days that can be placed, so forfeiture is minimal; when every team's rules are
 *   laminar (nested or disjoint, e.g. "2 people" and "1 engineer") this is exact. Edge costs
 *   prefer bridge days, preferred months and roomy days, and avoid dates a person wants to
 *   keep; each person's k-th day costs a little more than their (k-1)-th, so scarce days are
 *   shared out evenly rather than first come first served; successive shortest paths (SPFA) picks the cheapest maximum assignment.
 *   Stage 2, local search per person: swap a planned day for another eligible day when it
 *   makes longer runs off (score = Σ run length² over runs containing a planned day) and
 *   coverage still holds. Counts never change, so stage 1's minimum stands.
 *   Non-laminar rules: stage 1 uses the person's rules ordered by size as a chain, then
 *   every day is re-checked against every rule and dropped if it breaks one (`exact` false).
 *
 * Deterministic: inputs are sorted, ties broken by id/date, no randomness. The time budget
 * only stops stage 2 early (reported as `stoppedEarly`); stage 1 always completes.
 * Size: V ≈ P + D·(R+1), E ≈ P·D; ~50 people × 60 days runs in tens of milliseconds.
 */

export interface PlannerMember extends CoverageMember {
  /** Whole days to place (0 = only counted for coverage). */
  need: number;
  /** Last day leave can be taken for it to count (e.g. the day before forfeiture). */
  deadline: ISODate;
  /** Days this person cannot take (blackouts, or dates they asked to keep free). */
  unavailable?: ReadonlySet<ISODate>;
  /** Soft preferences. */
  preferMonths?: readonly number[];
  avoid?: ReadonlySet<ISODate>;
}

export interface TeamPlanInput {
  members: readonly PlannerMember[];
  rules: readonly CoverageRuleInput[];
  /** First day that can be planned (usually tomorrow). */
  start: ISODate;
  timeBudgetMs?: number;
  /** Injectable clock for the time budget. */
  clock?: () => number;
}

export interface PlannedBlock {
  start: ISODate;
  end: ISODate;
  /** Working days taken as leave in this block. */
  leaveDays: number;
  /** Calendar days off in a row including weekends, holidays and leave already booked. */
  daysOff: number;
}

export interface MemberPlan {
  memberId: string;
  need: number;
  placed: number;
  unplaced: number;
  days: ISODate[];
  blocks: PlannedBlock[];
  /** Why some days could not be placed. Null when everything was placed. */
  shortfallReason: string | null;
}

export interface HeatmapDay {
  date: ISODate;
  /** People out that day after the plan (booked + planned). */
  out: number;
  planned: number;
  rules: Array<{ ruleId: string; required: number; present: number; slackLeft: number }>;
}

export interface TeamPlanResult {
  plans: MemberPlan[];
  totalNeed: number;
  totalPlaced: number;
  /** Days that will still be forfeited. 0 when everything fits. */
  totalForfeited: number;
  /** True when stage 1 is provably optimal (laminar rules). */
  exact: boolean;
  heatmap: HeatmapDay[];
  stats: { ms: number; flowAugmentations: number; swaps: number; stoppedEarly: boolean };
}

// ── min-cost flow (successive shortest paths with SPFA) ─────────────────────

interface Edge {
  to: number;
  cap: number;
  cost: number;
}
class Flow {
  readonly edges: Edge[] = [];
  readonly adj: number[][] = [];
  node(): number {
    this.adj.push([]);
    return this.adj.length - 1;
  }
  add(from: number, to: number, cap: number, cost: number): number {
    this.adj[from]!.push(this.edges.length);
    this.edges.push({ to, cap, cost });
    this.adj[to]!.push(this.edges.length);
    this.edges.push({ to: from, cap: 0, cost: -cost });
    return this.edges.length - 2;
  }
  /** Returns augmentations performed. Deterministic: fixed adjacency order, FIFO queue. */
  run(s: number, t: number): number {
    const n = this.adj.length;
    let augmentations = 0;
    for (;;) {
      const dist = new Array<number>(n).fill(Infinity);
      const inQ = new Array<boolean>(n).fill(false);
      const prevEdge = new Array<number>(n).fill(-1);
      dist[s] = 0;
      const q: number[] = [s];
      inQ[s] = true;
      for (let head = 0; head < q.length; head++) {
        const u = q[head]!;
        inQ[u] = false;
        for (const ei of this.adj[u]!) {
          const e = this.edges[ei]!;
          if (e.cap > 0 && dist[u]! + e.cost < dist[e.to]!) {
            dist[e.to] = dist[u]! + e.cost;
            prevEdge[e.to] = ei;
            if (!inQ[e.to]) {
              q.push(e.to);
              inQ[e.to] = true;
            }
          }
        }
      }
      if (dist[t] === Infinity) return augmentations;
      let push = Infinity;
      for (let v = t; v !== s; v = this.edges[prevEdge[v]! ^ 1]!.to) push = Math.min(push, this.edges[prevEdge[v]!]!.cap);
      for (let v = t; v !== s; v = this.edges[prevEdge[v]! ^ 1]!.to) {
        this.edges[prevEdge[v]!]!.cap -= push;
        this.edges[prevEdge[v]! ^ 1]!.cap += push;
      }
      augmentations++;
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const counts = (rule: CoverageRuleInput, m: CoverageMember) => m.teamId === rule.teamId && (!rule.tag || m.tags.includes(rule.tag));

function isLaminar(rules: readonly CoverageRuleInput[], members: readonly CoverageMember[]): boolean {
  const sets = rules.map((r) => new Set(members.filter((m) => counts(r, m)).map((m) => m.id)));
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i]!;
      const b = sets[j]!;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      if (inter > 0 && inter < a.size && inter < b.size) return false;
    }
  }
  return true;
}

/** Off for free (weekend, holiday, booked leave): the things a planned day can bridge onto. */
const freeOff = (m: PlannerMember, d: ISODate) => !isScheduled(m, d) || m.out.has(d);

function runsScore(m: PlannerMember, planned: ReadonlySet<ISODate>, lo: ISODate, hi: ISODate): number {
  let score = 0;
  let run = 0;
  let hasPlanned = false;
  for (const d of rangeISO(addDays(lo, -7), addDays(hi, 7))) {
    if (planned.has(d) || freeOff(m, d)) {
      run++;
      if (planned.has(d)) hasPlanned = true;
    } else {
      if (hasPlanned) score += run * run;
      run = 0;
      hasPlanned = false;
    }
  }
  if (hasPlanned) score += run * run;
  return score;
}

function blocksFor(m: PlannerMember, days: readonly ISODate[]): PlannedBlock[] {
  const planned = new Set(days);
  const blocks: PlannedBlock[] = [];
  const seen = new Set<ISODate>();
  for (const d of days) {
    if (seen.has(d)) continue;
    let s = d;
    while (planned.has(addDays(s, -1)) || freeOff(m, addDays(s, -1))) s = addDays(s, -1);
    let e = d;
    while (planned.has(addDays(e, 1)) || freeOff(m, addDays(e, 1))) e = addDays(e, 1);
    const span = rangeISO(s, e);
    for (const x of span) if (planned.has(x)) seen.add(x);
    blocks.push({ start: s, end: e, leaveDays: span.filter((x) => planned.has(x)).length, daysOff: span.length });
  }
  return blocks;
}

// ── planner ──────────────────────────────────────────────────────────────────

export function planTeam(input: TeamPlanInput): TeamPlanResult {
  const clock = input.clock ?? (() => Date.now());
  const t0 = clock();
  const budget = input.timeBudgetMs ?? 1_500;
  const members = [...input.members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rules = [...input.rules].sort((a, b) => (a.id < b.id ? -1 : 1));
  const needy = members.filter((m) => m.need > 0 && m.deadline >= input.start);
  const lastDay = needy.reduce((mx, m) => (m.deadline > mx ? m.deadline : mx), input.start);
  const dates = needy.length ? rangeISO(input.start, lastDay) : [];
  const exact = isLaminar(rules, members);

  // Slack per (date, rule) before the plan.
  const slack = new Map<string, number>();
  const presentBefore = new Map<string, number>();
  const applying = new Map<ISODate, CoverageRuleInput[]>();
  for (const d of dates) {
    const list: CoverageRuleInput[] = [];
    for (const r of rules) {
      if (!ruleApplies(r, d)) continue;
      const scheduled = members.filter((m) => counts(r, m) && isScheduled(m, d));
      if (scheduled.length === 0) continue; // closed that day
      const present = scheduled.filter((m) => !m.out.has(d)).length;
      slack.set(`${d}|${r.id}`, Math.max(0, present - r.minPresent));
      presentBefore.set(`${d}|${r.id}`, present);
      list.push(r);
    }
    applying.set(d, list);
  }
  /** A person's rules on a day, innermost (fewest members) first. */
  const ruleSize = new Map(rules.map((r) => [r.id, members.filter((m) => counts(r, m)).length]));
  const chainFor = (m: PlannerMember, d: ISODate) =>
    (applying.get(d) ?? []).filter((r) => counts(r, m)).sort((a, b) => ruleSize.get(a.id)! - ruleSize.get(b.id)! || (a.id < b.id ? -1 : 1));

  const eligible = (m: PlannerMember, d: ISODate) =>
    d >= input.start && d <= m.deadline && isScheduled(m, d) && !m.out.has(d) && !m.unavailable?.has(d);

  // Stage 1.
  const f = new Flow();
  const S = f.node();
  const T = f.node();
  const dayNode = new Map<ISODate, number>();
  const ruleNode = new Map<string, number>();
  for (const d of dates) {
    const dn = f.node();
    dayNode.set(d, dn);
    f.add(dn, T, Number.MAX_SAFE_INTEGER, 0);
  }
  const ruleNodeFor = (d: ISODate, r: CoverageRuleInput) => {
    const k = `${d}|${r.id}`;
    let n = ruleNode.get(k);
    if (n === undefined) {
      n = f.node();
      ruleNode.set(k, n);
    }
    return n;
  };
  // Chain edges: (d, inner rule) → (d, next rule) → … → day. Built per distinct chain.
  const chainEdges = new Set<string>();
  const entryFor = (m: PlannerMember, d: ISODate): number => {
    const chain = chainFor(m, d);
    if (chain.length === 0) return dayNode.get(d)!;
    for (let i = 0; i < chain.length; i++) {
      const from = ruleNodeFor(d, chain[i]!);
      const to = i + 1 < chain.length ? ruleNodeFor(d, chain[i + 1]!) : dayNode.get(d)!;
      const key = `${from}>${to}`;
      if (!chainEdges.has(key)) {
        chainEdges.add(key);
        f.add(from, to, slack.get(`${d}|${chain[i]!.id}`)!, 0);
      }
    }
    return ruleNodeFor(d, chain[0]!);
  };
  const memberEdges: Array<{ m: PlannerMember; d: ISODate; edge: number }> = [];
  for (const m of needy) {
    const mn = f.node();
    // One unit edge per needed day with rising cost: when days are scarce they are shared
    // out evenly instead of one person getting all of theirs (convex cost = fairness).
    for (let k = 0; k < m.need; k++) f.add(S, mn, 1, k * 15);
    for (const d of dates) {
      if (!eligible(m, d)) continue;
      const prev = addDays(d, -1);
      const next = addDays(d, 1);
      let cost = 100;
      const bridges = (freeOff(m, prev) ? 1 : 0) + (freeOff(m, next) ? 1 : 0);
      cost -= bridges === 2 ? 50 : bridges * 30;
      if (m.preferMonths?.includes(Number(d.slice(5, 7)))) cost -= 20;
      if (m.avoid?.has(d)) cost += 500;
      const tight = Math.min(...chainFor(m, d).map((r) => slack.get(`${d}|${r.id}`)!), 4);
      cost += (4 - tight) * 5;
      memberEdges.push({ m, d, edge: f.add(mn, entryFor(m, d), 1, cost) });
    }
  }
  const flowAugmentations = f.run(S, T);

  const assigned = new Map<string, Set<ISODate>>(needy.map((m) => [m.id, new Set<ISODate>()]));
  for (const { m, d, edge } of memberEdges) if (f.edges[edge]!.cap === 0) assigned.get(m.id)!.add(d);

  // Load per (date, rule) and a check that works for any rule shape.
  const load = new Map<string, number>();
  const bump = (m: PlannerMember, d: ISODate, by: number) => {
    for (const r of chainFor(m, d)) load.set(`${d}|${r.id}`, (load.get(`${d}|${r.id}`) ?? 0) + by);
  };
  const fits = (m: PlannerMember, d: ISODate) => chainFor(m, d).every((r) => (load.get(`${d}|${r.id}`) ?? 0) + 1 <= slack.get(`${d}|${r.id}`)!);
  for (const m of needy) {
    for (const d of [...assigned.get(m.id)!].sort()) {
      if (fits(m, d)) bump(m, d, 1);
      else assigned.get(m.id)!.delete(d); // only reachable with non-laminar rules
    }
  }

  // Stage 2: longer runs, same counts.
  let swaps = 0;
  let stoppedEarly = false;
  for (let pass = 0; pass < 6; pass++) {
    let improved = false;
    for (const m of needy) {
      if (clock() - t0 > budget) {
        stoppedEarly = true;
        break;
      }
      const mine = assigned.get(m.id)!;
      const options = dates.filter((d) => eligible(m, d) && !mine.has(d) && !m.avoid?.has(d));
      for (const x of [...mine].sort()) {
        let best = runsScore(m, mine, input.start, m.deadline);
        let bestDay: ISODate | null = null;
        bump(m, x, -1);
        mine.delete(x);
        for (const y of options) {
          if (mine.has(y) || !fits(m, y)) continue;
          mine.add(y);
          const s = runsScore(m, mine, input.start, m.deadline);
          mine.delete(y);
          if (s > best) {
            best = s;
            bestDay = y;
          }
        }
        const take = bestDay ?? x;
        mine.add(take);
        bump(m, take, 1);
        if (bestDay) {
          swaps++;
          improved = true;
        }
      }
    }
    if (!improved || stoppedEarly) break;
  }

  const plans: MemberPlan[] = needy.map((m) => {
    const days = [...assigned.get(m.id)!].sort();
    const unplaced = m.need - days.length;
    let shortfallReason: string | null = null;
    if (unplaced > 0) {
      const free = dates.filter((d) => eligible(m, d)).length;
      shortfallReason =
        free < m.need
          ? `Only ${free} working days are free before ${m.deadline}.`
          : `Coverage rules leave room for only ${days.length} of ${m.need} days before ${m.deadline}.`;
    }
    return { memberId: m.id, need: m.need, placed: days.length, unplaced, days, blocks: blocksFor(m, days), shortfallReason };
  });

  const plannedOn = new Map<ISODate, number>();
  for (const p of plans) for (const d of p.days) plannedOn.set(d, (plannedOn.get(d) ?? 0) + 1);
  const heatmap: HeatmapDay[] = dates
    .filter((d) => mondayIndexedDow(d) < 5 || plannedOn.has(d) || (applying.get(d)?.length ?? 0) > 0)
    .map((d) => {
      const outBooked = members.filter((m) => isScheduled(m, d) && m.out.has(d)).length;
      return {
        date: d,
        out: outBooked + (plannedOn.get(d) ?? 0),
        planned: plannedOn.get(d) ?? 0,
        rules: (applying.get(d) ?? []).map((r) => {
          const s = slack.get(`${d}|${r.id}`)!;
          const used = load.get(`${d}|${r.id}`) ?? 0;
          return { ruleId: r.id, required: r.minPresent, present: presentBefore.get(`${d}|${r.id}`)! - used, slackLeft: s - used };
        }),
      };
    });

  const totalNeed = needy.reduce((s, m) => s + m.need, 0);
  const totalPlaced = plans.reduce((s, p) => s + p.placed, 0);
  return {
    plans,
    totalNeed,
    totalPlaced,
    totalForfeited: totalNeed - totalPlaced,
    exact,
    heatmap,
    stats: { ms: clock() - t0, flowAugmentations, swaps, stoppedEarly },
  };
}
