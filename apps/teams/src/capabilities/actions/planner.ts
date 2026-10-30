import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { planTeam, type PlannerMember } from '@daysoff/engine/leave/teamPlan';
import { addDays, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { untracedIn } from '@/ai/provenance';
import { AiUnavailableError, runAiTask } from '@/ai/run';
import { summarizePlanTask, templatePlanSummary, type PlanFacts } from '@/ai/tasks/summarizePlan';
import { blackouts, coverageRules, drafts, members, teams } from '@/db/schema';
import { balanceView, getLeaveTypeByKey, getMember, isoDate, teamCoverageMembers } from '@/domain/leave';
import { newToken } from '@/lib/tokens';
import { CapabilityError } from '../errors';
import { subjectMember } from '../helpers';
import { defineCapability } from '../types';

const block = z.object({ start: z.iso.date(), end: z.iso.date(), leaveDays: z.number(), daysOff: z.number() });

/** Teams a caller may plan: admins any; managers their own team and their reports' teams. */
async function plannableTeam(db: Parameters<typeof getMember>[0], actor: { orgId: string; memberId: string | null; role: string | null }, teamId?: string) {
  const all = await db.select().from(teams).where(eq(teams.orgId, actor.orgId)).orderBy(asc(teams.name));
  let allowed = all;
  if (actor.role !== 'owner' && actor.role !== 'admin') {
    const me = actor.memberId ? await getMember(db, actor.orgId, actor.memberId) : null;
    const reports = actor.memberId
      ? await db.select({ teamId: members.teamId }).from(members).where(and(eq(members.orgId, actor.orgId), eq(members.managerId, actor.memberId), isNull(members.deletedAt)))
      : [];
    const ids = new Set([me?.teamId, ...reports.map((r) => r.teamId)].filter(Boolean));
    allowed = all.filter((t) => ids.has(t.id));
  }
  const team = teamId ? allowed.find((t) => t.id === teamId) : allowed[0];
  if (!team) throw new CapabilityError('not_found', teamId ? 'Team not found.' : 'You have no team to plan.');
  return { team, teams: allowed };
}

export const runTeamPlan = defineCapability({
  name: 'runTeamPlan',
  description:
    'Plans how a team can use leave that would otherwise be forfeited, without breaking coverage rules. ' +
    'For each person with days at risk (from the engine: carried days expiring, or year-end above the ' +
    'carry-over limit) it proposes working days before the deadline: fewest days lost first, then long ' +
    'breaks bridging weekends and holidays. Returns per-person plans, a coverage heatmap and totals. ' +
    'Reads only; deterministic for the same inputs. Use sendPlanProposals to offer the plans to people.',
  input: z.object({
    teamId: z.uuid().optional().describe('Defaults to the first team the caller may plan.'),
    leaveType: z.string().min(1).max(64).default('vacation'),
    start: z.iso.date().optional().describe('First plannable day; defaults to tomorrow.'),
    preferences: z
      .array(
        z.object({
          memberId: z.uuid(),
          preferMonths: z.array(z.number().int().min(1).max(12)).max(12).optional(),
          avoid: z.array(z.object({ start: z.iso.date(), end: z.iso.date() })).max(20).optional(),
        }),
      )
      .max(200)
      .optional(),
  }),
  output: z.object({
    team: z.object({ id: z.uuid(), name: z.string() }),
    teams: z.array(z.object({ id: z.uuid(), name: z.string() })),
    leaveType: z.string(),
    start: z.string(),
    people: z.array(
      z.object({
        memberId: z.uuid(),
        name: z.object({ untrusted_text: z.string() }),
        atRisk: z.number().describe('Days that would be forfeited without a plan.'),
        deadline: z.string(),
        placed: z.number(),
        stillLost: z.number().describe('Includes any fraction of a day the plan cannot place as whole days.'),
        days: z.array(z.string()),
        blocks: z.array(block).describe('Runs of days off each planned day belongs to, including weekends and holidays.'),
        requests: z.array(z.object({ start: z.string(), end: z.string() })).describe('The planned days as bookable ranges (pass these to sendPlanProposals).'),
        shortfallReason: z.string().nullable(),
      }),
    ),
    totals: z.object({ atRisk: z.number(), placed: z.number(), stillLost: z.number() }),
    exact: z.boolean().describe('True when the plan provably forfeits the minimum possible.'),
    rules: z.array(z.object({ id: z.uuid(), label: z.string() })),
    heatmap: z.array(
      z.object({
        date: z.string(),
        out: z.number(),
        planned: z.number(),
        rules: z.array(z.object({ ruleId: z.string(), required: z.number(), present: z.number(), slackLeft: z.number() })),
      }),
    ),
    summary: z.object({ text: z.string(), source: z.enum(['ai', 'demo', 'rules']) }),
    stats: z.object({ ms: z.number(), stoppedEarly: z.boolean() }),
  }),
  scope: 'planner:run',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'planner',
  surfaces: ['ui', 'rest', 'mcp', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const { team, teams: allowed } = await plannableTeam(db, actor, input.teamId);
    const type = await getLeaveTypeByKey(db, actor.orgId, input.leaveType);
    const today = isoDate(now);
    const start = input.start && input.start > today ? input.start : addDays(today, 1);
    const roster = await db
      .select()
      .from(members)
      .where(and(eq(members.orgId, actor.orgId), eq(members.teamId, team.id), isNull(members.deletedAt)))
      .orderBy(asc(members.name));

    // Days at risk per person: the next scheduled forfeiture in the coming year.
    const horizon = addDays(today, 366);
    const risk = new Map<string, { amount: number; deadline: string }>();
    for (const m of roster) {
      if (!type.countsAgainstBalance) break;
      const { projection: p } = await balanceView(db, actor.orgId, m, type, today, [], { includePending: true });
      if (p.unlimited) continue;
      // Carried days expiring this year show up in the timeline; year-end loss in yearEnd.
      const f = p.timeline.find((t) => t.kind === 'forfeiture' && t.source === 'scheduled' && t.date > today && t.date <= horizon && t.amount < 0);
      const at = f
        ? { amount: -f.amount, deadline: addDays(f.date, -1) }
        : p.yearEnd && p.yearEnd.wouldForfeit > 0
          ? { amount: p.yearEnd.wouldForfeit, deadline: p.yearEnd.yearEnd }
          : null;
      if (!at) continue;
      const perDay = p.unit === 'hours' ? Number(m.hoursPerDay) : 1;
      risk.set(m.id, { amount: Math.round((at.amount / perDay) * 100) / 100, deadline: at.deadline });
    }
    const lastDeadline = [...risk.values()].reduce((mx, r) => (r.deadline > mx ? r.deadline : mx), start);

    const coverage = await teamCoverageMembers(db, actor.orgId, team.id, start, lastDeadline);
    const hard = await db
      .select()
      .from(blackouts)
      .where(and(eq(blackouts.orgId, actor.orgId), eq(blackouts.hard, true), or(isNull(blackouts.teamId), eq(blackouts.teamId, team.id)), lte(blackouts.startDate, lastDeadline), gte(blackouts.endDate, start)));
    const blocked = new Set(hard.flatMap((b) => rangeISO(b.startDate, b.endDate)));
    const prefs = new Map((input.preferences ?? []).map((p) => [p.memberId, p]));
    const planMembers: PlannerMember[] = coverage.map((c) => {
      const r = risk.get(c.id);
      const pref = prefs.get(c.id);
      return {
        ...c,
        need: r ? Math.floor(r.amount) : 0,
        deadline: r?.deadline ?? start,
        unavailable: blocked,
        preferMonths: pref?.preferMonths,
        avoid: pref?.avoid ? new Set(pref.avoid.flatMap((a) => rangeISO(a.start, a.end))) : undefined,
      };
    });
    const rules = await db.select().from(coverageRules).where(and(eq(coverageRules.orgId, actor.orgId), eq(coverageRules.teamId, team.id)));
    const result = planTeam({
      members: planMembers,
      rules: rules.map((x) => ({ id: x.id, teamId: x.teamId, minPresent: x.minPresent, tag: x.tag, weekdays: x.weekdays, effectiveFrom: x.effectiveFrom, effectiveTo: x.effectiveTo })),
      start,
      timeBudgetMs: 1_500,
    });

    const name = new Map(roster.map((m) => [m.id, m.name]));
    const people = result.plans.map((p) => {
      const r = risk.get(p.memberId)!;
      return {
        memberId: p.memberId,
        name: { untrusted_text: name.get(p.memberId) ?? '' },
        atRisk: r.amount,
        deadline: r.deadline,
        placed: p.placed,
        stillLost: Math.round((r.amount - p.placed) * 100) / 100,
        days: p.days,
        blocks: p.blocks,
        requests: p.requests,
        shortfallReason: p.shortfallReason ?? (r.amount % 1 ? `${Math.round((r.amount % 1) * 100) / 100} of a day is left over; book it as part of a day.` : null),
      };
    });
    // Fully booked people with fractional risk only (need 0) are still worth showing.
    for (const [id, r] of risk) {
      if (people.some((p) => p.memberId === id)) continue;
      people.push({ memberId: id, name: { untrusted_text: name.get(id) ?? '' }, atRisk: r.amount, deadline: r.deadline, placed: 0, stillLost: r.amount, days: [], blocks: [], requests: [], shortfallReason: 'Less than a whole day; book it as part of a day.' });
    }
    people.sort((a, b) => (a.name.untrusted_text < b.name.untrusted_text ? -1 : 1));
    const totals = {
      atRisk: Math.round(people.reduce((s, p) => s + p.atRisk, 0) * 100) / 100,
      placed: result.totalPlaced,
      stillLost: Math.round(people.reduce((s, p) => s + p.stillLost, 0) * 100) / 100,
    };

    let tightest: { date: string; slack: number } | null = null;
    for (const h of result.heatmap) {
      for (const r of h.rules) if (!tightest || r.slackLeft < tightest.slack) tightest = { date: h.date, slack: r.slackLeft };
    }
    const facts: PlanFacts = {
      leaveTypeName: type.name,
      unit: 'days',
      people: people.length,
      daysAtRisk: totals.atRisk,
      daysPlaced: totals.placed,
      daysStillLost: totals.stillLost,
      peopleFullyPlaced: people.filter((p) => p.stillLost === 0).length,
      longestBreakDays: Math.max(0, ...people.flatMap((p) => p.blocks.map((b) => b.daysOff))),
      latestDeadline: people.length ? lastDeadline : null,
      tightestDate: tightest && tightest.slack === 0 ? tightest.date : null,
      exact: result.exact,
    };
    let summary: { text: string; source: 'ai' | 'demo' | 'rules' } = { text: templatePlanSummary(facts).text, source: 'rules' };
    if (people.length) {
      try {
        const r = await runAiTask(db, actor.orgId, summarizePlanTask, facts, now);
        if (untracedIn(r.output.text, facts).length === 0) summary = { text: r.output.text, source: r.model === 'mock' ? 'demo' : 'ai' };
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err;
      }
    }

    return {
      team: { id: team.id, name: team.name },
      teams: allowed.map((t) => ({ id: t.id, name: t.name })),
      leaveType: type.key,
      start,
      people,
      totals,
      exact: result.exact,
      rules: rules.map((r) => ({ id: r.id, label: `At least ${r.minPresent} ${r.tag ? `${r.tag}${r.minPresent === 1 ? '' : 's'}` : r.minPresent === 1 ? 'person' : 'people'} in` })),
      heatmap: result.heatmap,
      summary,
      stats: { ms: Math.round(result.stats.ms), stoppedEarly: result.stats.stoppedEarly },
    };
  },
});

const proposalPayload = z.object({
  leaveType: z.string(),
  blocks: z.array(z.object({ start: z.iso.date(), end: z.iso.date() })).min(1).max(20),
  deadline: z.iso.date(),
});

export const sendPlanProposals = defineCapability({
  name: 'sendPlanProposals',
  description:
    'Offers planned leave to people as proposals they can accept (which submits normal leave requests, ' +
    're-checked by the engine) or change. Nothing is booked until each person accepts. Re-sending the ' +
    'same plan does not duplicate open proposals.',
  input: z.object({
    teamId: z.uuid(),
    leaveType: z.string().min(1).max(64).default('vacation'),
    proposals: z.array(z.object({ memberId: z.uuid(), blocks: z.array(z.object({ start: z.iso.date(), end: z.iso.date() })).min(1).max(20), deadline: z.iso.date() })).min(1).max(200),
  }),
  output: z.object({ sent: z.number().int(), alreadyOpen: z.number().int() }),
  scope: 'planner:run',
  roles: ['owner', 'admin', 'manager'],
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'mcp', 'assistant'],
  audit: (_i, o) => `Sent ${o.sent} leave plan proposal(s)`,
  async handler({ db, actor, now }, input) {
    const { team } = await plannableTeam(db, actor, input.teamId);
    const type = await getLeaveTypeByKey(db, actor.orgId, input.leaveType);
    const roster = new Set(
      (await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, actor.orgId), eq(members.teamId, team.id), isNull(members.deletedAt)))).map((m) => m.id),
    );
    let sent = 0;
    let alreadyOpen = 0;
    for (const p of input.proposals) {
      if (!roster.has(p.memberId)) throw new CapabilityError('not_found', 'Member not found in this team.');
      if (p.blocks.some((b) => b.end < b.start)) throw new CapabilityError('invalid_input', 'Each block must end on or after its start.');
      const payload = { leaveType: type.key, blocks: p.blocks.map((b) => ({ start: b.start, end: b.end })), deadline: p.deadline };
      const open = await db
        .select()
        .from(drafts)
        .where(and(eq(drafts.orgId, actor.orgId), eq(drafts.addressedToMemberId, p.memberId), eq(drafts.capability, 'acceptPlanProposal'), eq(drafts.status, 'open')));
      // jsonb does not keep key order, so compare a canonical form.
      const canon = (x: unknown) => {
        const v = proposalPayload.parse(x);
        return JSON.stringify([v.leaveType, v.deadline, v.blocks.map((b) => [b.start, b.end])]);
      };
      if (open.some((d) => canon(d.payload) === canon(payload))) {
        alreadyOpen++;
        continue;
      }
      const { hash } = newToken('prop');
      await db.insert(drafts).values({
        orgId: actor.orgId,
        capability: 'acceptPlanProposal',
        payload,
        summary: `Suggested ${type.name.toLowerCase()}: ${payload.blocks.map((b) => (b.start === b.end ? b.start : `${b.start} to ${b.end}`)).join(', ')}`,
        addressedToMemberId: p.memberId,
        createdByActorType: actor.type,
        createdByClientId: actor.clientId,
        confirmationTokenHash: hash,
        expiresAt: new Date(`${addDays(p.deadline, 1)}T00:00:00Z`) > now ? new Date(`${addDays(p.deadline, 1)}T00:00:00Z`) : new Date(now.getTime() + 86_400_000),
      });
      sent++;
    }
    return { sent, alreadyOpen };
  },
});

const proposalView = z.object({
  id: z.uuid(),
  summary: z.string(),
  leaveType: z.string(),
  blocks: z.array(z.object({ start: z.string(), end: z.string() })),
  deadline: z.string(),
  expiresAt: z.string(),
});

export const listMyProposals = defineCapability({
  name: 'listMyProposals',
  description: "Lists open leave proposals addressed to the member (from a manager's team plan). Reads only.",
  input: z.object({}),
  output: z.object({ proposals: z.array(proposalView) }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor, now }) {
    const me = await subjectMember(db, actor);
    const rows = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.orgId, actor.orgId), eq(drafts.addressedToMemberId, me.id), eq(drafts.capability, 'acceptPlanProposal'), eq(drafts.status, 'open'), gte(drafts.expiresAt, now)))
      .orderBy(asc(drafts.createdAt));
    return {
      proposals: rows.map((d) => {
        const p = proposalPayload.parse(d.payload);
        return { id: d.id, summary: d.summary, leaveType: p.leaveType, blocks: p.blocks, deadline: p.deadline, expiresAt: d.expiresAt.toISOString() };
      }),
    };
  },
});

export const respondToProposal = defineCapability({
  name: 'respondToProposal',
  description:
    'Accepts or dismisses one of the member’s own leave proposals. Accepting submits one normal leave ' +
    'request per block (same checks as submitLeaveRequest; blocks that no longer fit are reported, not ' +
    'booked). Repeating an accept is safe.',
  input: z.object({ proposalId: z.uuid(), response: z.enum(['accept', 'dismiss']) }),
  output: z.object({
    status: z.enum(['confirmed', 'rejected']),
    submitted: z.array(z.object({ start: z.string(), end: z.string(), status: z.string() })),
    failed: z.array(z.object({ start: z.string(), end: z.string(), reason: z.string() })),
  }),
  scope: 'leave:request',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: (i, o) => `${i.response === 'accept' ? 'Accepted' : 'Dismissed'} a leave proposal (${o.submitted.length} request(s))`,
  async handler(ctx, input) {
    const { db, actor } = ctx;
    const me = await subjectMember(db, actor);
    const [d] = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.orgId, actor.orgId), eq(drafts.id, input.proposalId), eq(drafts.addressedToMemberId, me.id), eq(drafts.capability, 'acceptPlanProposal')));
    if (!d) throw new CapabilityError('not_found', 'Proposal not found.');
    const p = proposalPayload.parse(d.payload);
    if (input.response === 'dismiss') {
      if (d.status === 'open') await db.update(drafts).set({ status: 'rejected' }).where(eq(drafts.id, d.id));
      return { status: 'rejected' as const, submitted: [], failed: [] };
    }
    if (d.status === 'rejected') throw new CapabilityError('conflict', 'This proposal was dismissed.');
    const submitted: Array<{ start: string; end: string; status: string }> = [];
    const failed: Array<{ start: string; end: string; reason: string }> = [];
    for (const [i, b] of p.blocks.entries()) {
      try {
        // Loaded here: the registry imports this module, so a top-level import would be circular.
        const { invokeCapability } = await import('../registry');
        const r = await invokeCapability('submitLeaveRequest', ctx, { leaveType: p.leaveType, start: b.start, end: b.end, idempotencyKey: `proposal-${d.id}-${i}` });
        submitted.push({ start: b.start, end: b.end, status: r.request.status });
      } catch (err) {
        if (!(err instanceof CapabilityError)) throw err;
        failed.push({ start: b.start, end: b.end, reason: err.message });
      }
    }
    if (d.status === 'open') await db.update(drafts).set({ status: 'confirmed' }).where(eq(drafts.id, d.id));
    return { status: 'confirmed' as const, submitted, failed };
  },
});
