import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { aiMode, estimateCostUsd } from '@/ai/config';
import { AiUnavailableError, budgetStatus, runAiTask } from '@/ai/run';
import { parsedRequestSchema, parseLeaveRequestTask } from '@/ai/tasks/parseLeaveRequest';
import { aiUsage, leaveTypes } from '@/db/schema';
import { evaluateRequest, isoDate } from '@/domain/leave';
import { subjectMember } from '../helpers';
import { defineCapability } from '../types';
import { evaluationOutput, evaluationToOutput } from './requests';

const aiStatus = z
  .object({
    used: z.enum(['ai', 'rules']).describe('"ai" = the model answered; "rules" = the built-in parser did (AI off, over budget or failed).'),
    unavailableReason: z.string().nullable(),
  })
  .describe('Which path produced the answer.');

export const parseLeaveRequestText = defineCapability({
  name: 'parseLeaveRequestText',
  description:
    'Turns one plain-language sentence ("Friday afternoon off", "sick today", "Dec 22 to Jan 2") into the ' +
    'fields of a leave request and, when the dates are clear, the engine check draftLeaveRequest would ' +
    'return. It NEVER submits: show the result to the person and call submitLeaveRequest only after they ' +
    'confirm. When something is missing it returns a clarifyingQuestion instead of guessing.',
  input: z.object({ text: z.string().min(1).max(500).describe('What the person wrote, verbatim.') }),
  output: z.object({
    fields: parsedRequestSchema,
    evaluation: evaluationOutput.nullable().describe('Engine check of the parsed fields; null when dates are missing.'),
    source: aiStatus,
  }),
  scope: 'leave:request',
  effect: 'draft',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'ai',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const member = await subjectMember(db, actor);
    const today = isoDate(now);
    const types = await db
      .select({ key: leaveTypes.key, name: leaveTypes.name })
      .from(leaveTypes)
      .where(and(eq(leaveTypes.orgId, actor.orgId), eq(leaveTypes.archived, false)));
    const taskInput = { text: input.text, today, leaveTypes: types };

    let fields: z.infer<typeof parsedRequestSchema>;
    let source: z.infer<typeof aiStatus>;
    try {
      fields = (await runAiTask(db, actor.orgId, parseLeaveRequestTask, taskInput, now)).output;
      source = { used: 'ai', unavailableReason: null };
    } catch (err) {
      if (!(err instanceof AiUnavailableError) || err.reason === 'input_too_long') throw err;
      fields = parseLeaveRequestTask.heuristic(taskInput);
      source = { used: 'rules', unavailableReason: err.message };
    }

    // Never trust model output: re-check against the org's real leave types and date order.
    if (fields.leaveType && !types.some((t) => t.key === fields.leaveType)) {
      fields = { ...fields, leaveType: null, clarifyingQuestion: fields.clarifyingQuestion ?? 'Which type of leave?' };
    }
    if (fields.start && fields.end && fields.end < fields.start) {
      fields = { ...fields, end: null, clarifyingQuestion: 'The end date is before the start date. Which dates did you mean?' };
    }
    if (fields.part === 'hours' && fields.hours == null) fields = { ...fields, part: 'full' };

    let evaluation = null;
    if (fields.leaveType && fields.start && fields.end) {
      const ev = await evaluateRequest(
        db,
        actor.orgId,
        member,
        { leaveTypeKey: fields.leaveType, start: fields.start, end: fields.end, part: fields.part, hours: fields.hours ?? undefined, note: fields.note },
        today,
      ).catch(() => null);
      evaluation = ev ? evaluationToOutput(ev) : null;
    }
    return { fields, evaluation, source };
  },
});

export const getAiUsage = defineCapability({
  name: 'getAiUsage',
  description:
    "Admin only. This organization's AI usage: tokens and estimated cost per feature over the last 30 " +
    "days, today's tokens against the daily allowance, and whether AI is on.",
  input: z.object({}),
  output: z.object({
    mode: z.enum(['off', 'mock', 'live']),
    today: z.object({ tokens: z.number(), dailyBudget: z.number() }),
    monthlyBudgetExhausted: z.boolean(),
    byFeature: z.array(
      z.object({
        feature: z.string(),
        model: z.string(),
        calls: z.number(),
        cacheHits: z.number(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        estimatedCostUsd: z.number(),
      }),
    ),
  }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }) {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await db
      .select({
        feature: aiUsage.feature,
        model: aiUsage.model,
        calls: sql<number>`count(*)::int`,
        cacheHits: sql<number>`count(*) filter (where ${aiUsage.cacheHit})::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.orgId, actor.orgId), gte(aiUsage.at, since)))
      .groupBy(aiUsage.feature, aiUsage.model)
      .orderBy(desc(sql`sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens})`));
    const b = await budgetStatus(db, actor.orgId, now);
    return {
      mode: aiMode(),
      today: { tokens: b.orgToday, dailyBudget: b.orgDailyBudget },
      monthlyBudgetExhausted: b.monthlyBudget === 0 || b.allMonth >= b.monthlyBudget,
      byFeature: rows.map((r) => ({
        ...r,
        calls: Number(r.calls),
        cacheHits: Number(r.cacheHits),
        inputTokens: Number(r.inputTokens),
        outputTokens: Number(r.outputTokens),
        estimatedCostUsd: Math.round(estimateCostUsd(r.model, Number(r.inputTokens), Number(r.outputTokens)) * 10_000) / 10_000,
      })),
    };
  },
});
