import { createHash } from 'node:crypto';
import { and, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { suggestAlternatives, type Alternative } from '@daysoff/engine/leave/alternatives';
import { newViolationsFor } from '@daysoff/engine/leave/coverage';
import { decideRoute, possibleFmla, type ApprovalPolicy, type Decision, type DecisionFacts, type PolicyMode } from '@daysoff/engine/leave/decision';
import { daysBetween, evaluateLeaveRules, inScope, type LeaveRule } from '@daysoff/engine/leave/rules';
import { addDays, isoToSerial, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import type { Db } from '@/db/client';
import { approvalPolicies, coverageRules, leaveRequests, members, organizations, rooms, shiftTemplates } from '@/db/schema';
import { autonomyFor } from './autonomy';
import { eventsFor, groupIdsFor, loadRules, othersOut } from './automations';
import { rankForTarget } from './cover';
import { evaluateRequest, getOrg, memberHolidays, teamCoverageMembers, type Evaluation, type LeaveTypeRow, type MemberRow, type RequestInput } from './leave';
import { approvalRoute } from './routing';
import { parseWorkWeek } from './workWeek';

/*
 * The decision packet: one shape every surface shows (web, phone, Slack, Teams, REST, MCP), built
 * from the engine's evaluation, the approval policy that applies and the routing. The engine
 * decides (D1); no model is involved. The route never declines.
 */

export type ApprovalPolicyRow = typeof approvalPolicies.$inferSelect;

export interface PolicyChoice {
  policy: ApprovalPolicy;
  slaHours: number;
  escalateAfterHours: number;
  reversibleMinutes: number;
  /** `legacy`: no approval policy rows, the org's autonomy level and leave type flags apply. */
  source: 'policy' | 'legacy';
  autonomyLevel: number;
}

const MODE_STRICTNESS: Record<PolicyMode, number> = { off: 0, shadow: 1, suggest: 2, auto: 3 };

function specificity(p: ApprovalPolicyRow): number {
  return p.teamIds.length ? 4 : p.groupIds.length ? 3 : p.locationIds.length ? 2 : 1;
}

/** The most specific policy wins (team, group, location, org); ties go to the stricter one. */
export function pickPolicy(rows: ApprovalPolicyRow[], who: { locationId: string | null; teamId: string | null; groupIds: string[] }, leaveTypeKey: string): ApprovalPolicyRow | null {
  const matching = rows.filter((r) => inScope(r, who, leaveTypeKey));
  if (!matching.length) return null;
  return matching.sort(
    (a, b) =>
      specificity(b) - specificity(a) ||
      MODE_STRICTNESS[a.mode] - MODE_STRICTNESS[b.mode] ||
      (a.maxDays == null ? Infinity : Number(a.maxDays)) - (b.maxDays == null ? Infinity : Number(b.maxDays)) ||
      (a.createdAt < b.createdAt ? -1 : 1),
  )[0]!;
}

export async function approvalPolicyFor(db: Db, orgId: string, member: MemberRow, leaveType: LeaveTypeRow, groupIds?: string[]): Promise<PolicyChoice> {
  const level = await autonomyFor(db, orgId, 'decideLeaveRequest', 'assistant');
  const org = await getOrg(db, orgId);
  const rows = await db.select().from(approvalPolicies).where(eq(approvalPolicies.orgId, orgId));
  const groups = groupIds ?? (rows.some((r) => r.groupIds.length) ? await groupIdsFor(db, orgId, member.id) : []);
  const row = pickPolicy(rows, { locationId: member.locationId, teamId: member.teamId, groupIds: groups }, leaveType.key);
  if (!row) {
    // Before 0009 behaviour, unchanged: L3 acts, L1–L2 suggest, L0 is off; the type must opt in.
    const mode: PolicyMode = level >= 3 ? 'auto' : level >= 1 ? 'suggest' : 'off';
    return {
      policy: {
        id: null,
        name: 'Organization default',
        mode,
        maxDays: leaveType.maxAutoApproveDays == null ? null : Number(leaveType.maxAutoApproveDays),
        minNoticeDays: null,
        toleratedWarnings: [],
        requiresTypeOptIn: true,
        typeOptedIn: leaveType.autoApprove,
      },
      slaHours: 24,
      escalateAfterHours: 48,
      reversibleMinutes: org.autoApprovalReversibleMinutes,
      source: 'legacy',
      autonomyLevel: level,
    };
  }
  // The autonomy level is the master switch: below L3 `auto` only suggests; L0 turns it off.
  const mode: PolicyMode = level === 0 ? 'off' : row.mode === 'auto' && level < 3 ? 'suggest' : row.mode;
  return {
    policy: {
      id: row.id,
      name: row.name,
      mode,
      maxDays: row.maxDays == null ? null : Number(row.maxDays),
      minNoticeDays: row.minNoticeDays,
      toleratedWarnings: row.toleratedWarnings as ApprovalPolicy['toleratedWarnings'],
      requiresTypeOptIn: false,
      typeOptedIn: true,
    },
    slaHours: row.slaHours,
    escalateAfterHours: row.escalateAfterHours,
    reversibleMinutes: row.reversibleMinutes ?? org.autoApprovalReversibleMinutes,
    source: 'policy',
    autonomyLevel: level,
  };
}

export function factsOf(ev: Evaluation, overtimeBand: DecisionFacts['overtimeBand']): DecisionFacts {
  return {
    leaveTypeName: ev.leaveType.name,
    unit: ev.unit,
    amount: ev.cost.amount,
    workingDays: ev.cost.chargedDates.length,
    countsAgainstBalance: ev.countsAgainstBalance,
    balanceAfter: ev.balanceAfter,
    requiresApproval: ev.leaveType.requiresApproval,
    healthRelated: ev.leaveType.isHealthRelated,
    protectedCategory: ev.leaveType.protectedCategory,
    retroactive: ev.retroactive,
    findings: ev.findings,
    overtimeBand,
  };
}

export type OvertimeBand = DecisionFacts['overtimeBand'];

/**
 * Cover dry run for the days this absence leaves short: would someone cover without overtime?
 * Bands only; pay rates never leave the server. Null when nothing is short or the person has no
 * scheduled shifts to cover.
 */
export async function overtimeBandFor(db: Db, orgId: string, member: MemberRow, ev: Evaluation, now: Date): Promise<OvertimeBand> {
  const short = [...new Set([...ev.coverage.map((c) => c.date), ...ev.blockCoverage.map((g) => g.date)])].sort().slice(0, 2);
  if (!short.length) return null;
  try {
    const tpl = await db
      .select({ t: shiftTemplates, locationId: rooms.locationId })
      .from(shiftTemplates)
      .innerJoin(rooms, eq(rooms.id, shiftTemplates.roomId))
      .where(and(eq(shiftTemplates.orgId, orgId), eq(shiftTemplates.memberId, member.id)));
    let worst: OvertimeBand = null;
    const order = { no_overtime: 1, overtime: 2, no_cover: 3 } as const;
    for (const date of short) {
      const s = tpl.find((x) => x.t.weekday === mondayIndexedDow(date) && (!x.t.effectiveFrom || x.t.effectiveFrom <= date) && (!x.t.effectiveTo || x.t.effectiveTo >= date));
      if (!s) continue;
      const gap = ev.blockCoverage.find((g) => g.date === date);
      const r = await rankForTarget(
        db,
        orgId,
        { locationId: s.locationId, roomId: s.t.roomId, date, startMinute: s.t.startMinute, endMinute: s.t.endMinute, absentMemberId: member.id, gap: gap ? { kind: gap.kind, ruleId: gap.ruleId } : null },
        now,
      );
      const ok = r.ranked.filter((c) => c.eligible && c.memberId !== member.id);
      const band: NonNullable<OvertimeBand> = ok.some((c) => c.costBand === 'regular') ? 'no_overtime' : ok.length ? 'overtime' : 'no_cover';
      if (!worst || order[band] > order[worst]) worst = band;
    }
    return worst;
  } catch {
    return null; // a dry run must never break a request
  }
}

/** Median hours from submit to a person's decision for this team, last 90 days. Null = no data. */
export async function typicalDecisionHours(db: Db, orgId: string, teamId: string | null, now: Date): Promise<number | null> {
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await db
    .select({ c: leaveRequests.createdAt, d: leaveRequests.decidedAt })
    .from(leaveRequests)
    .innerJoin(members, eq(members.id, leaveRequests.memberId))
    .where(
      and(
        eq(leaveRequests.orgId, orgId),
        isNotNull(leaveRequests.decidedAt),
        eq(leaveRequests.autoApproved, false),
        isNotNull(leaveRequests.decidedByMemberId),
        gte(leaveRequests.createdAt, since),
        teamId ? eq(members.teamId, teamId) : isNull(members.teamId),
      ),
    );
  const h = rows.map((r) => (r.d!.getTime() - r.c.getTime()) / 3_600_000).filter((x) => x >= 0).sort((a, b) => a - b);
  if (h.length < 3) return null;
  const m = h.length % 2 ? h[(h.length - 1) / 2]! : (h[h.length / 2 - 1]! + h[h.length / 2]!) / 2;
  return Math.max(1, Math.round(m));
}

export interface DecisionPacket {
  evaluation: Evaluation;
  decision: Decision;
  choice: PolicyChoice;
  overtimeBand: OvertimeBand;
  noticeDays: number;
  approver: { id: string; name: string } | null;
  backup: { id: string; name: string } | null;
  typicalHours: number | null;
  alternatives: Alternative[];
  possibleFmla: boolean;
  /** A short hash of the rule set, stored with the snapshot so a later change is visible. */
  rulesHash: string;
}

export interface PacketOptions {
  excludeRequestId?: string;
  now: Date;
  withOvertime?: boolean;
  withAlternatives?: boolean;
  withRouting?: boolean;
}

export async function buildDecisionPacket(db: Db, orgId: string, member: MemberRow, input: RequestInput, today: string, opts: PacketOptions): Promise<DecisionPacket> {
  const ev = await evaluateRequest(db, orgId, member, input, today, { excludeRequestId: opts.excludeRequestId });
  const choice = await approvalPolicyFor(db, orgId, member, ev.leaveType);
  const overtimeBand = opts.withOvertime === false || ev.exempt ? null : await overtimeBandFor(db, orgId, member, ev, opts.now);
  const noticeDays = daysBetween(today, input.start);
  const decision = decideRoute(factsOf(ev, overtimeBand), choice.policy, noticeDays);
  let approver: DecisionPacket['approver'] = null;
  let backup: DecisionPacket['backup'] = null;
  let typicalHours: number | null = null;
  if (opts.withRouting !== false) {
    const route = await approvalRoute(db, orgId, member);
    approver = route.primary ? { id: route.primary.id, name: route.primary.name } : null;
    backup = route.backup ? { id: route.backup.id, name: route.backup.name } : null;
    if (decision.route === 'needs_person') typicalHours = await typicalDecisionHours(db, orgId, member.teamId, opts.now);
  }
  const wantAlternatives =
    opts.withAlternatives && !ev.exempt && input.part === 'full' && !decision.wouldAutoApprove && decision.route !== 'no_approval_needed' && ev.cost.chargedDates.length > 0;
  const alternatives = wantAlternatives ? await alternativesFor(db, orgId, member, input, ev, choice, today, opts) : [];
  const calendarDays = isoToSerial(input.end) - isoToSerial(input.start) + 1;
  return {
    evaluation: ev,
    decision,
    choice,
    overtimeBand,
    noticeDays,
    approver,
    backup,
    typicalHours,
    alternatives,
    possibleFmla: possibleFmla({ healthRelated: ev.leaveType.isHealthRelated, protectedCategory: ev.leaveType.protectedCategory, calendarDays }),
    rulesHash: await rulesHash(db, orgId),
  };
}

export async function rulesHash(db: Db, orgId: string): Promise<string> {
  const { rules } = await loadRules(db, orgId);
  const pol = await db.select().from(approvalPolicies).where(eq(approvalPolicies.orgId, orgId));
  const [org] = await db.select({ m: organizations.autoApprovalReversibleMinutes }).from(organizations).where(eq(organizations.id, orgId));
  const body = JSON.stringify({ rules: [...rules].sort((a, b) => a.id.localeCompare(b.id)), pol: pol.map((p) => [p.id, p.mode, p.maxDays, p.minNoticeDays, p.toleratedWarnings]).sort(), m: org?.m });
  return createHash('sha256').update(body).digest('hex').slice(0, 12);
}

/**
 * Better dates: the engine searches ±4 weeks with pure checks built from a handful of queries,
 * then the top three are re-checked with the full evaluation so every fact shown is exact.
 */
async function alternativesFor(
  db: Db,
  orgId: string,
  member: MemberRow,
  input: RequestInput,
  ev: Evaluation,
  choice: PolicyChoice,
  today: string,
  opts: PacketOptions,
): Promise<Alternative[]> {
  const from = addDays(input.start, -28);
  const to = addDays(input.end, 42);
  const [{ rules }, others, holidays, groups] = await Promise.all([
    loadRules(db, orgId, { start: from, end: to }),
    othersOut(db, orgId, from, to, opts.excludeRequestId),
    memberHolidays(db, orgId, member, from, to),
    groupIdsFor(db, orgId, member.id),
  ]);
  const events = await eventsFor(db, orgId, member, from, to);
  const covRules = member.teamId ? await db.select().from(coverageRules).where(and(eq(coverageRules.orgId, orgId), eq(coverageRules.teamId, member.teamId))) : [];
  const team = member.teamId && covRules.length ? await teamCoverageMembers(db, orgId, member.teamId, from, to, opts.excludeRequestId) : [];
  const mine = others.filter((o) => o.memberId === member.id);
  const subject = { memberId: member.id, startDate: member.startDate, locationId: member.locationId, teamId: member.teamId, groupIds: groups };
  const p = choice.policy;
  const check = (c: { start: string; end: string; dates: string[] }) => {
    const rr = evaluateLeaveRules(rules as LeaveRule[], { subject, leaveTypeKey: input.leaveTypeKey, start: c.start, end: c.end, chargedDates: c.dates, others, today });
    const ownOverlap = mine.some((o) => o.dates.some((d) => c.dates.includes(d)));
    const ev2 = events.filter((e) => c.dates.includes(e.date)).length;
    const cov = covRules.length
      ? newViolationsFor(
          covRules.map((r) => ({ id: r.id, teamId: r.teamId, minPresent: r.minPresent, tag: r.tag, weekdays: r.weekdays, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo })),
          team,
          member.id,
          c.dates,
        ).length
      : 0;
    const hardFails = rr.problems.length + (ownOverlap ? 1 : 0);
    const warnKinds = [...rr.warnings.map((w) => (w.kind === 'min_notice' ? 'notice' : w.kind)), ...(ev2 ? ['event'] : []), ...(cov ? ['coverage'] : [])];
    const warnings = rr.warnings.length + ev2 + cov;
    const notice = daysBetween(today, c.start);
    const sizeOk = p.maxDays == null || ev.cost.amount <= p.maxDays;
    const noticeOk = p.minNoticeDays == null || notice >= p.minNoticeDays;
    const wouldAutoApprove =
      hardFails === 0 && sizeOk && noticeOk && (!p.requiresTypeOptIn || p.typeOptedIn) && warnKinds.every((k) => k !== 'request_window' && (p.toleratedWarnings as string[]).includes(k));
    return { hardFails, warnings, wouldAutoApprove };
  };
  const ranked = suggestAlternatives({ start: input.start, end: input.end, today, workWeek: parseWorkWeek(member.workWeek), holidays: new Set(holidays.keys()), check, limit: 5 });
  const out: Alternative[] = [];
  for (const a of ranked) {
    if (out.length >= 3) break;
    const full = await evaluateRequest(db, orgId, member, { ...input, start: a.start, end: a.end, note: undefined }, today, { excludeRequestId: opts.excludeRequestId });
    if (full.problems.length) continue;
    const d = decideRoute(factsOf(full, null), choice.policy, daysBetween(today, a.start));
    out.push({ ...a, warnings: full.warnings.length, wouldAutoApprove: d.wouldAutoApprove });
  }
  return out;
}

/** The snapshot stored on the request at submit. No reason or note is ever in it. */
export function snapshotOf(p: DecisionPacket) {
  return {
    route: p.decision.route,
    wouldAutoApprove: p.decision.wouldAutoApprove,
    checklist: p.decision.checklist,
    recommendation: p.decision.recommendation,
    policyId: p.choice.policy.id,
    policyName: p.choice.policy.name,
    mode: p.choice.policy.mode,
    rulesHash: p.rulesHash,
  };
}
export type DecisionSnapshot = ReturnType<typeof snapshotOf>;

/** Members who are away (approved or recorded leave) today: skipped as approvers. */
export async function awayToday(db: Db, orgId: string, memberIds: string[], date: string): Promise<Set<string>> {
  if (!memberIds.length) return new Set();
  const rows = await db
    .select({ m: leaveRequests.memberId })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.orgId, orgId),
        inArray(leaveRequests.memberId, memberIds),
        inArray(leaveRequests.status, ['approved', 'recorded']),
        lte(leaveRequests.startDate, date),
        gte(leaveRequests.endDate, date),
      ),
    );
  return new Set(rows.map((r) => r.m));
}
