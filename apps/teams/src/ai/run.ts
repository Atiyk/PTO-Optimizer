import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { aiCache, aiUsage, organizations } from '@/db/schema';
import { monthlyTokenBudget, orgDailyTokenBudget, taskConfig } from './config';
import { AiProviderError, currentProvider, mockProvider } from './provider';
import type { AiTask } from './task';
import { demoKind } from '@/demo/isDemo';

export type AiUnavailableReason = 'disabled' | 'org_budget' | 'monthly_budget' | 'input_too_long' | 'provider_error' | 'invalid_output';

/** AI could not answer. Every caller has a non-AI path, so this is never fatal to a flow. */
export class AiUnavailableError extends Error {
  constructor(
    readonly reason: AiUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export interface AiResult<O> {
  output: O;
  model: string;
  cached: boolean;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function tokensSince(db: Db, since: Date, orgId?: string): Promise<number> {
  const where = orgId ? and(eq(aiUsage.orgId, orgId), gte(aiUsage.at, since)) : gte(aiUsage.at, since);
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)::int` })
    .from(aiUsage)
    .where(where);
  return Number(row?.n ?? 0);
}

export async function budgetStatus(db: Db, orgId: string, now: Date) {
  const [orgToday, allMonth] = await Promise.all([
    tokensSince(db, startOfUtcDay(now), orgId),
    tokensSince(db, startOfUtcMonth(now)),
  ]);
  return {
    orgToday,
    orgDailyBudget: orgDailyTokenBudget(),
    allMonth,
    monthlyBudget: monthlyTokenBudget(),
  };
}

/**
 * The single entry point for model calls: mode check → input size → budgets → cache →
 * provider → schema validation (one retry) → usage row. Nothing else imports the SDK.
 */
/** The org's own "AI features" switch (admin setting). A missing org reads as off. */
export async function orgAiEnabled(db: Db, orgId: string): Promise<boolean> {
  const [org] = await db.select({ on: organizations.aiFeaturesEnabled }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return org?.on === true;
}

export async function runAiTask<I, O>(
  db: Db,
  orgId: string,
  task: AiTask<I, O>,
  input: I,
  now: Date,
): Promise<AiResult<O>> {
  // "Try the demo" copies swap the paid model for the deterministic stand-in, so anyone can click around for free.
  const base = currentProvider();
  const provider = base?.name === 'anthropic' && (await demoKind(db, orgId)) === 'sandbox' ? mockProvider : base;
  if (!provider) throw new AiUnavailableError('disabled', 'AI features are turned off.');
  // Checked before the cache too: an org that turned AI off gets no AI output at all.
  if (!(await orgAiEnabled(db, orgId))) throw new AiUnavailableError('disabled', 'An admin turned AI features off for this workspace. Forms still work.');
  const cfg = taskConfig(task.name);

  const rendered = task.render(input);
  if (rendered.length > cfg.maxInputChars) {
    throw new AiUnavailableError('input_too_long', `That text is too long for ${task.name} (max ${cfg.maxInputChars} characters).`);
  }

  const cacheKey = task.cache
    ? createHash('sha256').update(`${task.name}\0${task.promptVersion}\0${provider.name}:${cfg.model}\0${rendered}`).digest('hex')
    : null;
  if (cacheKey) {
    const [hit] = await db.select().from(aiCache).where(eq(aiCache.key, cacheKey)).limit(1);
    const parsed = hit ? task.output.safeParse(hit.value) : null;
    if (parsed?.success) {
      await db.insert(aiUsage).values({ orgId, feature: task.name, model: hit!.model, cacheHit: true, at: now });
      return { output: parsed.data, model: hit!.model, cached: true };
    }
  }

  const budget = await budgetStatus(db, orgId, now);
  if (budget.monthlyBudget === 0 || budget.allMonth >= budget.monthlyBudget) {
    throw new AiUnavailableError('monthly_budget', 'The monthly AI budget is used up; forms still work.');
  }
  if (budget.orgToday >= budget.orgDailyBudget) {
    throw new AiUnavailableError('org_budget', "Your organization's AI allowance for today is used up; forms still work.");
  }

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await provider.complete(task, input, { model: cfg.model, maxTokens: cfg.maxTokens, effort: cfg.effort });
    } catch (err) {
      if (err instanceof AiProviderError) {
        throw new AiUnavailableError('provider_error', `The AI service could not answer: ${err.message}`);
      }
      throw err;
    }
    await db.insert(aiUsage).values({
      orgId,
      feature: task.name,
      model: res.model,
      inputTokens: res.usage.inputTokens,
      outputTokens: res.usage.outputTokens,
      cacheReadTokens: res.usage.cacheReadTokens,
      at: now,
    });
    const parsed = task.output.safeParse(res.output);
    if (parsed.success) {
      if (cacheKey) {
        await db
          .insert(aiCache)
          .values({ key: cacheKey, feature: task.name, model: res.model, value: parsed.data as object })
          .onConflictDoNothing();
      }
      return { output: parsed.data, model: res.model, cached: false };
    }
    lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  throw new AiUnavailableError('invalid_output', `The AI reply did not match the expected shape (${lastError}).`);
}
