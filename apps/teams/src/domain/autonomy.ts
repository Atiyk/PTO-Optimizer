import { and, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { autonomySettings } from '@/db/schema';
import type { Evaluation } from './leave';

/**
 * R6 autonomy levels, per org × capability × actor class:
 *   L0 off: this actor class may not do it.
 *   L1 suggest: it may only point out what it would do.
 *   L2 draft: it prepares the action; a human confirms (default for agents' commit actions).
 *   L3 act within policy: it acts, audited, and the human can undo within a window.
 */
export type AutonomyLevel = 0 | 1 | 2 | 3;

/** Actions that change data and that agents can reach (kept in step with the registry by a test). */
export const AGENT_COMMIT_CAPABILITIES = ['submitLeaveRequest', 'cancelLeaveRequest', 'decideLeaveRequest', 'respondToProposal', 'sendPlanProposals'] as const;
export type ActorClass = 'agent' | 'assistant';

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  0: 'Off',
  1: 'Suggest',
  2: 'Draft, a person confirms',
  3: 'Act within policy (undo window)',
};

/** Defaults when no row exists: agents draft (L2); the approval assistant suggests (L1). */
function defaultLevel(_capability: string, actorClass: ActorClass): AutonomyLevel {
  return actorClass === 'assistant' ? 1 : 2;
}

export async function autonomyFor(db: Db, orgId: string, capability: string, actorClass: ActorClass): Promise<AutonomyLevel> {
  const [row] = await db
    .select()
    .from(autonomySettings)
    .where(and(eq(autonomySettings.orgId, orgId), eq(autonomySettings.capability, capability), eq(autonomySettings.actorClass, actorClass)));
  return (row?.level ?? defaultLevel(capability, actorClass)) as AutonomyLevel;
}

export interface AutoApprovalCheck {
  eligible: boolean;
  /** Why not, in plain words; empty when eligible. */
  blockers: string[];
  /** The rules that made it eligible, recorded on the request and in the audit log. */
  basis: string;
}

/**
 * 3D: deterministic eligibility, decided by the engine's evaluation and never by a model.
 * Only clean requests qualify: the leave type opted in, within its size limit, enough balance,
 * no coverage gap, no blackout, not in the past, no overlap.
 */
export function autoApprovalCheck(ev: Evaluation): AutoApprovalCheck {
  const t = ev.leaveType;
  const blockers: string[] = [];
  if (!t.autoApprove) blockers.push(`${t.name} is not set up for auto-approval.`);
  const max = t.maxAutoApproveDays == null ? null : Number(t.maxAutoApproveDays);
  if (max != null && ev.cost.amount > max) blockers.push(`Longer than the ${max} ${ev.unit} auto-approval limit.`);
  if (ev.problems.length) blockers.push(...ev.problems);
  if (ev.retroactive) blockers.push('Starts in the past.');
  if (ev.coverage.length) blockers.push('Would leave the team below its coverage minimum.');
  if (ev.blackouts.length) blockers.push('Overlaps a blackout period.');
  if (ev.countsAgainstBalance && ev.balanceAfter != null && ev.balanceAfter < 0) blockers.push('Would take the balance below zero.');
  const basis =
    `${t.name}, ${ev.cost.amount} ${ev.cost.amount === 1 ? ev.unit.replace(/s$/, '') : ev.unit}` +
    (max != null ? ` (limit ${max})` : '') +
    (ev.countsAgainstBalance && ev.balanceAfter != null ? `, balance after ${ev.balanceAfter}` : '') +
    ', no coverage gap, no blackout';
  return { eligible: blockers.length === 0, blockers, basis };
}
