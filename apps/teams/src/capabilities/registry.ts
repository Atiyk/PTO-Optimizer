import { z } from 'zod';
import { decideAgentDraft, listAgentDrafts, manageAgentAccess, managePersonalTokens } from './actions/agents';
import { manageWebhooks } from './actions/webhooks';
import { deleteWorkspace, eraseMember } from './actions/privacy';
import { getSlackConnection, manageSlack } from './actions/slack';
import { auditLog } from '@/db/schema';
import { adjustBalance, exportData, getAuditLog, getOrgSetup, listMembers, manageMembers, manageOrgSetup } from './actions/admin';
import { explainBalanceInWords, getAiUsage, importHandbook, parseLeaveRequestText } from './actions/ai';
import { importCsv } from './actions/importCsv';
import { getCoverage, getCredentials, getSickLeave, importHoursWorked, listRulePacks, manageCredentials, manageSchedule } from './actions/coverage';
import { listMyProposals, respondToProposal, runTeamPlan, sendPlanProposals } from './actions/planner';
import { decideLeaveRequest, listPendingApprovals } from './actions/approvals';
import { explainBalance, getMyBalance } from './actions/balance';
import { listHolidays, whoIsOut } from './actions/calendar';
import { cancelLeaveRequest, draftLeaveRequest, listMyRequests, submitLeaveRequest } from './actions/requests';
import { CapabilityError } from './errors';
import type { CapabilityContext, CapabilityDef } from './types';

/**
 * R1: the single registry every surface calls (web UI server actions, REST, MCP, Slack,
 * the in-app assistant). No surface touches the DB for business actions directly.
 */
export const CAPABILITIES = {
  getMyBalance,
  explainBalance,
  draftLeaveRequest,
  submitLeaveRequest,
  cancelLeaveRequest,
  listMyRequests,
  whoIsOut,
  listHolidays,
  listPendingApprovals,
  decideLeaveRequest,
  getOrgSetup,
  manageOrgSetup,
  listMembers,
  manageMembers,
  adjustBalance,
  exportData,
  getAuditLog,
  importCsv,
  parseLeaveRequestText,
  importHandbook,
  explainBalanceInWords,
  getAiUsage,
  runTeamPlan,
  sendPlanProposals,
  listMyProposals,
  respondToProposal,
  managePersonalTokens,
  manageAgentAccess,
  manageWebhooks,
  eraseMember,
  deleteWorkspace,
  manageSlack,
  getSlackConnection,
  listAgentDrafts,
  decideAgentDraft,
  getCoverage,
  manageSchedule,
  manageCredentials,
  getCredentials,
  importHoursWorked,
  getSickLeave,
  listRulePacks,
} as const satisfies Record<string, CapabilityDef>;

export type CapabilityName = keyof typeof CAPABILITIES;
export type CapabilityInput<N extends CapabilityName> = z.input<(typeof CAPABILITIES)[N]['input']>;
export type CapabilityOutput<N extends CapabilityName> = z.infer<(typeof CAPABILITIES)[N]['output']>;

export function getCapability(name: string): CapabilityDef | undefined {
  return Object.hasOwn(CAPABILITIES, name) ? (CAPABILITIES as Record<string, CapabilityDef>)[name] : undefined;
}

/**
 * Validate → authorize → run → validate output → audit. Every surface goes through here, so
 * agents and humans get identical permission checks, visibility rules and audit rows (R4).
 */
export async function invokeCapability<N extends CapabilityName>(
  name: N,
  ctx: CapabilityContext,
  rawInput: unknown,
): Promise<CapabilityOutput<N>> {
  const cap = CAPABILITIES[name] as unknown as CapabilityDef;

  await authorize(ctx, cap);

  const parsed = cap.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new CapabilityError('invalid_input', describeZodError(cap.name, parsed.error), z.treeifyError(parsed.error));
  }

  const result = await cap.handler(ctx, parsed.data);
  const out = cap.output.parse(result) as CapabilityOutput<N>;

  if (cap.audit) await writeAudit(ctx, cap, 'ok', cap.audit(parsed.data, out));
  return out;
}

export function describeZodError(capName: string, err: z.ZodError): string {
  const parts = err.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`);
  return `Invalid input for ${capName}. ${parts.join('; ')}`;
}

/** Scope and role gate shared by direct calls and the agent gateway's draft path. Audits denials. */
export async function authorize(ctx: CapabilityContext, cap: CapabilityDef): Promise<void> {
  const { actor } = ctx;
  if (!actor.scopes.includes(cap.scope) || (cap.roles && (!actor.role || !cap.roles.includes(actor.role)))) {
    await writeAudit(ctx, cap, 'denied', `Denied ${cap.name}: missing scope ${cap.scope} or role`);
    throw new CapabilityError('forbidden', `${cap.name} requires the "${cap.scope}" scope${cap.roles ? ` and one of these roles: ${cap.roles.join(', ')}` : ''}.`);
  }
}

export async function writeAudit(
  ctx: CapabilityContext,
  cap: Pick<CapabilityDef, 'name' | 'effect'>,
  outcome: 'ok' | 'denied' | 'error',
  summary: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { actor } = ctx;
  await ctx.db.insert(auditLog).values({
    orgId: actor.orgId,
    at: ctx.now,
    actorType: actor.type,
    actorMemberId: actor.memberId,
    clientId: actor.clientId,
    onBehalfOfMemberId: actor.onBehalfOfMemberId,
    scopes: [...actor.scopes],
    capability: cap.name,
    effect: cap.effect,
    outcome,
    summary,
    data: data ?? null,
  });
}
