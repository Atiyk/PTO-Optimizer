import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { members, slackInstallations } from '@/db/schema';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { openSecret } from '@/lib/secretBox';
import { slackApi } from './api';

export type Installation = typeof slackInstallations.$inferSelect & { token: string };

export async function installationForTeam(db: Db, teamId: string): Promise<Installation | null> {
  const [row] = await db.select().from(slackInstallations).where(eq(slackInstallations.teamId, teamId));
  return row ? { ...row, token: openSecret(row.botToken) } : null;
}

export async function installationForOrg(db: Db, orgId: string): Promise<Installation | null> {
  const [row] = await db.select().from(slackInstallations).where(eq(slackInstallations.orgId, orgId));
  return row ? { ...row, token: openSecret(row.botToken) } : null;
}

/**
 * The person behind a Slack user in an installed workspace. Slack has verified who they are
 * (signed request), so they act as a human, with `clientId: 'slack'` on the audit row.
 * Linking: by the Slack user id saved at "Sign in with Slack", else by matching work email
 * (users.info), which is then saved.
 */
export async function slackActor(db: Db, inst: Installation, slackUserId: string): Promise<Actor | null> {
  let [m] = await db
    .select()
    .from(members)
    .where(and(eq(members.orgId, inst.orgId), eq(members.slackUserId, slackUserId), isNull(members.deletedAt)));
  if (!m) {
    try {
      const info = await slackApi<{ user?: { profile?: { email?: string } } }>('users.info', inst.token, { user: slackUserId });
      const email = info.user?.profile?.email?.toLowerCase();
      if (email) {
        const [byEmail] = await db
          .select()
          .from(members)
          .where(and(eq(members.orgId, inst.orgId), eq(sql`lower(${members.email})`, email), isNull(members.slackUserId), isNull(members.deletedAt)));
        if (byEmail) {
          await db.update(members).set({ slackUserId }).where(eq(members.id, byEmail.id));
          m = { ...byEmail, slackUserId };
        }
      }
    } catch {
      // Unknown user or missing users:read.email: treat as unlinked.
    }
  }
  if (!m) return null;
  return { type: 'human', orgId: m.orgId, memberId: m.id, role: m.role, clientId: 'slack', onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m.role] };
}
