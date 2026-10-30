import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { members } from '@/db/schema';
import { getMember, type MemberRow } from '@/domain/leave';
import { CapabilityError } from './errors';
import type { Actor } from './types';

/** The member a "me" capability acts for: the human, or the member an agent acts for. */
export function subjectMemberId(actor: Actor): string {
  const id = actor.onBehalfOfMemberId ?? actor.memberId;
  if (!id) {
    throw new CapabilityError('forbidden', 'This action needs a member identity. Service agents must address a named member through a draft.');
  }
  return id;
}

/** The person behind a call: the human, or the member an agent acts for. Null for service agents. */
export function actingMemberId(actor: Actor): string | null {
  return actor.onBehalfOfMemberId ?? actor.memberId;
}

export async function subjectMember(db: Db, actor: Actor): Promise<MemberRow> {
  return getMember(db, actor.orgId, subjectMemberId(actor));
}

export const isAdmin = (actor: Actor) => actor.role === 'owner' || actor.role === 'admin';

/** Managers manage their direct reports and the members of their own team. */
export async function managesMember(db: Db, actor: Actor, target: MemberRow): Promise<boolean> {
  if (isAdmin(actor)) return true;
  const meId = actingMemberId(actor);
  if (actor.role !== 'manager' || !meId) return false;
  if (target.managerId === meId) return true;
  const [me] = await db
    .select({ teamId: members.teamId })
    .from(members)
    .where(and(eq(members.orgId, actor.orgId), eq(members.id, meId), isNull(members.deletedAt)));
  return !!(me?.teamId && me.teamId === target.teamId);
}

/** Wraps user-authored text so tools that return it mark it as data, not instructions (R5). */
export function untrusted(text: string | null | undefined): { untrusted_text: string } | null {
  return text == null ? null : { untrusted_text: text };
}

