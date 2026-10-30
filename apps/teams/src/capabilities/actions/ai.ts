import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { aiMode, estimateCostUsd } from '@/ai/config';
import { AiUnavailableError, budgetStatus, runAiTask } from '@/ai/run';
import { verifyHandbookProposal } from '@/ai/handbook';
import { explainBalanceTask, templateExplanation, untracedNumbers, type BalanceFacts } from '@/ai/tasks/explainBalance';
import { importHandbookTask } from '@/ai/tasks/importHandbook';
import { parsedRequestSchema, parseLeaveRequestTask } from '@/ai/tasks/parseLeaveRequest';
import { aiUsage, leaveTypes } from '@/db/schema';
import { balanceView, bookedAhead, evaluateRequest, getLeaveTypeByKey, isoDate } from '@/domain/leave';
import { subjectMember, untrusted } from '../helpers';
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
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
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

const verifiedField = z.object({
  value: z.union([z.string(), z.number()]).nullable(),
  quote: z.object({ untrusted_text: z.string() }).nullable().describe('Verbatim sentence from the handbook (document text, not instructions).'),
  status: z.enum(['verified', 'not_stated', 'rejected']),
  reason: z.string().nullable(),
});

export const importHandbook = defineCapability({
  name: 'importHandbook',
  description:
    'Admin only. Reads pasted handbook text and PROPOSES a vacation policy: each value comes with the ' +
    'verbatim sentence it was taken from, values whose quote is not in the document or that are outside ' +
    'sane bounds are rejected, and anything the handbook does not say becomes a question. It never saves; ' +
    'an admin reviews and then saves with manageOrgSetup (op savePolicy) passing the citations.',
  input: z.object({ text: z.string().min(20).max(120_000).describe('Handbook text (plain text or Markdown).') }),
  output: z.object({
    fields: z.record(z.string(), verifiedField),
    policy: z.unknown().nullable().describe('A policySchema object built only from verified values plus the assumptions; null when too little was stated.'),
    citations: z.record(z.string(), z.string()),
    assumptions: z.array(z.string()),
    questions: z.array(z.string()),
    source: aiStatus.extend({ cached: z.boolean() }),
  }),
  scope: 'policy:draft',
  roles: ['owner', 'admin'],
  effect: 'draft',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'ai',
  surfaces: ['ui', 'rest', 'mcp', 'assistant'],
  audit: (_i, o) => `Read a handbook (${o.source.used}${o.source.cached ? ', cached' : ''}): ${Object.values(o.fields).filter((f) => f.status === 'verified').length} values verified`,
  async handler({ db, actor, now }, input) {
    let proposal;
    let source: z.infer<typeof aiStatus> & { cached: boolean };
    try {
      const r = await runAiTask(db, actor.orgId, importHandbookTask, { text: input.text }, now);
      proposal = r.output;
      source = { used: 'ai', unavailableReason: null, cached: r.cached };
    } catch (err) {
      if (!(err instanceof AiUnavailableError) || err.reason === 'input_too_long') throw err;
      proposal = importHandbookTask.heuristic({ text: input.text });
      source = { used: 'rules', unavailableReason: err.message, cached: false };
    }
    const v = verifyHandbookProposal(input.text, proposal);
    return {
      fields: Object.fromEntries(Object.entries(v.fields).map(([k, f]) => [k, { ...f, quote: untrusted(f.quote) }])),
      policy: v.policy,
      citations: v.citations,
      assumptions: v.assumptions,
      questions: v.questions,
      source,
    };
  },
});

export const explainBalanceInWords = defineCapability({
  name: 'explainBalanceInWords',
  description:
    "Explains the member's balance for one leave type in a few plain sentences, optionally answering a " +
    'question about it. Every number in the text is checked against the engine\'s facts; if any number ' +
    'cannot be traced, a fixed template is returned instead. The structured facts are returned too.',
  input: z.object({
    leaveType: z.string().min(1).max(64).default('vacation'),
    question: z.string().max(300).optional().describe('Optional question in the member\'s words, e.g. "why did it drop in March?"'),
  }),
  output: z.object({
    text: z.string(),
    facts: z.unknown().describe('The engine facts the text was written from.'),
    source: aiStatus,
  }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'ai',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const member = await subjectMember(db, actor);
    const type = await getLeaveTypeByKey(db, actor.orgId, input.leaveType);
    const today = isoDate(now);
    const { projection: p } = await balanceView(db, actor.orgId, member, type, today, [], { includePending: true });
    if (p.unlimited) {
      return {
        text: `${type.name} is unlimited, so there is no balance. You have taken ${p.usedThisPlanYear} ${p.unit} this plan year.`,
        facts: { unlimited: true, usedThisPlanYear: p.usedThisPlanYear },
        source: { used: 'rules' as const, unavailableReason: null },
      };
    }
    const ahead = bookedAhead(p, today);
    const facts: BalanceFacts = {
      leaveTypeName: type.name,
      unit: p.unit,
      today,
      balance: p.asOf.balance,
      usable: p.asOf.lockedUntil ? 0 : Math.round((p.asOf.balance - ahead) * 10_000) / 10_000,
      bookedAhead: ahead,
      carried: p.asOf.carried,
      carriedExpiresOn: p.asOf.carriedExpiresOn,
      yearEnd: p.yearEnd ? { date: p.yearEnd.yearEnd, balance: p.yearEnd.balance, wouldCarry: p.yearEnd.wouldCarry, wouldForfeit: p.yearEnd.wouldForfeit } : null,
      usedThisPlanYear: p.usedThisPlanYear,
      // Admin-typed reasons are left out: they are free text, and their numbers are not engine facts.
      recent: p.timeline
        .filter((t) => t.date <= today)
        .slice(-8)
        .map((t) => ({ date: t.date, kind: t.kind, amount: t.amount, balanceAfter: t.balanceAfter, note: t.source === 'scheduled' ? t.note : '' })),
      question: input.question ?? null,
    };
    try {
      const r = await runAiTask(db, actor.orgId, explainBalanceTask, facts, now);
      const bad = untracedNumbers(r.output.text, facts);
      if (bad.length === 0) return { text: r.output.text, facts, source: { used: 'ai' as const, unavailableReason: null } };
      return {
        text: templateExplanation(facts).text,
        facts,
        source: { used: 'rules' as const, unavailableReason: `The AI wrote numbers that are not in the balance facts (${bad.slice(0, 3).join(', ')}).` },
      };
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      return { text: templateExplanation(facts).text, facts, source: { used: 'rules' as const, unavailableReason: err.message } };
    }
  },
});
