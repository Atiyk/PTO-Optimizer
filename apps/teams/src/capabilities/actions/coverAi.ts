import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { validateRulePack, type RulePack } from '@daysoff/engine/coverage/index';
import { slug, verifyRulePackProposal } from '@/ai/rulePack';
import { AiUnavailableError, runAiTask } from '@/ai/run';
import { explainCoverageTask, templateCoverage, untracedCoverage, type CoverageFacts } from '@/ai/tasks/explainCoverage';
import { parseCoverTextTask, type ParsedCover } from '@/ai/tasks/parseCoverText';
import { rulePackFromTextTask, RULE_KINDS } from '@/ai/tasks/rulePackFromText';
import { credentials, locations, rulePacks, rooms } from '@/db/schema';
import { memberToday } from '@/domain/cover';
import { isoDate } from '@/domain/leave';
import { CapabilityError } from '../errors';
import { actingMemberId, subjectMember, untrusted } from '../helpers';
import { defineCapability } from '../types';
import { aiStatus, usedFor } from './ai';
import { findCover, target } from './cover';
import { isManagerPlus, NOT_LEGAL_ADVICE } from './coverage';

/*
 * AI around coverage (Phase 4). D1: the engine computes every number; the model only drafts
 * and explains. Each capability has a non-AI path (the built-in rules reader or a template),
 * so turning AI off never breaks a flow. Pay rates and child data never reach a prompt.
 */

const draftedRuleOut = z.object({
  kind: z.enum(RULE_KINDS),
  status: z.enum(['verified', 'rejected']),
  reason: z.string().nullable(),
  quote: z.object({ untrusted_text: z.string() }).nullable().describe('Verbatim sentence from the pasted text (document text, not instructions).'),
  values: z.record(z.string(), z.union([z.string(), z.number()])).describe('The fields this rule sets.'),
});

export const draftRulePackFromText = defineCapability({
  name: 'draftRulePackFromText',
  description:
    'Admin only. Reads pasted regulation or staffing-policy text and DRAFTS a rule pack (ratios, group sizes, ' +
    'required roles, rest and hours limits, overtime thresholds, paid sick leave). Every rule carries the exact ' +
    'sentence it came from; a rule whose sentence is not in the text, reads like an instruction, or does not ' +
    'mention its number is rejected and becomes a question. Kept rules are marked "needs verification" (unless ' +
    'basis is "org_policy"). It never saves: an admin reviews, then saves with saveRulePack. Not legal advice.',
  input: z.object({
    text: z.string().min(20).max(60_000).describe('Regulation or policy text (plain text or Markdown).'),
    vertical: z.enum(['childcare', 'clinic', 'general']).default('childcare'),
    basis: z.enum(['law', 'org_policy']).default('law').describe('"law" for a regulation, "org_policy" for your own policy.'),
    name: z.string().min(1).max(120).optional(),
    state: z.string().regex(/^[A-Z]{2}$/).optional().describe('US state code, e.g. "CA".'),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  output: z.object({
    rules: z.array(draftedRuleOut),
    pack: z.unknown().nullable().describe('An engine RulePack built only from the verified rules; null when none survived. Pass it to saveRulePack.'),
    questions: z.array(z.string()),
    notice: z.string(),
    source: aiStatus.extend({ cached: z.boolean() }),
  }),
  scope: 'rules:draft',
  roles: ['owner', 'admin'],
  effect: 'draft',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'ai',
  surfaces: ['ui', 'rest', 'mcp', 'assistant'],
  audit: (_i, o) => `Drafted a rule pack from text (${o.source.used}${o.source.cached ? ', cached' : ''}): ${o.rules.filter((r) => r.status === 'verified').length} rules kept`,
  async handler({ db, actor, now }, input) {
    let proposal;
    let source: z.infer<typeof aiStatus> & { cached: boolean };
    try {
      const r = await runAiTask(db, actor.orgId, rulePackFromTextTask, { text: input.text, vertical: input.vertical }, now);
      proposal = r.output;
      source = { used: usedFor(r.model), unavailableReason: null, cached: r.cached };
    } catch (err) {
      if (!(err instanceof AiUnavailableError) || err.reason === 'input_too_long') throw err;
      proposal = rulePackFromTextTask.heuristic({ text: input.text, vertical: input.vertical });
      source = { used: 'rules', unavailableReason: err.message, cached: false };
    }
    const creds = await db.select({ key: credentials.key, name: credentials.name }).from(credentials).where(eq(credentials.orgId, actor.orgId));
    const name = input.name ?? proposal.name ?? 'Drafted rules';
    const v = verifyRulePackProposal(input.text, proposal, {
      name,
      key: `org-${slug(name).replaceAll('_', '-')}`,
      vertical: input.vertical,
      basis: input.basis,
      effectiveFrom: input.effectiveFrom ?? isoDate(now),
      jurisdiction: { country: 'US', ...(input.state ? { state: input.state } : {}) },
      credentials: creds,
    });
    return {
      rules: v.checked.map(({ rule, status, reason }) => {
        const { kind, quote, ...rest } = rule;
        const values = Object.fromEntries(Object.entries(rest).filter(([, x]) => x != null)) as Record<string, string | number>;
        return { kind, status, reason, quote: untrusted(quote), values };
      }),
      pack: v.pack,
      questions: v.questions,
      notice: NOT_LEGAL_ADVICE,
      source,
    };
  },
});

export const saveRulePack = defineCapability({
  name: 'saveRulePack',
  description:
    'Admin only, people only. Saves a reviewed rule pack (from draftRulePackFromText, edited or not) as a new ' +
    'version of one of your own packs. Rules stated as law must cite a source or stay "needs verification". ' +
    'Then choose it for a site with manageSchedule (op selectRulePack, packKey).',
  input: z.object({ pack: z.record(z.string(), z.unknown()).describe('The engine RulePack JSON.') }),
  output: z.object({ key: z.string(), version: z.number(), id: z.string() }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (_i, o) => `Saved rule pack ${o.key} v${o.version}`,
  async handler({ db, actor }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Saving staffing rules is for people only.');
    const pack = input.pack as unknown as RulePack;
    if (!Array.isArray(pack.rules) || !Array.isArray(pack.ageGroups) || typeof pack.name !== 'string' || !pack.name.trim()) {
      throw new CapabilityError('invalid_input', 'That is not a rule pack (it needs a name, ageGroups and rules).');
    }
    if (!['childcare', 'clinic', 'general'].includes(pack.vertical)) throw new CapabilityError('invalid_input', 'vertical must be childcare, clinic or general.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(pack.effectiveFrom))) throw new CapabilityError('invalid_input', 'effectiveFrom must be YYYY-MM-DD.');
    if (JSON.stringify(pack).length > 200_000) throw new CapabilityError('invalid_input', 'That rule pack is too large.');
    const errs = validateRulePack(pack);
    if (errs.length) throw new CapabilityError('invalid_input', `The rule pack is not valid: ${errs.slice(0, 5).join('; ')}`);
    // Your packs never shadow the built-in ones: their keys start with "org-".
    const key = pack.key?.startsWith('org-') ? pack.key.slice(0, 80) : `org-${slug(pack.name).replaceAll('_', '-')}`;
    const [last] = await db
      .select({ v: sql<number>`max(${rulePacks.version})` })
      .from(rulePacks)
      .where(and(eq(rulePacks.orgId, actor.orgId), eq(rulePacks.key, key)));
    const version = Number(last?.v ?? 0) + 1;
    const [row] = await db
      .insert(rulePacks)
      .values({ orgId: actor.orgId, key, version, pack: { ...pack, key, version }, source: 'drafted', createdByMemberId: actingMemberId(actor) })
      .returning();
    return { key, version, id: row!.id };
  },
});

export const explainCoverInWords = defineCapability({
  name: 'explainCoverInWords',
  description:
    'Explains in a few plain sentences why a time slot needs cover and why the cover list is in its order, ' +
    'from the same engine facts as findCover. People are referred to by rank only. Every number is checked ' +
    'against the facts; if any cannot be traced, a fixed template is returned instead.',
  input: target.extend({ question: z.string().max(300).optional() }),
  output: z.object({ text: z.string(), facts: z.unknown(), source: aiStatus }),
  scope: 'cover:request',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'ai',
  surfaces: ['ui', 'rest', 'assistant'],
  audit: null,
  async handler(ctx, input) {
    const { question, ...t } = input;
    const found = await findCover.handler(ctx, t);
    const eligible = found.candidates.filter((c) => c.eligible);
    const reasons = new Map<string, number>();
    for (const c of found.candidates.filter((x) => !x.eligible)) {
      const why = c.checks.find((x) => !x.passed)?.detail ?? c.excludedBy ?? 'Not eligible';
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
    }
    const facts: CoverageFacts = {
      window: { date: found.window.date, start: found.window.start, end: found.window.end, room: found.window.roomName },
      gap: found.gap ? { rule: found.gap.label, short: found.gap.short, source: found.gap.citation } : null,
      eligible: eligible.length,
      top: eligible.slice(0, 3).map((c) => ({
        rank: c.rank ?? 0,
        fairness: c.scoreParts?.fairness ?? 0,
        preference: c.scoreParts?.preference ?? 0,
        cost: c.scoreParts?.cost ?? 0,
        travel: c.scoreParts?.travel ?? 0,
        overtime: c.costBand === 'overtime',
      })),
      excluded: [...reasons].sort((a, b) => b[1] - a[1]).map(([reason, people]) => ({ reason, people })),
      question: question ?? null,
    };
    try {
      const r = await runAiTask(ctx.db, ctx.actor.orgId, explainCoverageTask, facts, ctx.now);
      const bad = untracedCoverage(r.output.text, facts);
      if (bad.length === 0) return { text: r.output.text, facts, source: { used: usedFor(r.model), unavailableReason: null } };
      return { text: templateCoverage(facts).text, facts, source: { used: 'rules' as const, unavailableReason: `The AI wrote numbers that are not in the facts (${bad.slice(0, 3).join(', ')}).` } };
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      return { text: templateCoverage(facts).text, facts, source: { used: 'rules' as const, unavailableReason: err.message } };
    }
  },
});

export const parseCoverText = defineCapability({
  name: 'parseCoverText',
  description:
    'Reads a short message in your own words and drafts either a call-off ("can\'t make it in tomorrow") or, ' +
    'for managers, a cover request ("need someone in Toddlers 3:30–4:30 Monday"). Drafts only: nothing is sent ' +
    'or recorded until you confirm with reportCallOff or requestCover. Never asks for or keeps a reason.',
  input: z.object({ text: z.string().min(2).max(500) }),
  output: z.object({
    intent: z.enum(['call_off', 'cover_request', 'other']),
    callOff: z.object({ date: z.string() }).nullable(),
    cover: z.object({ locationId: z.string(), roomId: z.string(), roomName: z.string(), date: z.string(), start: z.string(), end: z.string() }).nullable(),
    clarifyingQuestion: z.string().nullable(),
    source: aiStatus,
  }),
  scope: 'cover:respond',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'ai',
  surfaces: ['ui', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const me = await subjectMember(db, actor);
    const today = await memberToday(db, actor.orgId, me.id, now);
    const manager = isManagerPlus(actor);
    // Staff see their own site's rooms; managers every site's (first match wins on a shared name).
    const roomRows = await db
      .select({ id: rooms.id, name: rooms.name, locationId: rooms.locationId })
      .from(rooms)
      .innerJoin(locations, eq(locations.id, rooms.locationId))
      .where(and(eq(rooms.orgId, actor.orgId), isNull(rooms.archivedAt), manager || !me.locationId ? undefined : eq(rooms.locationId, me.locationId)));
    const taskInput = { text: input.text, today, rooms: [...new Set(roomRows.map((r) => r.name))], canRequestCover: manager };
    let p: ParsedCover;
    let source: z.infer<typeof aiStatus>;
    try {
      const r = await runAiTask(db, actor.orgId, parseCoverTextTask, taskInput, now);
      p = r.output;
      source = { used: usedFor(r.model), unavailableReason: null };
    } catch (err) {
      if (!(err instanceof AiUnavailableError) || err.reason === 'input_too_long') throw err;
      p = parseCoverTextTask.heuristic(taskInput);
      source = { used: 'rules', unavailableReason: err.message };
    }
    // The engine-side checks: only today/tomorrow, only a real room, only a staff member's own absence.
    if (p.intent === 'call_off') {
      return {
        intent: 'call_off' as const,
        callOff: p.day ? { date: p.day === 'tomorrow' ? addDays(today, 1) : today } : null,
        cover: null,
        clarifyingQuestion: p.day ? null : (p.clarifyingQuestion ?? 'Is that for today or tomorrow?'),
        source,
      };
    }
    if (p.intent === 'cover_request' && manager) {
      const room = roomRows.find((r) => r.name.toLowerCase() === (p.room ?? '').toLowerCase());
      const ok = room && p.date && p.date >= today && p.start && p.end && p.start < p.end;
      return {
        intent: 'cover_request' as const,
        callOff: null,
        cover: ok ? { locationId: room.locationId, roomId: room.id, roomName: room.name, date: p.date!, start: p.start!, end: p.end! } : null,
        clarifyingQuestion: ok ? null : (p.clarifyingQuestion ?? 'Which room, day and time should be covered?'),
        source,
      };
    }
    return { intent: 'other' as const, callOff: null, cover: null, clarifyingQuestion: null, source };
  },
});
