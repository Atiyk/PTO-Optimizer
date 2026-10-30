import { mondayIndexedDow } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';
import { blockInterval, blocksForDay, covers, overlaps, type Block, type Interval } from './timeBlocks';
import { rulesOf, type MixedAgeMethod, type Provenance, type RulePack, type RuleOf } from './types';

/*
 * The required-staff computation (COVERAGE-SPEC §3), for one site and one local day:
 *   required = max(ratio requirement, role requirements);  present = scheduled − on leave −
 *   ineligible;  gap = the largest shortfall. Demand is COUNTS per group only (no child data).
 */

export interface DemandTemplateRow {
  roomId: string;
  /** Monday = 0. */
  weekday: number;
  startMinute: number;
  endMinute: number;
  group: string;
  count: number;
}

export interface DemandException {
  roomId: string;
  date: ISODate;
  /** Closed for the whole day: zero demand in every block. */
  closed?: boolean;
  startMinute?: number;
  endMinute?: number;
  group?: string;
  count?: number;
}

export interface MemberCredentialFact {
  key: string;
  issuedOn?: ISODate | null;
  expiresOn?: ISODate | null;
}

export interface ShiftInstance {
  memberId: string;
  roomId: string;
  interval: Interval;
}

export interface Absence {
  memberId: string;
  interval: Interval;
  status: 'approved' | 'pending';
}

export interface CoverageDayInput {
  /** Rules from every pack linked to the site (childcare + labour), merged. */
  pack: Pick<RulePack, 'ageGroups' | 'rules'>;
  date: ISODate;
  timezone: string;
  blockMinutes?: number;
  rooms: readonly { id: string; name: string }[];
  demand: readonly DemandTemplateRow[];
  exceptions?: readonly DemandException[];
  shifts: readonly ShiftInstance[];
  absences: readonly Absence[];
  credentials: ReadonlyMap<string, readonly MemberCredentialFact[]>;
  /** Count pending leave as out ("likely" view). Default: approved only. */
  includePending?: boolean;
}

export interface Shortfall {
  ruleId: string;
  kind: 'ratio' | 'role_present' | 'group_size' | 'no_ratio_rule';
  label: string;
  required: number;
  present: number;
  provenance: Provenance;
}

export interface RoomBlock {
  roomId: string;
  block: Block;
  counts: Record<string, number>;
  children: number;
  governing: string | null;
  ratioRequired: number;
  required: number;
  /** Staff counted in ratio. */
  present: number;
  presentIds: string[];
  /** Scheduled here but not counted, and why. */
  notCounted: { memberId: string; reason: 'on_leave' | 'credential' }[];
  gap: number;
  shortfalls: Shortfall[];
}

export interface SiteBlock {
  block: Block;
  gap: number;
  shortfalls: Shortfall[];
}

export interface CoverageDay {
  date: ISODate;
  blocks: Block[];
  rooms: RoomBlock[];
  site: SiteBlock[];
}

/** A credential counts on `date` if issued on or before it and expiring after it. */
export function credentialValid(c: MemberCredentialFact, date: ISODate): boolean {
  if (c.issuedOn && c.issuedOn > date) return false;
  if (c.expiresOn && c.expiresOn <= date) return false;
  return true;
}

export function holdsValid(creds: readonly MemberCredentialFact[] | undefined, key: string, date: ISODate): boolean {
  return !!creds?.some((c) => c.key === key && credentialValid(c, date));
}

/** Demand counts for one room and block: template rows, then the date's exceptions. */
export function demandFor(
  roomId: string,
  block: Block,
  demand: readonly DemandTemplateRow[],
  exceptions: readonly DemandException[] = [],
): Record<string, number> {
  const counts: Record<string, number> = {};
  const dow = mondayIndexedDow(block.date);
  const m = block.startMinute;
  for (const r of demand) {
    if (r.roomId === roomId && r.weekday === dow && r.startMinute <= m && m < r.endMinute) {
      counts[r.group] = (counts[r.group] ?? 0) + r.count;
    }
  }
  for (const e of exceptions) {
    if (e.roomId !== roomId || e.date !== block.date) continue;
    if (e.closed) return {};
  }
  for (const e of exceptions) {
    if (e.roomId !== roomId || e.date !== block.date || e.closed || !e.group) continue;
    if ((e.startMinute ?? 0) <= m && m < (e.endMinute ?? 1440)) counts[e.group] = e.count ?? 0;
  }
  for (const k of Object.keys(counts)) if (!counts[k]) delete counts[k];
  return counts;
}

export interface RatioResult {
  children: number;
  governing: string | null;
  ratioRequired: number;
  /** The ratio rules that set the requirement (one, or several for `proportional`). */
  rules: RuleOf<'ratio'>[];
  groupSizeViolations: { rule: RuleOf<'ratio'>; children: number }[];
  unratedGroups: string[];
}

/** Ratio requirement for one block's counts under a pack. */
export function ratioRequirement(pack: Pick<RulePack, 'ageGroups' | 'rules'>, counts: Readonly<Record<string, number>>): RatioResult {
  const order = pack.ageGroups.map((g) => g.key);
  const ratios = new Map(rulesOf(pack, 'ratio').map((r) => [r.ageGroup, r]));
  const method: MixedAgeMethod = rulesOf(pack, 'mixed_age')[0]?.method ?? 'youngest';
  const present = order.filter((g) => (counts[g] ?? 0) > 0);
  const extra = Object.keys(counts).filter((g) => counts[g]! > 0 && !order.includes(g));
  const unrated = [...present, ...extra].filter((g) => !ratios.has(g));
  const rated = present.filter((g) => ratios.has(g));
  const children = [...present, ...extra].reduce((s, g) => s + counts[g]!, 0);
  const res: RatioResult = { children, governing: null, ratioRequired: 0, rules: [], groupSizeViolations: [], unratedGroups: unrated };
  if (rated.length === 0) return res;

  if (method === 'proportional' && rated.length > 1) {
    let sum = 0;
    for (const g of rated) {
      const r = ratios.get(g)!;
      sum += counts[g]! / r.childrenPerStaff;
      res.rules.push(r);
      if (r.maxGroupSize != null && counts[g]! > r.maxGroupSize) res.groupSizeViolations.push({ rule: r, children: counts[g]! });
    }
    res.ratioRequired = Math.ceil(sum - 1e-9);
    return res;
  }

  let governing: string;
  if (rated.length === 1 || method === 'youngest' || method === 'proportional') {
    governing = rated[0]!;
  } else if (method === 'majority') {
    governing = rated.reduce((best, g) => (counts[g]! > counts[best]! ? g : best), rated[0]!);
  } else {
    // core_child (26 TAC § 746.1603): the child at position ceil(N/2), youngest first.
    const n = rated.reduce((s, g) => s + counts[g]!, 0);
    const core = Math.ceil(n / 2);
    let cum = 0;
    governing = rated[rated.length - 1]!;
    for (const g of rated) {
      cum += counts[g]!;
      if (cum >= core) {
        governing = g;
        break;
      }
    }
  }
  const rule = ratios.get(governing)!;
  res.governing = governing;
  res.rules.push(rule);
  res.ratioRequired = Math.ceil(children / rule.childrenPerStaff - 1e-9);
  if (rule.maxGroupSize != null && children > rule.maxGroupSize) res.groupSizeViolations.push({ rule, children });
  return res;
}

/** Coverage for every room and block of one local day at one site. */
export function coverageForDay(input: CoverageDayInput): CoverageDay {
  const { pack, date, timezone } = input;
  const blocks = blocksForDay(date, timezone, input.blockMinutes);
  const countsCred = rulesOf(pack, 'ratio_counts_credential')[0];
  const roleRules = rulesOf(pack, 'role_present');
  const out: CoverageDay = { date, blocks, rooms: [], site: [] };
  const absentIn = (memberId: string, iv: Interval) =>
    input.absences.some((a) => a.memberId === memberId && (a.status === 'approved' || input.includePending) && overlaps(a.interval, iv));

  for (const block of blocks) {
    const iv = blockInterval(block);
    const siteCounted: { memberId: string; roomId: string }[] = [];
    let siteHasDemand = false;
    const siteOpen = new Set<string>();

    for (const room of input.rooms) {
      const counts = demandFor(room.id, block, input.demand, input.exceptions);
      const rr = ratioRequirement(pack, counts);
      if (rr.children > 0) siteHasDemand = true;
      const scheduled = [...new Set(input.shifts.filter((s) => s.roomId === room.id && covers(s.interval, iv)).map((s) => s.memberId))].sort();
      if (scheduled.length || rr.children) siteOpen.add(room.id);
      const presentIds: string[] = [];
      const notCounted: RoomBlock['notCounted'] = [];
      for (const id of scheduled) {
        if (absentIn(id, iv)) notCounted.push({ memberId: id, reason: 'on_leave' });
        else if (countsCred && !countsCred.anyOf.some((k) => holdsValid(input.credentials.get(id), k, date))) notCounted.push({ memberId: id, reason: 'credential' });
        else presentIds.push(id);
      }
      // Role rules check everyone actually here (not on leave), even if they don't count in ratio.
      const here = scheduled.filter((id) => !absentIn(id, iv));
      for (const id of here) siteCounted.push({ memberId: id, roomId: room.id });

      const shortfalls: Shortfall[] = [];
      const ratioRule = rr.rules[0];
      if (rr.ratioRequired > presentIds.length && ratioRule) {
        shortfalls.push({
          ruleId: rr.rules.map((r) => r.id).join('+'),
          kind: 'ratio',
          label: rr.rules.map((r) => r.label).join('; '),
          required: rr.ratioRequired,
          present: presentIds.length,
          provenance: ratioRule,
        });
      }
      for (const v of rr.groupSizeViolations) {
        shortfalls.push({ ruleId: v.rule.id, kind: 'group_size', label: v.rule.label, required: v.rule.maxGroupSize!, present: v.children, provenance: v.rule });
      }
      for (const g of rr.unratedGroups) {
        shortfalls.push({
          ruleId: `unrated:${g}`,
          kind: 'no_ratio_rule',
          label: `No ratio rule for "${g}" in this pack`,
          required: 0,
          present: counts[g] ?? 0,
          provenance: { basis: 'law', needsVerification: true, reason: `The pack has no ratio for group "${g}".` },
        });
      }
      let roleRequired = 0;
      for (const r of roleRules.filter((r) => r.scope === 'room')) {
        const active = r.when === 'children_present' ? rr.children > 0 : scheduled.length > 0 || rr.children > 0;
        if (!active) continue;
        roleRequired = Math.max(roleRequired, r.min);
        const have = here.filter((id) => holdsValid(input.credentials.get(id), r.credential, date)).length;
        if (have < r.min) shortfalls.push({ ruleId: r.id, kind: 'role_present', label: r.label, required: r.min, present: have, provenance: r });
      }
      const gap = Math.max(0, ...shortfalls.filter((s) => s.kind === 'ratio' || s.kind === 'role_present').map((s) => s.required - s.present));
      out.rooms.push({
        roomId: room.id,
        block,
        counts,
        children: rr.children,
        governing: rr.governing,
        ratioRequired: rr.ratioRequired,
        required: Math.max(rr.ratioRequired, roleRequired),
        present: presentIds.length,
        presentIds,
        notCounted,
        gap,
        shortfalls,
      });
    }

    const siteShort: Shortfall[] = [];
    for (const r of roleRules.filter((r) => r.scope === 'site')) {
      const active = r.when === 'children_present' ? siteHasDemand : siteOpen.size > 0;
      if (!active) continue;
      const have = new Set(siteCounted.filter((s) => holdsValid(input.credentials.get(s.memberId), r.credential, date)).map((s) => s.memberId)).size;
      if (have < r.min) siteShort.push({ ruleId: r.id, kind: 'role_present', label: r.label, required: r.min, present: have, provenance: r });
    }
    out.site.push({ block, gap: Math.max(0, ...siteShort.map((s) => s.required - s.present)), shortfalls: siteShort });
  }
  return out;
}

/** Merge several packs (e.g. a childcare pack and a labour pack) into one rule set. */
export function mergePacks(packs: readonly Pick<RulePack, 'ageGroups' | 'rules'>[]): Pick<RulePack, 'ageGroups' | 'rules'> {
  const groups = new Map<string, RulePack['ageGroups'][number]>();
  for (const p of packs) for (const g of p.ageGroups) if (!groups.has(g.key)) groups.set(g.key, g);
  return {
    ageGroups: [...groups.values()].sort((a, b) => a.fromMonths - b.fromMonths),
    rules: packs.flatMap((p) => p.rules),
  };
}
