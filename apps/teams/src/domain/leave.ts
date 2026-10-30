import { and, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { newViolationsFor, type CoverageMember, type CoverageViolation } from '@daysoff/engine/leave/coverage';
import { planYearContaining } from '@daysoff/engine/leave/calendar';
import type { LeavePolicy, PolicyVersion } from '@daysoff/engine/leave/policy';
import { projectBalance, type LedgerEntryInput, type Projection } from '@daysoff/engine/leave/projection';
import { requestCost, type RequestCost, type RequestPart } from '@daysoff/engine/leave/requestCost';
import type { Db } from '@/db/client';
import {
  balanceLedger,
  blackouts,
  coverageRules,
  extraClosures,
  leavePolicies,
  leaveRequests,
  leaveTypes,
  locations,
  members,
  organizations,
} from '@/db/schema';
import { CapabilityError } from '@/capabilities/errors';
import { holidayMap } from './holidays';
import { parseWorkWeek } from './workWeek';

/*
 * Domain helpers shared by capabilities. Every function takes orgId explicitly and filters
 * on it: tenant isolation is enforced here, not trusted to callers.
 */

export type MemberRow = typeof members.$inferSelect;
export type LeaveTypeRow = typeof leaveTypes.$inferSelect;
export type RequestRow = typeof leaveRequests.$inferSelect;

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function getMember(db: Db, orgId: string, memberId: string): Promise<MemberRow> {
  const [m] = await db
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.id, memberId), isNull(members.deletedAt)));
  if (!m) throw new CapabilityError('not_found', 'Member not found in this organization.');
  return m;
}

export async function getOrg(db: Db, orgId: string) {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!o) throw new CapabilityError('not_found', 'Organization not found.');
  return o;
}

export async function getLeaveTypeByKey(db: Db, orgId: string, key: string): Promise<LeaveTypeRow> {
  const [t] = await db
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.orgId, orgId), eq(leaveTypes.key, key), eq(leaveTypes.archived, false)));
  if (!t) throw new CapabilityError('not_found', `No leave type "${key}" in this organization.`);
  return t;
}

export async function getLeaveTypeById(db: Db, orgId: string, id: string): Promise<LeaveTypeRow> {
  const [t] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, orgId), eq(leaveTypes.id, id)));
  if (!t) throw new CapabilityError('not_found', 'Leave type not found.');
  return t;
}

/** Policy versions for a member and leave type: org-wide, plus team/location-specific ones. */
export async function policiesFor(db: Db, orgId: string, member: MemberRow, leaveTypeId: string): Promise<PolicyVersion[]> {
  const rows = await db
    .select()
    .from(leavePolicies)
    .where(and(eq(leavePolicies.orgId, orgId), eq(leavePolicies.leaveTypeId, leaveTypeId)));
  const specific = (a: unknown): boolean => {
    const x = a as { teamIds?: string[]; locationIds?: string[] };
    return !!(
      (x.teamIds && member.teamId && x.teamIds.includes(member.teamId)) ||
      (x.locationIds && member.locationId && x.locationIds.includes(member.locationId))
    );
  };
  // A team- or location-specific policy replaces the org-wide one for that member.
  const mine = rows.filter((r) => specific(r.appliesTo));
  const chosen = mine.length ? mine : rows.filter((r) => (r.appliesTo as { all?: boolean }).all);
  return chosen.map((r) => ({ id: r.id, effectiveFrom: r.effectiveFrom, policy: r.policy as LeavePolicy }));
}

/** Holidays + org closures for the member's location, as date → name. */
export async function memberHolidays(db: Db, orgId: string, member: MemberRow, start: string, end: string): Promise<Map<string, string>> {
  let map = new Map<string, string>();
  if (member.locationId) {
    const [loc] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.orgId, orgId), eq(locations.id, member.locationId)));
    if (loc) map = await holidayMap(loc.countryCode, loc.subdivisionCode, start, end);
  }
  const closures = await db
    .select()
    .from(extraClosures)
    .where(
      and(
        eq(extraClosures.orgId, orgId),
        gte(extraClosures.date, start),
        lte(extraClosures.date, end),
        member.locationId ? or(isNull(extraClosures.locationId), eq(extraClosures.locationId, member.locationId)) : isNull(extraClosures.locationId),
      ),
    );
  for (const c of closures) if (!map.has(c.date)) map.set(c.date, c.name);
  return map;
}

export async function ledgerFor(db: Db, orgId: string, memberId: string, leaveTypeId: string): Promise<LedgerEntryInput[]> {
  const rows = await db
    .select()
    .from(balanceLedger)
    .where(and(eq(balanceLedger.orgId, orgId), eq(balanceLedger.memberId, memberId), eq(balanceLedger.leaveTypeId, leaveTypeId)));
  return rows.map((r) => ({ id: r.id, kind: r.kind, amount: r.amount, effectiveDate: r.effectiveDate, eventKey: r.eventKey, reason: r.reason }));
}

/** Pending requests not yet in the ledger count as booked for projections. */
async function pendingUsage(db: Db, orgId: string, memberId: string, leaveTypeId: string, excludeId?: string): Promise<LedgerEntryInput[]> {
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.orgId, orgId),
        eq(leaveRequests.memberId, memberId),
        eq(leaveRequests.leaveTypeId, leaveTypeId),
        eq(leaveRequests.status, 'pending'),
        excludeId ? ne(leaveRequests.id, excludeId) : undefined,
      ),
    );
  return rows.map((r) => ({
    id: `pending:${r.id}`,
    kind: 'usage' as const,
    amount: -((r.engineSnapshot as { amount?: number } | null)?.amount ?? 0),
    effectiveDate: r.startDate,
    reason: 'pending request',
  }));
}

export interface BalanceView {
  projection: Projection;
  leaveType: LeaveTypeRow;
  hasPolicy: boolean;
}

export async function balanceView(
  db: Db,
  orgId: string,
  member: MemberRow,
  leaveType: LeaveTypeRow,
  asOf: string,
  extraUsage: LedgerEntryInput[] = [],
  opts: { includePending?: boolean; excludeRequestId?: string } = {},
): Promise<BalanceView> {
  const policies = await policiesFor(db, orgId, member, leaveType.id);
  const hasPolicy = policies.length > 0;
  const fallback: PolicyVersion[] = [
    { effectiveFrom: '1970-01-01', policy: { unit: 'days', accrual: { method: 'unlimited' }, planYear: { type: 'calendar' }, carryover: { type: 'none' } } },
  ];
  const pol = (hasPolicy ? policies : fallback)[0]!.policy;
  const year = planYearContaining(pol.planYear, member.startDate, asOf);
  const holidays = pol.accrual.method === 'per_hour_worked' ? await memberHolidays(db, orgId, member, year.start, year.end) : undefined;
  const ledger = [
    ...(await ledgerFor(db, orgId, member.id, leaveType.id)),
    ...(opts.includePending ? await pendingUsage(db, orgId, member.id, leaveType.id, opts.excludeRequestId) : []),
    ...extraUsage,
  ];
  const projection = projectBalance({
    policies: hasPolicy ? policies : fallback,
    member: { startDate: member.startDate, workWeek: parseWorkWeek(member.workWeek), hoursPerDay: Number(member.hoursPerDay), holidays },
    ledger,
    asOf,
  });
  return { projection, leaveType, hasPolicy };
}

/**
 * Leave a person would lose: the next scheduled forfeiture within a year (carried days that
 * expire) or, failing that, what the year-end rollover would forfeit. Amount in days.
 */
export async function forfeitureRisk(
  db: Db,
  orgId: string,
  member: MemberRow,
  leaveType: LeaveTypeRow,
  today: string,
): Promise<{ amount: number; deadline: string } | null> {
  if (!leaveType.countsAgainstBalance) return null;
  const { projection: p } = await balanceView(db, orgId, member, leaveType, today, [], { includePending: true });
  if (p.unlimited) return null;
  const horizon = addDays(today, 366);
  const f = p.timeline.find((t) => t.kind === 'forfeiture' && t.source === 'scheduled' && t.date > today && t.date <= horizon && t.amount < 0);
  const at = f
    ? { amount: -f.amount, deadline: addDays(f.date, -1) }
    : p.yearEnd && p.yearEnd.wouldForfeit > 0
      ? { amount: p.yearEnd.wouldForfeit, deadline: p.yearEnd.yearEnd }
      : null;
  if (!at) return null;
  const perDay = p.unit === 'hours' ? Number(member.hoursPerDay) : 1;
  return { amount: Math.round((at.amount / perDay) * 100) / 100, deadline: at.deadline };
}

/** Minimum running balance over [from, to], starting from the balance at `from`. */
export function lowestBalance(p: Projection, from: string, to: string): number {
  let low = p.asOf.balance;
  for (const t of p.timeline) {
    if (t.date < from) continue;
    if (t.date > to) break;
    low = Math.min(low, t.balanceAfter);
  }
  return low;
}

/** Usage booked after `today` within the plan year (approved in the ledger, plus pending). */
export function bookedAhead(p: Projection, today: string): number {
  const end = p.yearEnd?.yearEnd ?? today;
  let sum = 0;
  for (const t of p.timeline) if (t.kind === 'usage' && t.date > today && t.date <= end) sum += t.amount;
  return Math.round(-sum * 10_000) / 10_000 || 0;
}

// ── Request evaluation: one function for live validation, submit and auto-approval ──

export interface RequestInput {
  leaveTypeKey: string;
  start: string;
  end: string;
  part: RequestPart;
  hours?: number;
  note?: string | null;
}

export interface Evaluation {
  leaveType: LeaveTypeRow;
  cost: RequestCost;
  countsAgainstBalance: boolean;
  balanceBefore: number | null;
  balanceAfter: number | null;
  unit: 'days' | 'hours';
  yearEndAfter: { yearEnd: string; balance: number; wouldForfeit: number } | null;
  blackouts: { start: string; end: string; reason: string; hard: boolean }[];
  coverage: CoverageViolation[];
  overlaps: { id: string; start: string; end: string; status: string }[];
  retroactive: boolean;
  /** Blocking problems; empty = can be submitted. */
  problems: string[];
  /** Non-blocking things the approver should see. */
  warnings: string[];
}

const RETRO_LIMIT_DAYS = 30;

export async function evaluateRequest(
  db: Db,
  orgId: string,
  member: MemberRow,
  input: RequestInput,
  today: string,
  opts: { excludeRequestId?: string } = {},
): Promise<Evaluation> {
  const org = await getOrg(db, orgId);
  const leaveType = await getLeaveTypeByKey(db, orgId, input.leaveTypeKey);
  const problems: string[] = [];
  const warnings: string[] = [];

  if (input.note && leaveType.isHealthRelated && !org.sickNotesEnabled) {
    problems.push(`Notes are not stored for ${leaveType.name.toLowerCase()} requests. Remove the note.`);
  }

  const holidays = await memberHolidays(db, orgId, member, input.start, input.end);
  const cost = requestCost(
    { start: input.start, end: input.end, part: input.part, hours: input.hours },
    { workWeek: parseWorkWeek(member.workWeek), hoursPerDay: Number(member.hoursPerDay), holidays },
    'days',
  );
  problems.push(...cost.problems);

  const retroactive = input.start < today;
  if (retroactive && input.start < addDays(today, -RETRO_LIMIT_DAYS)) {
    problems.push(`Requests can start at most ${RETRO_LIMIT_DAYS} days in the past. Ask an admin for an adjustment instead.`);
  } else if (retroactive) {
    warnings.push('Starts in the past: needs manager approval.');
  }
  if (cost.problems.length === 0 && cost.chargedDates.length === 0) {
    problems.push('Those dates contain no working days, so there is nothing to request.');
  }

  // Balance (unit from the policy; cost recomputed in that unit).
  let balanceBefore: number | null = null;
  let balanceAfter: number | null = null;
  let yearEndAfter: Evaluation['yearEndAfter'] = null;
  let unit: 'days' | 'hours' = 'days';
  let finalCost = cost;
  if (leaveType.countsAgainstBalance && problems.length === 0) {
    const before = await balanceView(db, orgId, member, leaveType, input.start, [], { includePending: true, excludeRequestId: opts.excludeRequestId });
    unit = before.projection.unit;
    if (unit === 'hours') {
      finalCost = requestCost(
        { start: input.start, end: input.end, part: input.part, hours: input.hours },
        { workWeek: parseWorkWeek(member.workWeek), hoursPerDay: Number(member.hoursPerDay), holidays },
        'hours',
      );
    }
    if (!before.projection.unlimited) {
      const after = await balanceView(
        db,
        orgId,
        member,
        leaveType,
        input.start,
        [{ id: 'this-request', kind: 'usage', amount: -finalCost.amount, effectiveDate: input.start }],
        { includePending: true, excludeRequestId: opts.excludeRequestId },
      );
      // The lowest the balance gets from the request's start to the plan-year end, so leave
      // already booked later in the year is respected (D1: engine numbers only).
      const yearEnd = after.projection.yearEnd?.yearEnd ?? input.end;
      balanceBefore = lowestBalance(before.projection, input.start, yearEnd);
      balanceAfter = lowestBalance(after.projection, input.start, yearEnd);
      const usable = before.projection.asOf;
      if (usable.lockedUntil) problems.push(`Leave can be used from ${usable.lockedUntil} (waiting period).`);
      const floor = -after.projection.negativeAllowance;
      if (balanceAfter < floor) {
        problems.push(
          `Not enough balance: this needs ${finalCost.amount} ${unit} and leaves ${balanceAfter}` +
            (floor < 0 ? `, below the allowed ${floor}.` : '.'),
        );
      }
      if (after.projection.yearEnd) {
        yearEndAfter = {
          yearEnd: after.projection.yearEnd.yearEnd,
          balance: after.projection.yearEnd.balance,
          wouldForfeit: after.projection.yearEnd.wouldForfeit,
        };
      }
    }
  }

  // Blackouts for the org or the member's team.
  const bl = await db
    .select()
    .from(blackouts)
    .where(
      and(
        eq(blackouts.orgId, orgId),
        lte(blackouts.startDate, input.end),
        gte(blackouts.endDate, input.start),
        member.teamId ? or(isNull(blackouts.teamId), eq(blackouts.teamId, member.teamId)) : isNull(blackouts.teamId),
      ),
    );
  for (const b of bl) {
    if (b.hard) problems.push(`Blackout ${b.startDate} to ${b.endDate}: ${b.reason}.`);
    else warnings.push(`Overlaps a soft blackout (${b.reason}).`);
  }

  // Own overlapping requests.
  const overlapsRows = await db
    .select({ id: leaveRequests.id, start: leaveRequests.startDate, end: leaveRequests.endDate, status: leaveRequests.status })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.orgId, orgId),
        eq(leaveRequests.memberId, member.id),
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.startDate, input.end),
        gte(leaveRequests.endDate, input.start),
        opts.excludeRequestId ? ne(leaveRequests.id, opts.excludeRequestId) : undefined,
      ),
    );
  if (overlapsRows.length) problems.push(`Overlaps your ${overlapsRows[0]!.status} request ${overlapsRows[0]!.start} to ${overlapsRows[0]!.end}.`);

  const coverage = await coverageImpact(db, orgId, member, finalCost.chargedDates, opts.excludeRequestId);
  for (const v of coverage) warnings.push(`On ${v.date} the team would have ${v.present} of the ${v.required} needed${v.tag ? ` (${v.tag})` : ''}.`);

  return {
    leaveType,
    cost: finalCost,
    countsAgainstBalance: leaveType.countsAgainstBalance,
    balanceBefore,
    balanceAfter,
    unit,
    yearEndAfter,
    blackouts: bl.map((b) => ({ start: b.startDate, end: b.endDate, reason: b.reason, hard: b.hard })),
    coverage,
    overlaps: overlapsRows,
    retroactive,
    problems,
    warnings,
  };
}

/** Coverage members for a team over a window, with their pending/approved leave as "out". */
export async function teamCoverageMembers(
  db: Db,
  orgId: string,
  teamId: string,
  start: string,
  end: string,
  excludeRequestId?: string,
): Promise<CoverageMember[]> {
  const team = await db
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.teamId, teamId), isNull(members.deletedAt)));
  if (team.length === 0) return [];
  const reqs = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.orgId, orgId),
        inArray(
          leaveRequests.memberId,
          team.map((m) => m.id),
        ),
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.startDate, end),
        gte(leaveRequests.endDate, start),
        excludeRequestId ? ne(leaveRequests.id, excludeRequestId) : undefined,
      ),
    );
  const out = new Map<string, Set<string>>();
  for (const r of reqs) {
    const dates = (r.engineSnapshot as { chargedDates?: string[] } | null)?.chargedDates ?? [];
    const set = out.get(r.memberId) ?? new Set<string>();
    for (const d of dates) set.add(d);
    out.set(r.memberId, set);
  }
  const result: CoverageMember[] = [];
  for (const m of team) {
    const hol = await memberHolidays(db, orgId, m, start, end);
    result.push({
      id: m.id,
      teamId: m.teamId,
      tags: m.tags,
      workWeek: parseWorkWeek(m.workWeek),
      holidays: new Set(hol.keys()),
      out: out.get(m.id) ?? new Set(),
    });
  }
  return result;
}

export async function coverageImpact(
  db: Db,
  orgId: string,
  member: MemberRow,
  dates: readonly string[],
  excludeRequestId?: string,
): Promise<CoverageViolation[]> {
  if (!member.teamId || dates.length === 0) return [];
  const rules = await db
    .select()
    .from(coverageRules)
    .where(and(eq(coverageRules.orgId, orgId), eq(coverageRules.teamId, member.teamId)));
  if (rules.length === 0) return [];
  const sorted = [...dates].sort();
  const team = await teamCoverageMembers(db, orgId, member.teamId, sorted[0]!, sorted.at(-1)!, excludeRequestId);
  return newViolationsFor(
    rules.map((r) => ({ id: r.id, teamId: r.teamId, minPresent: r.minPresent, tag: r.tag, weekdays: r.weekdays, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo })),
    team,
    member.id,
    dates,
  );
}
