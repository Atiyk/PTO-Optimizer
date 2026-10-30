import { z } from 'zod';
import { decideAgentDraft, listAgentDrafts, manageAgentAccess, managePersonalTokens } from './actions/agents';
import { manageWebhooks } from './actions/webhooks';
import { deleteWorkspace, eraseMember } from './actions/privacy';
import { getSlackConnection, manageSlack } from './actions/slack';
import { auditLog } from '@/db/schema';
import { isDemoOrg } from '@/demo/isDemo';
import { adjustBalance, exportData, getAuditLog, getOrgSetup, listMembers, manageMembers, manageOrgSetup } from './actions/admin';
import { explainBalanceInWords, getAiUsage, importHandbook, parseLeaveRequestText } from './actions/ai';
import { importCsv } from './actions/importCsv';
import { manageStaffSignIn, setMyCoverPrefs } from './actions/staff';
import { findCover, getCoverRequests, getMySchedule, reportCallOff, requestCover, respondToCover } from './actions/cover';
import { draftRulePackFromText, explainCoverInWords, parseCoverText, saveRulePack } from './actions/coverAi';
import { getCoverage, getCoverageSetup, getCredentials, getSickLeave, importHoursWorked, listRulePacks, manageCredentials, manageSchedule } from './actions/coverage';
import { listMyProposals, respondToProposal, runTeamPlan, sendPlanProposals } from './actions/planner';
import { getCoverageForecast } from './actions/forecast';
import { decideLeaveRequest, listPendingApprovals } from './actions/approvals';
import { explainBalance, getMyBalance } from './actions/balance';
import { listHolidays, whoIsOut } from './actions/calendar';
import { cancelLeaveRequest, draftLeaveRequest, listMyRequests, submitLeaveRequest } from './actions/requests';
import { CapabilityError } from './errors';
import type { Actor, CapabilityContext, CapabilityDef } from './types';

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
  getCoverageSetup,
  findCover,
  requestCover,
  respondToCover,
  reportCallOff,
  getCoverRequests,
  manageStaffSignIn,
  setMyCoverPrefs,
  getMySchedule,
  draftRulePackFromText,
  saveRulePack,
  explainCoverInWords,
  parseCoverText,
  getCoverageForecast,
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
  if (DEMO_BLOCKED.has(cap.name) && (rawInput as { op?: unknown } | null)?.op !== 'list') await refuseInDemo(ctx);

  const parsed = cap.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new CapabilityError('invalid_input', describeZodError(cap.name, parsed.error), z.treeifyError(parsed.error));
  }

  const result = await cap.handler(ctx, parsed.data);
  const out = cap.output.parse(result) as CapabilityOutput<N>;

  if (cap.audit) await writeAudit(ctx, cap, 'ok', cap.audit(parsed.data, out));
  return out;
}

/**
 * Things a "Try the demo" visitor must not do from a made-up org: send data to outside URLs,
 * connect a real Slack workspace, or hand out agent keys. Listing (op 'list') still works.
 */
const DEMO_BLOCKED = new Set(['manageWebhooks', 'manageSlack', 'manageAgentAccess', 'managePersonalTokens']);

async function refuseInDemo(ctx: CapabilityContext): Promise<void> {
  if (await isDemoOrg(ctx.db, ctx.actor.orgId)) throw new CapabilityError('forbidden', 'This is turned off in the demo. Sign in with your own workspace to use it.');
}

export function describeZodError(capName: string, err: z.ZodError): string {
  const parts = err.issues.map((i) => `${i.path.join('.') || '(input)'}: ${i.message}`);
  return `Invalid input for ${capName}. ${parts.join('; ')}`;
}

/**
 * Role gate. A service agent has no member role: it may use manager-level capabilities within
 * the scopes an admin gave its key (its commits are still drafts a person confirms), never
 * admin- or owner-only ones.
 */
export function roleAllows(actor: Actor, cap: Pick<CapabilityDef, 'roles'>): boolean {
  if (!cap.roles) return true;
  if (actor.type === 'service-agent') return cap.roles.includes('manager');
  return !!actor.role && cap.roles.includes(actor.role);
}

/** Scope and role gate shared by direct calls and the agent gateway's draft path. Audits denials. */
export async function authorize(ctx: CapabilityContext, cap: CapabilityDef): Promise<void> {
  const { actor } = ctx;
  if (!actor.scopes.includes(cap.scope) || !roleAllows(actor, cap)) {
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
