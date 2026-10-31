import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { members, teams } from '@/db/schema';
import type { MemberRow } from './leave';

/**
 * Approval routing. Who decides a person's requests, in order:
 *   1. their team's approver, 2. the team's backup approver, 3. their manager, 4. the org's admins.
 * Everyone listed can decide in the web, on the phone, in Slack and in Teams. Notifications go to
 * the first in the list, plus the backup when the team has one. Nobody approves their own leave.
 */
export interface Route {
  primary: MemberRow | null;
  backup: MemberRow | null;
  /** Every member who may decide, in routing order (deduplicated, never the requester). */
  deciders: MemberRow[];
  basis: 'team_approver' | 'manager' | 'admins' | 'none';
}

const DECIDER_ROLES = ['owner', 'admin', 'manager'] as const;

export async function approvalRoute(db: Db, orgId: string, person: MemberRow): Promise<Route> {
  const live = async (id: string | null) => {
    if (!id || id === person.id) return null;
    const [m] = await db
      .select()
      .from(members)
      .where(and(eq(members.orgId, orgId), eq(members.id, id), isNull(members.deletedAt), inArray(members.role, [...DECIDER_ROLES])));
    return m ?? null;
  };
  let approver: MemberRow | null = null;
  let backup: MemberRow | null = null;
  if (person.teamId) {
    const [t] = await db.select().from(teams).where(and(eq(teams.orgId, orgId), eq(teams.id, person.teamId)));
    approver = await live(t?.approverMemberId ?? null);
    backup = await live(t?.backupApproverMemberId ?? null);
  }
  const manager = await live(person.managerId);
  const admins = (
    await db.select().from(members).where(and(eq(members.orgId, orgId), isNull(members.deletedAt), inArray(members.role, ['owner', 'admin'])))
  ).filter((m) => m.id !== person.id);

  const ordered = [approver, backup, manager, ...admins].filter((m): m is MemberRow => !!m);
  const deciders = ordered.filter((m, i) => ordered.findIndex((x) => x.id === m.id) === i);
  const primary = approver ?? backup ?? manager ?? admins[0] ?? null;
  return {
    primary,
    backup: approver && backup && backup.id !== approver.id ? backup : null,
    deciders,
    basis: approver || backup ? 'team_approver' : manager ? 'manager' : admins.length ? 'admins' : 'none',
  };
}

/** True when `deciderId` is the approver or backup approver of `teamId`. */
export async function isTeamApprover(db: Db, orgId: string, deciderId: string, teamId: string | null): Promise<boolean> {
  if (!teamId) return false;
  const [t] = await db.select().from(teams).where(and(eq(teams.orgId, orgId), eq(teams.id, teamId)));
  return !!t && (t.approverMemberId === deciderId || t.backupApproverMemberId === deciderId);
}
