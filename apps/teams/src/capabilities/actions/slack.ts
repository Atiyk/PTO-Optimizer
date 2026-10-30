import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { slackInstallations, slackStatusGrants } from '@/db/schema';
import { CapabilityError } from '../errors';
import { actingMemberId } from '../helpers';
import { defineCapability } from '../types';

const slackState = z.object({
  installed: z.object({ teamName: z.string().nullable(), teamId: z.string(), installedAt: z.string() }).nullable(),
  statusUpdates: z.boolean(),
  configured: z.boolean().describe('Whether this deployment has Slack credentials at all.'),
});

async function state(db: Db, orgId: string, memberId: string) {
  const [inst] = await db.select().from(slackInstallations).where(eq(slackInstallations.orgId, orgId));
  const [grant] = await db.select({ id: slackStatusGrants.id }).from(slackStatusGrants).where(and(eq(slackStatusGrants.orgId, orgId), eq(slackStatusGrants.memberId, memberId)));
  return {
    installed: inst ? { teamName: inst.teamName, teamId: inst.teamId, installedAt: inst.createdAt.toISOString() } : null,
    statusUpdates: !!grant,
    configured: !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_SIGNING_SECRET),
  };
}

export const getSlackConnection = defineCapability({
  name: 'getSlackConnection',
  description: 'Whether the Slack app is installed for the workspace and whether the caller lets us set their Slack status while out. Reads only.',
  input: z.object({}),
  output: slackState,
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui'],
  audit: null,
  async handler({ db, actor }) {
    return state(db, actor.orgId, actingMemberId(actor)!);
  },
});

/** Disconnecting. Connecting is an OAuth redirect (/api/slack/install). */
export const manageSlack = defineCapability({
  name: 'manageSlack',
  description:
    'Disconnect Slack: admins remove the workspace app (the bot stops at once); anyone can stop us setting their ' +
    'Slack status while they are out.',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('uninstall') }),
    z.object({ op: z.literal('stopStatus') }),
  ]),
  output: slackState,
  scope: 'leave:read',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui'],
  audit: (i) => `Slack: ${i.op}`,
  async handler({ db, actor }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Only a signed-in person can change Slack settings.');
    const me = actingMemberId(actor)!;
    if (input.op === 'uninstall') {
      if (actor.role !== 'owner' && actor.role !== 'admin') throw new CapabilityError('forbidden', 'Only admins can disconnect Slack.');
      await db.delete(slackInstallations).where(eq(slackInstallations.orgId, actor.orgId));
    }
    if (input.op === 'stopStatus') await db.delete(slackStatusGrants).where(and(eq(slackStatusGrants.orgId, actor.orgId), eq(slackStatusGrants.memberId, me)));
    return state(db, actor.orgId, me);
  },
});
