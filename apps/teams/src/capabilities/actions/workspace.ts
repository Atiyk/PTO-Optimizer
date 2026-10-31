import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { absenceReport, type ReportAbsence } from '@daysoff/engine/leave/report';
import { dateOption, suggestEventDates, type EventAttendee } from '@daysoff/engine/leave/events';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { LeavePolicy } from '@daysoff/engine/leave/policy';
import { AiUnavailableError, runAiTask } from '@/ai/run';
import { absenceReportTask, templateReport, untracedReport, type ReportFacts } from '@/ai/tasks/absenceReport';
import { answerPolicyQuestionTask, templatePolicyAnswer, untracedPolicy, type PolicyFacts } from '@/ai/tasks/answerPolicyQuestion';
import {
  groups,
  hoursWorked,
  leaveRequests,
  leaveTypes,
  locations,
  memberLocationHistory,
  members,
  msteamsTenants,
  profileChangeRequests,
  teamEvents,
  teams,
} from '@/db/schema';
import { eventIncludes, groupIdsByMember, groupIdsFor, loadRules, othersOut } from '@/domain/automations';
import { describePolicy } from '@/domain/describePolicy';
import { balanceView, forfeitureRisk, getMember, isoDate, memberHolidays, policiesFor, type MemberRow } from '@/domain/leave';
import { approvalRoute } from '@/domain/routing';
import { msTeamsConfigured } from '@/msteams/api';
import { CapabilityError } from '../errors';
import { actingMemberId, isAdmin, managesMember, subjectMember, untrusted } from '../helpers';
import { defineCapability } from '../types';
import { aiStatus } from './ai';

/*
 * Reports, policy questions, team events, employee data updates and the Microsoft Teams link.
 * Every number comes from packages/engine; the AI only rewords engine facts (D1).
 */

const usedFor = (model: string) => (model === 'mock' ? ('demo' as const) : ('ai' as const));
const MANAGERS = ['owner', 'admin', 'manager'] as const;
const ADMINS = ['owner', 'admin'] as const;

/** The members a caller may report on: everyone for admins, the people they manage for managers. */
async function reportableMembers(db: Parameters<typeof getMember>[0], actor: Parameters<typeof managesMember>[1]): Promise<MemberRow[]> {
  const all = await db.select().from(members).where(and(eq(members.orgId, actor.orgId), isNull(members.deletedAt)));
  if (isAdmin(actor)) return all;
  const out: MemberRow[] = [];
  for (const m of all) if (m.id !== actingMemberId(actor) && (await managesMember(db, actor, m))) out.push(m);
  return out;
}

// ── Absence report ───────────────────────────────────────────────────────────

const reportInput = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  teamId: z.uuid().optional(),
  groupId: z.uuid().optional(),
});

const bucket = z.object({ key: z.string(), label: z.string(), days: z.number(), requests: z.number() });
const reportOutput = z.object({
  from: z.string(),
  to: z.string(),
  headcount: z.number(),
  totals: z.object({ approvedDays: z.number(), pendingDays: z.number(), requests: z.number(), peopleWithLeave: z.number(), daysPerPerson: z.number() }),
  byType: z.array(bucket),
  byTeam: z.array(bucket),
  byGroup: z.array(bucket),
  byMonth: z.array(bucket),
  peakDays: z.array(z.object({ date: z.string(), away: z.number() })),
  approval: z.object({ decided: z.number(), approved: z.number(), declined: z.number(), approvalRatePct: z.number().nullable(), medianDaysToDecide: z.number().nullable() }),
  medianLeadDays: z.number().nullable(),
  hoursWorked: z.object({ total: z.number(), people: z.number() }).nullable(),
  forfeitRisk: z.array(z.object({ memberId: z.string(), name: z.object({ untrusted_text: z.string() }), amount: z.number(), unit: z.enum(['days', 'hours']) })),
});

async function buildReport(ctx: Parameters<typeof getAbsenceReport.handler>[0], input: z.infer<typeof reportInput>) {
  const { db, actor, now } = ctx;
  if (input.to < input.from) throw new CapabilityError('invalid_input', 'The end date must be on or after the start date.');
  if (rangeISO(input.from, input.to).length > 400) throw new CapabilityError('invalid_input', 'A report covers at most 400 days.');
  const orgId = actor.orgId;
  if (input.teamId && !(await db.select({ id: teams.id }).from(teams).where(and(eq(teams.orgId, orgId), eq(teams.id, input.teamId)))).length) {
    throw new CapabilityError('not_found', 'Team not found.');
  }
  if (input.groupId && !(await db.select({ id: groups.id }).from(groups).where(and(eq(groups.orgId, orgId), eq(groups.id, input.groupId)))).length) {
    throw new CapabilityError('not_found', 'Group not found.');
  }
  const groupMap = await groupIdsByMember(db, orgId);
  let people = await reportableMembers(db, actor);
  if (input.teamId) people = people.filter((m) => m.teamId === input.teamId);
  if (input.groupId) people = people.filter((m) => (groupMap.get(m.id) ?? []).includes(input.groupId!));
  const ids = people.map((m) => m.id);
  const rows = ids.length
    ? await db
        .select({ r: leaveRequests, t: leaveTypes })
        .from(leaveRequests)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
        .where(and(eq(leaveRequests.orgId, orgId), inArray(leaveRequests.memberId, ids), lte(leaveRequests.startDate, input.to), gte(leaveRequests.endDate, input.from)))
    : [];
  // Also count decisions made in the window for requests dated outside it.
  const byId = new Map(people.map((m) => [m.id, m]));
  const absences: ReportAbsence[] = rows.map(({ r, t }) => {
    const snap = r.engineSnapshot as { amount?: number; unit?: string; chargedDates?: string[] } | null;
    const m = byId.get(r.memberId)!;
    const charged = snap?.chargedDates ?? [];
    const days = snap?.unit === 'hours' ? (snap.amount ?? 0) / (Number(m.hoursPerDay) || 8) : (snap?.amount ?? charged.length);
    return {
      memberId: r.memberId,
      teamId: m.teamId,
      groupIds: groupMap.get(r.memberId) ?? [],
      leaveTypeName: t.name,
      isHealthRelated: t.isHealthRelated,
      status: r.status === 'draft' ? 'pending' : r.status,
      chargedDates: charged,
      days,
      requestedOn: isoDate(r.createdAt),
      decidedOn: r.decidedAt ? isoDate(r.decidedAt) : null,
      start: r.startDate,
    };
  });
  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.orgId, orgId));
  const groupRows = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.orgId, orgId));
  const hw = ids.length
    ? await db.select().from(hoursWorked).where(and(eq(hoursWorked.orgId, orgId), inArray(hoursWorked.memberId, ids), gte(hoursWorked.periodEnd, input.from), lte(hoursWorked.periodEnd, input.to)))
    : [];
  const hoursByMember = new Map<string, number>();
  for (const h of hw) hoursByMember.set(h.memberId, (hoursByMember.get(h.memberId) ?? 0) + Number(h.hours));
  // Year-end forfeiture risk on the main balance types (not health types).
  const today = isoDate(now);
  const types = (await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, orgId), eq(leaveTypes.archived, false)))).filter((t) => t.countsAgainstBalance && !t.isHealthRelated);
  const risk: { memberId: string; name: string; amount: number; unit: 'days' | 'hours' }[] = [];
  for (const m of people.slice(0, 300)) {
    let total = 0;
    for (const t of types) total += (await forfeitureRisk(db, orgId, m, t, today).catch(() => null))?.amount ?? 0;
    if (total > 0) risk.push({ memberId: m.id, name: m.name, amount: Math.round(total * 100) / 100, unit: 'days' });
  }
  const rep = absenceReport({
    from: input.from,
    to: input.to,
    headcount: people.length,
    teams: teamRows,
    groups: groupRows,
    absences,
    hoursWorked: hw.length ? [...hoursByMember].map(([memberId, hours]) => ({ memberId, hours })) : undefined,
    forfeitRisk: risk,
  });
  return rep;
}

export const getAbsenceReport = defineCapability({
  name: 'getAbsenceReport',
  description:
    'Absence report for a date range (managers: the people they approve for; admins: everyone), optionally for one ' +
    'team or group: days by leave type, team, group and month, peak days, approval rate and speed, lead time, hours ' +
    'worked from timesheets, and people on track to lose leave. Health-related leave is one bucket. Engine numbers only.',
  input: reportInput,
  output: reportOutput,
  scope: 'leave:approve',
  roles: MANAGERS,
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'assistant'],
  audit: null,
  async handler(ctx, input) {
    const rep = await buildReport(ctx, input);
    return { ...rep, forfeitRisk: rep.forfeitRisk.map((f) => ({ ...f, name: { untrusted_text: f.name } })) };
  },
});

export const explainAbsenceReport = defineCapability({
  name: 'explainAbsenceReport',
  description:
    'A short written summary (headline and up to five points) of the absence report for a date range, written by ' +
    'Claude from the engine report only. Every number is checked against the report; when one cannot be traced, or ' +
    'AI is off, a fixed template from the same numbers is returned. People are never named.',
  input: reportInput,
  output: z.object({ headline: z.string(), points: z.array(z.string()), source: aiStatus }),
  scope: 'leave:approve',
  roles: MANAGERS,
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'ai',
  surfaces: ['ui', 'rest', 'assistant'],
  audit: null,
  async handler(ctx, input) {
    const rep = await buildReport(ctx, input);
    const { forfeitRisk: fr, ...rest } = rep;
    const scopeName = input.teamId ? 'one team' : input.groupId ? 'one group' : 'everyone you approve for';
    // IDs are left out: they are not facts, and their digits would let invented numbers pass the provenance check.
    const noKey = (b: { label: string; days: number; requests: number }) => ({ key: b.label, label: b.label, days: b.days, requests: b.requests });
    const facts: ReportFacts = { ...rest, byTeam: rest.byTeam.map(noKey), byGroup: rest.byGroup.map(noKey), forfeitRiskPeople: fr.length, scope: scopeName };
    try {
      const r = await runAiTask(ctx.db, ctx.actor.orgId, absenceReportTask, facts, ctx.now);
      const bad = untracedReport(r.output, facts);
      if (!bad.length) return { ...r.output, source: { used: usedFor(r.model), unavailableReason: null } };
      return { ...templateReport(facts), source: { used: 'rules' as const, unavailableReason: `The AI wrote numbers that are not in the report (${bad.slice(0, 3).join(', ')}).` } };
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      return { ...templateReport(facts), source: { used: 'rules' as const, unavailableReason: err.message } };
    }
  },
});

// ── Policy questions ─────────────────────────────────────────────────────────

export const askPolicyQuestion = defineCapability({
  name: 'askPolicyQuestion',
  description:
    "Answers the member's question about their leave policies in a few sentences, from the engine's summary of " +
    'the policies that apply to them, their balances, the org\'s rules (blackouts, probation, limits) and who ' +
    'approves their requests. The question is treated as data. Numbers are checked; a template answers when AI is ' +
    'off. Not legal advice.',
  input: z.object({ question: z.string().min(2).max(300) }),
  output: z.object({ text: z.string(), source: aiStatus }),
  scope: 'policy:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'ai',
  surfaces: ['ui', 'rest', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const me = await subjectMember(db, actor);
    const today = isoDate(now);
    const types = await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, actor.orgId), eq(leaveTypes.archived, false))).orderBy(asc(leaveTypes.createdAt));
    const policies: PolicyFacts['policies'] = [];
    for (const t of types) {
      const versions = await policiesFor(db, actor.orgId, me, t.id);
      const current = versions.filter((v) => v.effectiveFrom <= today).at(-1) ?? versions[0];
      if (!current) continue;
      let balance: number | null = null;
      if (t.countsAgainstBalance) {
        const { projection: p } = await balanceView(db, actor.orgId, me, t, today, [], { includePending: true });
        balance = p.unlimited ? null : p.asOf.balance;
      }
      policies.push({ leaveType: t.name, summary: describePolicy(current.policy as LeavePolicy), balance, unit: (current.policy as LeavePolicy).unit, requiresApproval: t.requiresApproval });
    }
    const myGroups = await groupIdsFor(db, actor.orgId, me.id);
    const { rules } = await loadRules(db, actor.orgId);
    const mine = rules.filter(
      (r) =>
        (r.locationIds.length === 0 || (me.locationId != null && r.locationIds.includes(me.locationId))) &&
        (r.teamIds.length === 0 || (me.teamId != null && r.teamIds.includes(me.teamId))) &&
        (r.groupIds.length === 0 || r.groupIds.some((g) => myGroups.includes(g))) &&
        (r.kind !== 'blackout' || r.end >= today),
    );
    const typeNames = new Map(types.map((t) => [t.key, t.name]));
    const forTypes = (keys: string[]) => (keys.length ? ` (${keys.map((k) => typeNames.get(k) ?? k).join(', ')})` : '');
    const ruleText = mine.slice(0, 12).map((r) =>
      r.kind === 'blackout'
        ? `${r.hard ? 'No leave' : 'Leave is discouraged'} from ${r.start} to ${r.end}${forTypes(r.leaveTypeKeys)}.`
        : r.kind === 'probation'
          ? `Leave${forTypes(r.leaveTypeKeys)} can be taken ${r.minDays} days after the start date.`
          : `At most ${r.maxOut} people from your group can be away on the same day${forTypes(r.leaveTypeKeys)}.`,
    );
    const route = await approvalRoute(db, actor.orgId, me);
    const facts: PolicyFacts = { today, policies, rules: ruleText, approver: route.primary?.name ?? null, question: input.question };
    try {
      const r = await runAiTask(db, actor.orgId, answerPolicyQuestionTask, facts, now);
      const bad = untracedPolicy(r.output.text, facts);
      if (!bad.length) return { text: r.output.text, source: { used: usedFor(r.model), unavailableReason: null } };
      return { text: templatePolicyAnswer(facts).text, source: { used: 'rules' as const, unavailableReason: `The AI wrote numbers that are not in your policy (${bad.slice(0, 3).join(', ')}).` } };
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      return { text: templatePolicyAnswer(facts).text, source: { used: 'rules' as const, unavailableReason: err.message } };
    }
  },
});

// ── Team events ──────────────────────────────────────────────────────────────

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const fromMin = (m: number | null) => (m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

const audience = z.object({
  locationId: z.uuid().nullable().optional(),
  teamIds: z.array(z.uuid()).max(50).default([]),
  groupIds: z.array(z.uuid()).max(50).default([]),
});

async function attendees(db: Parameters<typeof getMember>[0], orgId: string, a: z.infer<typeof audience>, from: string, to: string): Promise<EventAttendee[]> {
  const all = await db.select().from(members).where(and(eq(members.orgId, orgId), isNull(members.deletedAt)));
  const groupMap = await groupIdsByMember(db, orgId);
  const probe = { locationId: a.locationId ?? null, teamIds: a.teamIds, groupIds: a.groupIds } as typeof teamEvents.$inferSelect;
  const who = all.filter((m) => eventIncludes(probe, { locationId: m.locationId, teamId: m.teamId, groupIds: groupMap.get(m.id) ?? [] }));
  const out = await othersOut(db, orgId, from, to);
  const holidaysByLoc = new Map<string, string[]>();
  const res: EventAttendee[] = [];
  for (const m of who) {
    const loc = m.locationId ?? 'none';
    if (!holidaysByLoc.has(loc)) holidaysByLoc.set(loc, [...(await memberHolidays(db, orgId, m, from, to)).keys()]);
    res.push({ id: m.id, workWeek: m.workWeek, outDates: out.filter((o) => o.memberId === m.id).flatMap((o) => o.dates), holidays: holidaysByLoc.get(loc)! });
  }
  return res;
}

async function ensureAudience(db: Parameters<typeof getMember>[0], orgId: string, a: z.infer<typeof audience>) {
  if (a.locationId) {
    const [l] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.orgId, orgId), eq(locations.id, a.locationId)));
    if (!l) throw new CapabilityError('not_found', 'Location not found.');
  }
  if (a.teamIds.length && (await db.select({ id: teams.id }).from(teams).where(and(eq(teams.orgId, orgId), inArray(teams.id, a.teamIds)))).length !== new Set(a.teamIds).size) {
    throw new CapabilityError('not_found', 'Team not found.');
  }
  if (a.groupIds.length && (await db.select({ id: groups.id }).from(groups).where(and(eq(groups.orgId, orgId), inArray(groups.id, a.groupIds)))).length !== new Set(a.groupIds).size) {
    throw new CapabilityError('not_found', 'Group not found.');
  }
}

export const getTeamEvents = defineCapability({
  name: 'getTeamEvents',
  description:
    'Team events (meetings, offsites) in a date range, with how many expected attendees are away on the day. ' +
    'Managers can also ask for the best dates for a new event: the days in a window with the fewest people on ' +
    'leave, off or on a holiday (counts only, no names).',
  input: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
    suggest: audience.extend({ from: z.iso.date(), to: z.iso.date(), includeWeekends: z.boolean().default(false) }).optional(),
  }),
  output: z.object({
    events: z.array(
      z.object({
        id: z.uuid(),
        title: z.object({ untrusted_text: z.string() }),
        date: z.string(),
        start: z.string().nullable(),
        end: z.string().nullable(),
        locationId: z.string().nullable(),
        teamIds: z.array(z.string()),
        groupIds: z.array(z.string()),
        expected: z.number(),
        away: z.number(),
        includesMe: z.boolean(),
      }),
    ),
    suggestions: z.array(z.object({ date: z.string(), available: z.number(), out: z.number(), reasons: z.object({ leave: z.number(), notWorking: z.number(), holiday: z.number() }) })).nullable(),
  }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor }, input) {
    if (input.to < input.from || rangeISO(input.from, input.to).length > 400) throw new CapabilityError('invalid_input', 'Pick a range of at most 400 days.');
    const orgId = actor.orgId;
    const rows = await db.select().from(teamEvents).where(and(eq(teamEvents.orgId, orgId), gte(teamEvents.date, input.from), lte(teamEvents.date, input.to))).orderBy(asc(teamEvents.date));
    const meId = actingMemberId(actor);
    const me = meId ? await getMember(db, orgId, meId).catch(() => null) : null;
    const myGroups = me ? await groupIdsFor(db, orgId, me.id) : [];
    const events = [];
    for (const e of rows) {
      const att = await attendees(db, orgId, { locationId: e.locationId, teamIds: e.teamIds, groupIds: e.groupIds }, e.date, e.date);
      const opt = dateOption(att, e.date);
      events.push({
        id: e.id,
        title: { untrusted_text: e.title },
        date: e.date,
        start: fromMin(e.startMinute),
        end: fromMin(e.endMinute),
        locationId: e.locationId,
        teamIds: e.teamIds,
        groupIds: e.groupIds,
        expected: att.length,
        away: opt.out,
        includesMe: !!me && eventIncludes(e, { locationId: me.locationId, teamId: me.teamId, groupIds: myGroups }),
      });
    }
    let suggestions = null;
    if (input.suggest) {
      if (!actor.role || !(MANAGERS as readonly string[]).includes(actor.role)) throw new CapabilityError('forbidden', 'Only managers and admins can look for event dates.');
      const s = input.suggest;
      if (s.to < s.from || rangeISO(s.from, s.to).length > 92) throw new CapabilityError('invalid_input', 'Look for dates in a window of at most 92 days.');
      await ensureAudience(db, orgId, s);
      const att = await attendees(db, orgId, s, s.from, s.to);
      suggestions = suggestEventDates(att, s.from, s.to, { includeWeekends: s.includeWeekends, limit: 5 }).map(({ outIds: _o, ...rest }) => rest);
    }
    return { events, suggestions };
  },
});

export const manageTeamEvents = defineCapability({
  name: 'manageTeamEvents',
  description:
    'Managers and admins create or delete a team event (title, date, optional times, and who it is for: a site, ' +
    'teams or groups; empty = everyone). Creating returns how many expected attendees are away that day. People ' +
    'with leave on the day see a warning when they request it.',
  input: z.discriminatedUnion('op', [
    audience.extend({ op: z.literal('create'), title: z.string().min(1).max(120), date: z.iso.date(), start: hm.optional(), end: hm.optional() }),
    z.object({ op: z.literal('delete'), eventId: z.uuid() }),
  ]),
  output: z.object({ id: z.uuid(), expected: z.number().optional(), away: z.number().optional() }),
  scope: 'leave:approve',
  roles: MANAGERS,
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'assistant'],
  audit: (i) => (i.op === 'create' ? `Created team event on ${i.date}` : 'Deleted a team event'),
  async handler({ db, actor }, input) {
    const orgId = actor.orgId;
    if (input.op === 'delete') {
      const res = await db.delete(teamEvents).where(and(eq(teamEvents.orgId, orgId), eq(teamEvents.id, input.eventId))).returning();
      if (!res.length) throw new CapabilityError('not_found', 'Event not found.');
      return { id: input.eventId };
    }
    if ((input.start == null) !== (input.end == null)) throw new CapabilityError('invalid_input', 'Give both a start and an end time, or neither.');
    if (input.start && input.end && toMin(input.end) <= toMin(input.start)) throw new CapabilityError('invalid_input', 'The end time must be after the start time.');
    await ensureAudience(db, orgId, input);
    const [e] = await db
      .insert(teamEvents)
      .values({
        orgId,
        title: input.title,
        date: input.date,
        startMinute: input.start ? toMin(input.start) : null,
        endMinute: input.end ? toMin(input.end) : null,
        locationId: input.locationId ?? null,
        teamIds: input.teamIds,
        groupIds: input.groupIds,
        createdByMemberId: actingMemberId(actor),
      })
      .returning();
    const att = await attendees(db, orgId, input, input.date, input.date);
    return { id: e!.id, expected: att.length, away: dateOption(att, input.date).out };
  },
});

// ── Employee data updates ────────────────────────────────────────────────────

const changeView = z.object({
  id: z.uuid(),
  member: z.object({ id: z.uuid(), name: z.object({ untrusted_text: z.string() }) }),
  field: z.enum(['name', 'email', 'location']),
  oldValue: z.object({ untrusted_text: z.string() }).nullable(),
  newValue: z.object({ untrusted_text: z.string() }),
  effectiveFrom: z.string().nullable(),
  status: z.string(),
  requestedAt: z.string(),
});

async function viewChange(db: Parameters<typeof getMember>[0], orgId: string, c: typeof profileChangeRequests.$inferSelect, who: MemberRow) {
  const locName = async (id: string | null) => (id ? ((await db.select({ n: locations.name }).from(locations).where(and(eq(locations.orgId, orgId), eq(locations.id, id))))[0]?.n ?? 'Unknown site') : null);
  const old = c.field === 'location' ? await locName(c.oldValue) : c.oldValue;
  const nu = c.field === 'location' ? await locName(c.newValue) : c.newValue;
  return {
    id: c.id,
    member: { id: who.id, name: { untrusted_text: who.name } },
    field: c.field,
    oldValue: untrusted(old),
    newValue: { untrusted_text: nu ?? '' },
    effectiveFrom: c.effectiveFrom,
    status: c.status,
    requestedAt: c.createdAt.toISOString(),
  };
}

export const requestProfileChange = defineCapability({
  name: 'requestProfileChange',
  description:
    'A person proposes a change to their own name, work email or site (with the date of the move); it applies ' +
    'only when their approver or an admin approves it. Also cancels their own pending change. People only, never agents.',
  input: z.discriminatedUnion('op', [
    z.object({
      op: z.literal('create'),
      field: z.enum(['name', 'email', 'location']),
      value: z.string().trim().min(1).max(200).describe('The new name, the new work email, or the new location id.'),
      effectiveFrom: z.iso.date().optional().describe('location only: the date the move takes effect.'),
    }),
    z.object({ op: z.literal('cancel'), changeId: z.uuid() }),
  ]),
  output: z.object({ id: z.uuid(), status: z.string() }),
  scope: 'leave:request',
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => (i.op === 'create' ? `Proposed a change to their ${i.field}` : 'Cancelled a proposed profile change'),
  async handler({ db, actor, now }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Only the person themselves can propose changes to their record.');
    const me = await subjectMember(db, actor);
    if (input.op === 'cancel') {
      const res = await db
        .update(profileChangeRequests)
        .set({ status: 'cancelled', decidedAt: now })
        .where(and(eq(profileChangeRequests.orgId, actor.orgId), eq(profileChangeRequests.id, input.changeId), eq(profileChangeRequests.memberId, me.id), eq(profileChangeRequests.status, 'pending')))
        .returning();
      if (!res.length) throw new CapabilityError('not_found', 'Pending change not found.');
      return { id: input.changeId, status: 'cancelled' };
    }
    if (input.field === 'name' && input.value.length > 120) throw new CapabilityError('invalid_input', 'A name is at most 120 characters.');
    if (input.field === 'email' && !z.email().safeParse(input.value).success) throw new CapabilityError('invalid_input', 'That is not an email address.');
    if (input.field === 'location' && !input.effectiveFrom) throw new CapabilityError('invalid_input', 'Give the date the move takes effect.');
    if (input.field === 'location') {
      if (!z.uuid().safeParse(input.value).success) throw new CapabilityError('not_found', 'Location not found.');
      const [l] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.orgId, actor.orgId), eq(locations.id, input.value)));
      if (!l) throw new CapabilityError('not_found', 'Location not found.');
    }
    const old = input.field === 'name' ? me.name : input.field === 'email' ? me.email : me.locationId;
    if ((old ?? '') === input.value) throw new CapabilityError('invalid_input', 'That is already your current value.');
    const [c] = await db
      .insert(profileChangeRequests)
      .values({ orgId: actor.orgId, memberId: me.id, field: input.field, oldValue: old, newValue: input.value, effectiveFrom: input.field === 'location' ? input.effectiveFrom : null })
      .returning();
    return { id: c!.id, status: 'pending' };
  },
});

export const getProfileChanges = defineCapability({
  name: 'getProfileChanges',
  description: "The caller's own proposed record changes and, for approvers, the pending changes they can decide.",
  input: z.object({}),
  output: z.object({ mine: z.array(changeView), toDecide: z.array(changeView) }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor }) {
    const orgId = actor.orgId;
    const meId = actingMemberId(actor);
    const rows = await db
      .select({ c: profileChangeRequests, m: members })
      .from(profileChangeRequests)
      .innerJoin(members, eq(members.id, profileChangeRequests.memberId))
      .where(and(eq(profileChangeRequests.orgId, orgId), isNull(members.deletedAt)))
      .orderBy(asc(profileChangeRequests.createdAt));
    const mine = [];
    const toDecide = [];
    for (const { c, m } of rows) {
      if (m.id === meId) mine.push(await viewChange(db, orgId, c, m));
      else if (c.status === 'pending' && actor.scopes.includes('leave:approve') && (await managesMember(db, actor, m))) toDecide.push(await viewChange(db, orgId, c, m));
    }
    return { mine: mine.slice(-10), toDecide };
  },
});

export const decideProfileChange = defineCapability({
  name: 'decideProfileChange',
  description:
    "Approves or declines a person's proposed change to their name, work email or site. Approving applies it (a " +
    'site change keeps the old site before the move date, so holidays stay right). Never your own.',
  input: z.object({ changeId: z.uuid(), decision: z.enum(['approve', 'decline']) }),
  output: z.object({ id: z.uuid(), status: z.string() }),
  scope: 'leave:approve',
  roles: MANAGERS,
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => `${i.decision === 'approve' ? 'Approved' : 'Declined'} a profile change`,
  async handler({ db, actor, now }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'A person decides record changes, not an agent.');
    const orgId = actor.orgId;
    const [c] = await db.select().from(profileChangeRequests).where(and(eq(profileChangeRequests.orgId, orgId), eq(profileChangeRequests.id, input.changeId)));
    if (!c) throw new CapabilityError('not_found', 'Change not found.');
    const who = await getMember(db, orgId, c.memberId);
    if (who.id === actingMemberId(actor)) throw new CapabilityError('forbidden', 'You cannot decide a change to your own record.');
    if (!(await managesMember(db, actor, who))) throw new CapabilityError('not_found', 'Change not found.');
    const status = input.decision === 'approve' ? 'approved' : 'declined';
    if (c.status === status) return { id: c.id, status };
    if (c.status !== 'pending') throw new CapabilityError('conflict', `This change is already ${c.status}.`);
    await db.transaction(async (tx) => {
      await tx.update(profileChangeRequests).set({ status, decidedAt: now, decidedByMemberId: actingMemberId(actor) }).where(eq(profileChangeRequests.id, c.id));
      if (status !== 'approved') return;
      if (c.field === 'name') await tx.update(members).set({ name: c.newValue }).where(and(eq(members.orgId, orgId), eq(members.id, who.id)));
      if (c.field === 'email') await tx.update(members).set({ email: c.newValue }).where(and(eq(members.orgId, orgId), eq(members.id, who.id)));
      if (c.field === 'location') {
        await tx.update(members).set({ locationId: c.newValue }).where(and(eq(members.orgId, orgId), eq(members.id, who.id)));
        await tx.insert(memberLocationHistory).values({ orgId, memberId: who.id, locationId: c.newValue, effectiveFrom: c.effectiveFrom ?? isoDate(now) });
      }
    });
    return { id: c.id, status };
  },
});

// ── Microsoft Teams link ─────────────────────────────────────────────────────

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getMsTeamsConnection = defineCapability({
  name: 'getMsTeamsConnection',
  description: 'Whether this org is linked to a Microsoft 365 tenant for the Days Off Teams app, and whether the bot is configured.',
  input: z.object({}),
  output: z.object({ botConfigured: z.boolean(), tenantId: z.string().nullable() }),
  scope: 'admin',
  roles: ADMINS,
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor }) {
    const [t] = await db.select().from(msteamsTenants).where(eq(msteamsTenants.orgId, actor.orgId));
    return { botConfigured: msTeamsConfigured(), tenantId: t?.tenantId ?? null };
  },
});

export const manageMsTeams = defineCapability({
  name: 'manageMsTeams',
  description: 'Admin-only: link this org to a Microsoft 365 tenant ID (Entra ID → Overview → Tenant ID) so people in that tenant can use the Teams app, or unlink it.',
  input: z.discriminatedUnion('op', [z.object({ op: z.literal('link'), tenantId: z.string().regex(GUID, 'A tenant ID looks like 00000000-0000-0000-0000-000000000000.') }), z.object({ op: z.literal('unlink') })]),
  output: z.object({ tenantId: z.string().nullable() }),
  scope: 'admin',
  roles: ADMINS,
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => (i.op === 'link' ? 'Linked a Microsoft 365 tenant' : 'Unlinked Microsoft Teams'),
  async handler({ db, actor }, input) {
    if (input.op === 'unlink') {
      await db.delete(msteamsTenants).where(eq(msteamsTenants.orgId, actor.orgId));
      return { tenantId: null };
    }
    const tenantId = input.tenantId.toLowerCase();
    const [taken] = await db.select().from(msteamsTenants).where(eq(msteamsTenants.tenantId, tenantId));
    if (taken && taken.orgId !== actor.orgId) throw new CapabilityError('forbidden', 'That Microsoft 365 tenant is already linked to another Days Off workspace.');
    await db.delete(msteamsTenants).where(eq(msteamsTenants.orgId, actor.orgId));
    await db.insert(msteamsTenants).values({ orgId: actor.orgId, tenantId, linkedByMemberId: actor.memberId });
    return { tenantId };
  },
});
