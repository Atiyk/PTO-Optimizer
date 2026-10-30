import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { members } from '@/db/schema';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { decodeSession } from './session';

/** Resolve a signed session cookie to a human actor, re-reading role from the DB each time. */
export async function humanActorFromSession(db: Db, cookieValue: string | undefined): Promise<Actor | null> {
  const session = decodeSession(cookieValue);
  if (!session) return null;
  const [m] = await db
    .select({ id: members.id, orgId: members.orgId, role: members.role })
    .from(members)
    .where(and(eq(members.id, session.memberId), eq(members.orgId, session.orgId), isNull(members.deletedAt)));
  if (!m) return null;
  return {
    type: 'human',
    orgId: m.orgId,
    memberId: m.id,
    role: m.role,
    clientId: null,
    onBehalfOfMemberId: null,
    scopes: ROLE_SCOPES[m.role],
  };
}
