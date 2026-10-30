import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/db/client';
import { drafts, leaveRequests, members, teams } from '@/db/schema';
import { autonomyFor } from '@/domain/autonomy';
import { CapabilityError } from '@/capabilities/errors';
import { authorize, describeZodError, getCapability, invokeCapability, writeAudit, type CapabilityName } from '@/capabilities/registry';
import type { Actor, CapabilityContext, Surface } from '@/capabilities/types';
import { appUrl } from '@/lib/appUrl';
import { hashToken, newToken } from '@/lib/tokens';
import { consumeRate } from './rateLimit';

/*
 * The one entry point for agents (REST with a token, MCP). Adds what is agent-specific on top
 * of the registry pipeline: per-token rate limits and R2 draft → confirm. Permissions,
 * visibility and audit stay in invokeCapability, identical to humans (R4).
 */

export type AgentCallResult =
  | { status: 'done'; result: unknown }
  | {
      status: 'confirmation_required';
      draftId: string;
      summary: string;
      /** Only for agents acting for a signed-in person: pass it to confirmAgentDraft after they agree. */
      confirmationToken: string | null;
      confirmUrl: string;
      expiresAt: string;
    };

const DRAFT_TTL_MS = 7 * 86_400_000;

/** Plain-language one-liners for drafts, written from the validated input only. */
function describe(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'submitLeaveRequest':
      return `Request ${input.leaveType ?? 'vacation'} from ${input.start} to ${input.end}${input.part && input.part !== 'full' ? ` (${input.part})` : ''}`;
    case 'cancelLeaveRequest':
      return `Cancel leave request ${input.requestId}`;
    case 'decideLeaveRequest':
      return `${input.decision === 'approve' ? 'Approve' : 'Decline'} leave request ${input.requestId}`;
    case 'respondToProposal':
      return `${input.response === 'accept' ? 'Accept' : 'Dismiss'} a suggested leave plan`;
    case 'sendPlanProposals':
      return `Send leave suggestions to ${(input.proposals as unknown[] | undefined)?.length ?? 0} people`;
    default:
      return `Run ${name}`;
  }
}

/**
 * A draft must never point at another org's objects: check every id in the input before
 * storing anything, so a cross-tenant call fails now rather than at confirmation time.
 */
async function checkTargets(db: Db, orgId: string, input: Record<string, unknown>) {
  const missing = () => new CapabilityError('not_found', 'Not found.');
  if (typeof input.requestId === 'string') {
    const [r] = await db.select({ id: leaveRequests.id }).from(leaveRequests).where(and(eq(leaveRequests.orgId, orgId), eq(leaveRequests.id, input.requestId)));
    if (!r) throw missing();
  }
  if (typeof input.proposalId === 'string') {
    const [d] = await db.select({ id: drafts.id }).from(drafts).where(and(eq(drafts.orgId, orgId), eq(drafts.id, input.proposalId)));
    if (!d) throw missing();
  }
  if (typeof input.teamId === 'string') {
    const [t] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.orgId, orgId), eq(teams.id, input.teamId)));
    if (!t) throw missing();
  }
  if (Array.isArray(input.proposals)) {
    for (const p of input.proposals as { memberId: string }[]) {
      const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, orgId), eq(members.id, p.memberId), isNull(members.deletedAt)));
      if (!m) throw missing();
    }
  }
}

export async function callAsAgent(
  db: Db,
  auth: { actor: Actor; tokenId: string },
  name: string,
  rawInput: unknown,
  now: Date,
  surface: Extract<Surface, 'rest' | 'mcp'>,
): Promise<AgentCallResult> {
  const cap = getCapability(name);
  if (!cap || !(cap.surfaces as readonly string[]).includes(surface)) throw new CapabilityError('not_found', `Unknown action "${name}".`);
  const { actor } = auth;
  await consumeRate(db, auth.tokenId, cap.rateLimit, now);
  const ctx: CapabilityContext = { db, actor, now };

  if (cap.effect !== 'commit') return { status: 'done', result: await invokeCapability(name as CapabilityName, ctx, rawInput) };

  const level = await autonomyFor(db, actor.orgId, name, 'agent');
  if (level === 0) {
    await writeAudit(ctx, cap, 'denied', `Denied ${name}: turned off for agents`);
    throw new CapabilityError('forbidden', `An admin has turned off "${name}" for agents.`);
  }
  // L3 lets an agent acting for a person commit directly (still audited). Service agents never do (R3).
  if (level === 3 && actor.type === 'agent-on-behalf-of-user') {
    return { status: 'done', result: await invokeCapability(name as CapabilityName, ctx, rawInput) };
  }

  // Draft → confirm (R2).
  const { forMemberId, ...rest } = (rawInput ?? {}) as Record<string, unknown>;
  await authorize(ctx, cap);
  const parsed = cap.input.safeParse(rest);
  if (!parsed.success) throw new CapabilityError('invalid_input', describeZodError(name, parsed.error), z.treeifyError(parsed.error));

  let addressedTo = actor.onBehalfOfMemberId;
  if (actor.type === 'service-agent') {
    if (typeof forMemberId !== 'string') {
      throw new CapabilityError('invalid_input', `Service agents act through drafts: pass forMemberId (the member who must confirm ${name}).`);
    }
    const [m] = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.orgId, actor.orgId), eq(members.id, forMemberId), isNull(members.deletedAt)));
    if (!m) throw new CapabilityError('not_found', 'Member not found.');
    addressedTo = m.id;
  }
  if (!addressedTo) throw new CapabilityError('forbidden', 'This token has no member to confirm the action.');

  await checkTargets(db, actor.orgId, parsed.data as Record<string, unknown>);
  const summary = describe(name, parsed.data as Record<string, unknown>);
  const { token, hash } = newToken('conf');
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS);
  const [d] = await db
    .insert(drafts)
    .values({
      orgId: actor.orgId,
      capability: name,
      payload: parsed.data as object,
      summary,
      addressedToMemberId: addressedTo,
      createdByActorType: actor.type,
      createdByClientId: actor.clientId,
      confirmationTokenHash: hash,
      expiresAt,
    })
    .returning();
  await writeAudit(ctx, { name, effect: 'draft' }, 'ok', `Drafted for confirmation: ${summary}`, { draftId: d!.id });
  return {
    status: 'confirmation_required',
    draftId: d!.id,
    summary,
    confirmationToken: actor.type === 'agent-on-behalf-of-user' ? token : null,
    confirmUrl: `${appUrl()}/app#agent-requests`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * An agent acting for a person confirms a draft after showing them the summary (R2 via the
 * agent's own UI). Service agents cannot: no person is behind them, so their drafts are
 * confirmed in the web app (or Slack) by the member they are addressed to.
 */
export async function confirmDraftAsAgent(db: Db, auth: { actor: Actor; tokenId: string }, draftId: string, confirmationToken: string, now: Date) {
  const { actor } = auth;
  if (actor.type !== 'agent-on-behalf-of-user') {
    throw new CapabilityError('forbidden', 'Service agents cannot confirm. The member it is addressed to confirms it in the app.');
  }
  await consumeRate(db, auth.tokenId, 'write', now);
  const [d] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.orgId, actor.orgId), eq(drafts.id, draftId), eq(drafts.addressedToMemberId, actor.onBehalfOfMemberId!)));
  if (!d || d.confirmationTokenHash !== hashToken(confirmationToken)) throw new CapabilityError('not_found', 'Draft not found.');
  if (d.status !== 'open') throw new CapabilityError('conflict', `This draft is already ${d.status}.`);
  if (d.expiresAt <= now) throw new CapabilityError('conflict', 'This draft has expired. Create it again.');
  const result = await invokeCapability(d.capability as CapabilityName, { db, actor, now }, d.payload);
  await db.update(drafts).set({ status: 'confirmed' }).where(eq(drafts.id, d.id));
  return { status: 'done' as const, result };
}
