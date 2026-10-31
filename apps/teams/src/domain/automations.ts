import { and, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { blackouts, groupMembers, leaveRequests, leaveTypes, members, policyRules, teamEvents } from '@/db/schema';
import { evaluateLeaveRules, type LeaveRule, type OtherAbsence, type RuleResult } from '@daysoff/engine/leave/rules';
import { rangeISO, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import type { MemberRow } from './leave';

/*
 * Loads policy automations (blackouts, probation, "max away") as engine rules and evaluates a
 * request against them. The engine decides; this file only reads rows (D1).
 */

export async function groupIdsFor(db: Db, orgId: string, memberId: string): Promise<string[]> {
  const rows = await db.select({ g: groupMembers.groupId }).from(groupMembers).where(and(eq(groupMembers.orgId, orgId), eq(groupMembers.memberId, memberId)));
  return rows.map((r) => r.g);
}

export async function groupIdsByMember(db: Db, orgId: string): Promise<Map<string, string[]>> {
  const rows = await db.select({ g: groupMembers.groupId, m: groupMembers.memberId }).from(groupMembers).where(eq(groupMembers.orgId, orgId));
  const map = new Map<string, string[]>();
  for (const r of rows) (map.get(r.m) ?? map.set(r.m, []).get(r.m)!).push(r.g);
  return map;
}

export type BlackoutRow = typeof blackouts.$inferSelect;

export async function loadRules(db: Db, orgId: string, window?: { start: string; end: string }): Promise<{ rules: LeaveRule[]; blackoutRows: Map<string, BlackoutRow> }> {
  const bl = await db
    .select()
    .from(blackouts)
    .where(and(eq(blackouts.orgId, orgId), window ? lte(blackouts.startDate, window.end) : undefined, window ? gte(blackouts.endDate, window.start) : undefined));
  const pr = await db.select().from(policyRules).where(eq(policyRules.orgId, orgId));
  const rules: LeaveRule[] = [
    ...bl.map(
      (b): LeaveRule => ({
        id: b.id,
        name: b.reason,
        hard: b.hard,
        kind: 'blackout',
        start: b.startDate,
        end: b.endDate,
        leaveTypeKeys: b.leaveTypeKeys,
        locationIds: b.locationIds,
        teamIds: b.teamId ? [b.teamId] : [],
        groupIds: b.groupIds,
      }),
    ),
    ...pr.map((r): LeaveRule => {
      const scope = { leaveTypeKeys: r.leaveTypeKeys, locationIds: r.locationIds, teamIds: r.teamIds, groupIds: r.groupIds };
      const p = r.params as { minDays?: number; maxOut?: number };
      return r.kind === 'probation'
        ? { ...scope, id: r.id, name: r.name, hard: r.hard, kind: 'probation', minDays: p.minDays ?? 0 }
        : { ...scope, id: r.id, name: r.name, hard: r.hard, kind: 'max_out', maxOut: p.maxOut ?? 1 };
    }),
  ];
  return { rules, blackoutRows: new Map(bl.map((b) => [b.id, b])) };
}

/** Other people's approved and pending leave overlapping a window, as engine facts. */
export async function othersOut(db: Db, orgId: string, start: string, end: string, excludeRequestId?: string): Promise<OtherAbsence[]> {
  const rows = await db
    .select({ r: leaveRequests, key: leaveTypes.key, m: members })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .innerJoin(members, eq(members.id, leaveRequests.memberId))
    .where(
      and(
        eq(leaveRequests.orgId, orgId),
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.startDate, end),
        gte(leaveRequests.endDate, start),
        isNull(members.deletedAt),
        excludeRequestId ? ne(leaveRequests.id, excludeRequestId) : undefined,
      ),
    );
  const groups = await groupIdsByMember(db, orgId);
  return rows.map(({ r, key, m }) => {
    const snap = r.engineSnapshot as { chargedDates?: string[] } | null;
    // Charged dates from the submit snapshot; otherwise the working days of the range.
    const dates = snap?.chargedDates ?? rangeISO(r.startDate, r.endDate).filter((d) => m.workWeek[mondayIndexedDow(d)] === '1');
    return { memberId: m.id, leaveTypeKey: key, locationId: m.locationId, teamId: m.teamId, groupIds: groups.get(m.id) ?? [], dates };
  });
}

export interface AutomationResult extends RuleResult {
  blackouts: BlackoutRow[];
}

export async function evaluateAutomations(
  db: Db,
  orgId: string,
  member: MemberRow,
  req: { leaveTypeKey: string; start: string; end: string; chargedDates: string[] },
  opts: { excludeRequestId?: string } = {},
): Promise<AutomationResult> {
  const { rules, blackoutRows } = await loadRules(db, orgId, { start: req.start, end: req.end });
  const needsOthers = rules.some((r) => r.kind === 'max_out');
  const res = evaluateLeaveRules(rules, {
    subject: { memberId: member.id, startDate: member.startDate, locationId: member.locationId, teamId: member.teamId, groupIds: await groupIdsFor(db, orgId, member.id) },
    leaveTypeKey: req.leaveTypeKey,
    start: req.start,
    end: req.end,
    chargedDates: req.chargedDates,
    others: needsOthers ? await othersOut(db, orgId, req.start, req.end, opts.excludeRequestId) : [],
  });
  const hit = new Set([...res.problems, ...res.warnings].filter((f) => f.kind === 'blackout').map((f) => f.ruleId));
  return { ...res, blackouts: [...hit].map((id) => blackoutRows.get(id)!).filter(Boolean) };
}

/** Team events on these dates that this person is expected at. */
export async function eventsFor(db: Db, orgId: string, member: MemberRow, start: string, end: string) {
  const rows = await db.select().from(teamEvents).where(and(eq(teamEvents.orgId, orgId), gte(teamEvents.date, start), lte(teamEvents.date, end)));
  const groups = rows.some((e) => e.groupIds.length) ? await groupIdsFor(db, orgId, member.id) : [];
  return rows.filter((e) => eventIncludes(e, { locationId: member.locationId, teamId: member.teamId, groupIds: groups }));
}

export function eventIncludes(e: typeof teamEvents.$inferSelect, who: { locationId: string | null; teamId: string | null; groupIds: string[] }): boolean {
  if (e.locationId && e.locationId !== who.locationId) return false;
  const byTeam = e.teamIds.length > 0;
  const byGroup = e.groupIds.length > 0;
  if (!byTeam && !byGroup) return true;
  return (byTeam && !!who.teamId && e.teamIds.includes(who.teamId)) || (byGroup && who.groupIds.some((g) => e.groupIds.includes(g)));
}
