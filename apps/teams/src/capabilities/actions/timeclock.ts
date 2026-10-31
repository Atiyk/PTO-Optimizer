import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { hhmm, localParts, parseHhmm, zonedToUtc } from '@daysoff/engine/coverage/timeBlocks';
import { allowedNext, checkBreaks, foldPunches, overtimeForWeek, workweekStart } from '@daysoff/engine/timeclock/index';
import { LABOR_PACKS, seedPack } from '@daysoff/engine/rulepacks';
import type { Db } from '@/db/client';
import { coverRequests, leaveRequests, locations, memberCredentials, credentials, members, organizations, OVERTIME_POLICIES, timePunches, timesheetApprovals, VERTICALS } from '@/db/schema';
import { coverStatus, localDate, orgShifts } from '@/domain/cover';
import { INDUSTRIES } from '@/domain/industries';
import { getOrg } from '@/domain/leave';
import { memberClockContext, punchesFor, siteWorkRules, syncWeekHours, teamWeek, weekOf, type MemberWeek, type SiteRules } from '@/domain/timeclock';
import { CapabilityError } from '../errors';
import { actingMemberId, isAdmin, untrusted } from '../helpers';
import { defineCapability, type Actor } from '../types';
import { NOT_LEGAL_ADVICE } from './coverage';

/*
 * Time clock, timesheets, work rules and the compliance inbox (time-clock prompt, Part 2).
 * The engine computes every hour, band and issue (D1). Hours only: no pay is computed,
 * stored or exported here. Punching is for people only, never agents.
 */

const isoDay = z.iso.date().describe('YYYY-MM-DD');
const H = 3_600_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const localHm = (ms: number, tz: string) => hhmm(localParts(ms, tz).minute);

export const WORK_RULES_NOTICE = `${NOT_LEGAL_ADVICE} Overtime and break rules here are configurable defaults for flagging and planning; they do not calculate pay.`;

/** Members whose time this actor may see: admins everyone, managers their people and themselves, staff themselves. */
async function visibleMemberIds(db: Db, actor: Actor): Promise<string[]> {
  const me = actingMemberId(actor);
  if (isAdmin(actor)) return (await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, actor.orgId), isNull(members.deletedAt)))).map((r) => r.id);
  if (!me) return [];
  if (actor.role !== 'manager') return [me];
  const [self] = await db.select({ teamId: members.teamId }).from(members).where(and(eq(members.orgId, actor.orgId), eq(members.id, me)));
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.orgId, actor.orgId), isNull(members.deletedAt), or(eq(members.managerId, me), self?.teamId ? eq(members.teamId, self.teamId) : undefined, eq(members.id, me))));
  return rows.map((r) => r.id);
}

function ruleSummary(r: SiteRules) {
  const ot = r.rules.overtime;
  const overtime = ot
    ? [ot.weeklyHours != null ? `over ${ot.weeklyHours} h a week` : null, ot.dailyHours != null ? `over ${ot.dailyHours} h a day` : null].filter(Boolean).join(' or ') + ` at ${ot.multiplier ?? 1.5}×` + (ot.doubleTimeDailyHours != null ? `; over ${ot.doubleTimeDailyHours} h a day at ${ot.doubleTimeMultiplier ?? 2}×` : '') + (ot.seventhDay ? '; 7th day in a row' : '')
    : null;
  const label = r.source.kind === 'federal' ? `${r.source.packName} (default for US sites)` : r.source.kind === 'none' ? 'No overtime or break rules for this site yet' : (r.source.packName ?? '');
  return { label, overtime: overtime ? `Overtime ${overtime}` : null, meals: r.rules.meals.map((m) => m.label), rest: r.rules.rest.map((m) => m.label) };
}

const bandsOut = z.object({ total: z.number(), regular: z.number(), overtime: z.number(), doubleTime: z.number(), multiplier: z.number(), doubleTimeMultiplier: z.number() });
const dayOut = z.object({ date: z.string(), hours: z.number(), regular: z.number(), overtime: z.number(), doubleTime: z.number(), reasons: z.array(z.string()) });
const issueOut = z.object({ date: z.string(), kind: z.string(), detail: z.string(), rule: z.string().nullable() });
const sessionOut = z.object({
  date: z.string(),
  start: z.string(),
  end: z.string().nullable(),
  workedHours: z.number(),
  meals: z.array(z.object({ start: z.string(), end: z.string().nullable() })),
  restBreaksOwed: z.number(),
  restBreaksTaken: z.boolean().nullable(),
  issues: z.array(z.string()),
});

function citeOf(p: { citation?: { regulation: string; section: string } | null; basis: string; needsVerification?: boolean }): string | null {
  if (p.basis === 'org_policy') return 'your policy';
  if (p.needsVerification) return 'needs verification';
  return p.citation ? `${p.citation.regulation} ${p.citation.section}` : null;
}

function weekView(mw: MemberWeek) {
  const tz = mw.member.tz;
  const issues: z.infer<typeof issueOut>[] = [];
  for (const s of mw.week.sessions) for (const i of s.issues) issues.push({ date: s.session.date, kind: i.kind, detail: i.detail, rule: citeOf(i.provenance as never) });
  for (const a of mw.week.anomalies) issues.push({ date: localParts(a.at, tz).date, kind: a.kind, detail: a.detail, rule: null });
  issues.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const sessions = mw.week.sessions.map((v) => ({
    date: v.session.date,
    start: localHm(v.session.start, tz),
    end: v.session.end != null ? localHm(v.session.end, tz) : null,
    workedHours: r2(v.session.workedMinutes / 60),
    meals: v.session.breaks.filter((b) => b.kind === 'meal').map((b) => ({ start: localHm(b.start, tz), end: b.end != null ? localHm(b.end, tz) : null })),
    restBreaksOwed: v.restBreaksOwed,
    restBreaksTaken: v.session.restBreaksTaken,
    issues: v.issues.map((i) => i.detail),
  }));
  const b = mw.week.bands;
  return { bands: { total: b.total, regular: b.regular, overtime: b.overtime, doubleTime: b.doubleTime, multiplier: b.multiplier, doubleTimeMultiplier: b.doubleTimeMultiplier }, days: b.days, issues, sessions };
}

/* ------------------------------------------------------------------ my clock */

const myClockOut = z.object({
  enabled: z.boolean(),
  today: z.string(),
  state: z.enum(['off', 'working', 'on_break']),
  allowed: z.array(z.enum(['in', 'out', 'break_start', 'break_end'])),
  /** Local HH:MM of the clock-in / break start, when on the clock. */
  since: z.string().nullable(),
  sinceMs: z.number().nullable(),
  breakSince: z.string().nullable(),
  breakKind: z.enum(['meal', 'rest']).nullable(),
  workedMinutes: z.number(),
  mealsDue: z.array(z.object({ label: z.string(), minutes: z.number(), dueBy: z.string().nullable(), taken: z.boolean() })),
  restBreaksSoFar: z.number(),
  askRestAttestation: z.boolean(),
  week: z.object({ weekStart: z.string(), weekEnd: z.string(), bands: bandsOut, days: z.array(dayOut), sessions: z.array(sessionOut), issues: z.array(issueOut) }),
  rules: z.object({ label: z.string(), overtime: z.string().nullable(), meals: z.array(z.string()), rest: z.array(z.string()) }),
  notice: z.string(),
});

async function myClock(db: Db, actor: Actor, now: Date, weekDate?: string): Promise<z.infer<typeof myClockOut>> {
  const me = actingMemberId(actor);
  if (!me) throw new CapabilityError('forbidden', 'Only a member has a time clock.');
  const org = await getOrg(db, actor.orgId);
  const [ctx] = await memberClockContext(db, actor.orgId, [me]);
  if (!ctx) throw new CapabilityError('not_found', 'Member not found.');
  const today = localDate(now, ctx.tz);
  const weekStart = workweekStart(weekDate ?? today);
  const [mw] = await teamWeek(db, actor.orgId, weekStart, now, [me]);
  // The live state comes from the last two days of punches, whatever week is shown.
  const recent = (await punchesFor(db, actor.orgId, [me], new Date(now.getTime() - 48 * H), new Date(now.getTime() + 60_000))).get(me) ?? [];
  const fold = foldPunches(recent, { tz: ctx.tz, now: now.getTime() });
  const cur = fold.current;
  const openBreak = cur?.breaks.find((b) => b.end === null) ?? null;
  const rules = mw!.rules;
  const check = cur ? checkBreaks(cur, { meals: rules.rules.meals, rest: rules.rules.rest }, ctx.tz, now.getTime()) : null;
  const mealsTaken = cur?.breaks.filter((b) => b.kind === 'meal').length ?? 0;
  const v = weekView(mw!);
  return {
    enabled: org.timeClockEnabled,
    today,
    state: fold.state,
    allowed: allowedNext(fold.state),
    since: cur ? localHm(cur.start, ctx.tz) : null,
    sinceMs: cur?.start ?? null,
    breakSince: openBreak ? localHm(openBreak.start, ctx.tz) : null,
    breakKind: openBreak?.kind ?? null,
    workedMinutes: cur?.workedMinutes ?? 0,
    mealsDue: (check?.meals ?? []).map((m) => ({ label: m.label, minutes: m.minutes, dueBy: m.dueBy != null ? localHm(m.dueBy, ctx.tz) : null, taken: mealsTaken >= m.nth })),
    restBreaksSoFar: check?.restBreaks ?? 0,
    askRestAttestation: rules.rules.rest.length > 0,
    week: { weekStart, weekEnd: addDays(weekStart, 6), ...v },
    rules: ruleSummary(rules),
    notice: WORK_RULES_NOTICE,
  };
}

export const getMyTimeClock = defineCapability({
  name: 'getMyTimeClock',
  description: 'Your time clock: whether you are clocked in or on a break, meal breaks due today, and this week’s hours split into regular and overtime bands by your site’s rules. Reads only.',
  input: z.object({ week: isoDay.optional().describe('Any date in the week to show; defaults to this week.') }),
  output: myClockOut,
  scope: 'time:clock',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }, input) {
    return myClock(db, actor, now, input.week);
  },
});

export const clockPunch = defineCapability({
  name: 'clockPunch',
  description:
    'Clock in, start or end a break, or clock out, at this moment (the server’s time; no back-dating). People only: an ' +
    'agent can never clock anyone in or out. At clock-out at sites with rest-break rules, say whether you got your rest ' +
    'breaks. Hours sync to your timesheet automatically.',
  input: z.object({
    op: z.enum(['in', 'out', 'break_start', 'break_end']),
    breakKind: z.enum(['meal', 'rest']).default('meal').describe('For break_start: meal (unpaid) or rest (paid).'),
    restBreaksTaken: z.boolean().nullable().optional().describe('At clock-out: did you get your rest breaks?'),
    idempotencyKey: z.string().min(8).max(100).describe('Unique per tap, so a retry does not punch twice.'),
  }),
  output: myClockOut,
  scope: 'time:clock',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => ({ in: 'Clocked in', out: 'Clocked out', break_start: 'Started a break', break_end: 'Ended a break' })[i.op],
  async handler({ db, actor, now }, input) {
    const me = actingMemberId(actor);
    if (!me) throw new CapabilityError('forbidden', 'Only a member can clock in or out.');
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Clocking in or out is for people only. Open the app to punch.');
    const org = await getOrg(db, actor.orgId);
    if (!org.timeClockEnabled) throw new CapabilityError('forbidden', 'The time clock is off for this workspace. An admin can turn it on under Admin → Work rules.');
    const [dup] = await db.select({ id: timePunches.id }).from(timePunches).where(and(eq(timePunches.orgId, actor.orgId), eq(timePunches.memberId, me), eq(timePunches.idempotencyKey, input.idempotencyKey)));
    if (dup) return myClock(db, actor, now);
    const [ctx] = await memberClockContext(db, actor.orgId, [me]);
    const recent = (await punchesFor(db, actor.orgId, [me], new Date(now.getTime() - 48 * H), new Date(now.getTime() + 60_000))).get(me) ?? [];
    const fold = foldPunches(recent, { tz: ctx!.tz, now: now.getTime() });
    if (!allowedNext(fold.state).includes(input.op)) {
      const where = { off: 'You are clocked out', working: 'You are clocked in', on_break: 'You are on a break' }[fold.state];
      throw new CapabilityError('conflict', `${where}, so you can’t ${input.op.replace('_', ' ')} now. Allowed: ${allowedNext(fold.state).join(', ')}.`);
    }
    await db.insert(timePunches).values({
      orgId: actor.orgId,
      memberId: me,
      locationId: ctx!.locationId,
      kind: input.op,
      breakKind: input.op === 'break_start' ? input.breakKind : null,
      at: now,
      source: 'self',
      restBreaksTaken: input.op === 'out' ? (input.restBreaksTaken ?? null) : null,
      idempotencyKey: input.idempotencyKey,
      createdByMemberId: me,
    });
    if (input.op === 'out' && fold.current) await syncWeekHours(db, actor.orgId, me, workweekStart(fold.current.date), now);
    return myClock(db, actor, now);
  },
});

/* ------------------------------------------------------------------ timesheets */

const personOut = z.object({
  memberId: z.string(),
  name: z.object({ untrusted_text: z.string() }).nullable(),
  employmentType: z.enum(['salaried', 'hourly']),
  bands: bandsOut,
  days: z.array(dayOut),
  sessions: z.array(sessionOut),
  issues: z.array(issueOut),
  openNow: z.boolean(),
  approval: z.object({ approvedAt: z.string(), stale: z.boolean() }).nullable(),
  rules: z.string(),
  /** Only when one member is asked for: the raw punches, for corrections. */
  punches: z
    .array(z.object({ id: z.string(), kind: z.string(), breakKind: z.string().nullable(), date: z.string(), time: z.string(), source: z.string(), note: z.object({ untrusted_text: z.string() }).nullable() }))
    .optional(),
});

export const getTimesheets = defineCapability({
  name: 'getTimesheets',
  description:
    'Timesheets for one workweek: each person’s clocked hours per day split into regular, overtime and double-time ' +
    'bands by their site’s rules, meal/rest break issues, missed clock-outs and approval status. Managers see their ' +
    'people, staff see themselves. Hours only, never pay. Quote these numbers; never compute hours yourself.',
  input: z.object({ week: isoDay.optional().describe('Any date in the workweek (Monday–Sunday); defaults to this week.'), memberId: z.uuid().optional() }),
  output: z.object({ weekStart: z.string(), weekEnd: z.string(), people: z.array(personOut), totals: bandsOut.omit({ multiplier: true, doubleTimeMultiplier: true }), notice: z.string() }),
  scope: 'time:clock',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const visible = await visibleMemberIds(db, actor);
    if (input.memberId && !visible.includes(input.memberId)) throw new CapabilityError('not_found', 'Member not found.');
    const ids = input.memberId ? [input.memberId] : visible;
    const tzRow = (await memberClockContext(db, actor.orgId, ids.slice(0, 1)))[0];
    const weekStart = workweekStart(input.week ?? localDate(now, tzRow?.tz ?? 'UTC'));
    const weeks = await teamWeek(db, actor.orgId, weekStart, now, ids);
    const approvals = ids.length
      ? await db.select().from(timesheetApprovals).where(and(eq(timesheetApprovals.orgId, actor.orgId), eq(timesheetApprovals.weekStart, weekStart), inArray(timesheetApprovals.memberId, ids)))
      : [];
    const notes = input.memberId
      ? new Map((await db.select({ id: timePunches.id, note: timePunches.note, source: timePunches.source }).from(timePunches).where(and(eq(timePunches.orgId, actor.orgId), eq(timePunches.memberId, input.memberId)))).map((r) => [r.id, r]))
      : new Map<string, { note: string | null; source: string }>();
    const people = weeks
      // Show people with hours, or hourly staff (an empty week for them is worth seeing).
      .filter((w) => w.week.sessions.length || w.member.employmentType === 'hourly' || input.memberId)
      .map((w) => {
        const v = weekView(w);
        const a = approvals.filter((x) => x.memberId === w.member.memberId).sort((x, y) => y.approvedAt.getTime() - x.approvedAt.getTime())[0];
        return {
          memberId: w.member.memberId,
          name: untrusted(w.member.name),
          employmentType: w.member.employmentType,
          ...v,
          openNow: w.week.open,
          approval: a ? { approvedAt: a.approvedAt.toISOString(), stale: !!a.supersededAt } : null,
          rules: ruleSummary(w.rules).label,
          ...(input.memberId ? { punches: punchList(w, notes) } : {}),
        };
      });
    const sum = (k: 'total' | 'regular' | 'overtime' | 'doubleTime') => r2(people.reduce((s, p) => s + p.bands[k], 0));
    return { weekStart, weekEnd: addDays(weekStart, 6), people, totals: { total: sum('total'), regular: sum('regular'), overtime: sum('overtime'), doubleTime: sum('doubleTime') }, notice: WORK_RULES_NOTICE };
  },
});

function punchList(w: MemberWeek, notes: Map<string, { note: string | null; source: string }>) {
  const start = w.week.weekStart;
  const end = w.week.weekEnd;
  return w.punches
    .map((p) => ({ p, lp: localParts(p.at, w.member.tz) }))
    .filter(({ lp }) => lp.date >= addDays(start, -1) && lp.date <= addDays(end, 1))
    .map(({ p, lp }) => ({ id: p.id, kind: p.kind, breakKind: p.breakKind ?? null, date: lp.date, time: hhmm(lp.minute), source: notes.get(p.id)?.source ?? 'self', note: untrusted(notes.get(p.id)?.note) }));
}

export const manageTimesheets = defineCapability({
  name: 'manageTimesheets',
  description:
    'Manager actions on timesheets: approve people’s workweeks (a snapshot of the engine’s totals), or correct a punch ' +
    '(void a wrong one and/or add the right one, with a note). Corrections are audited and re-sync hours. People only.',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('approve'), week: isoDay, memberIds: z.array(z.uuid()).min(1).max(500) }),
    z.object({
      op: z.literal('correct'),
      memberId: z.uuid(),
      voidPunchId: z.uuid().optional(),
      add: z
        .object({
          kind: z.enum(['in', 'out', 'break_start', 'break_end']),
          date: isoDay.describe('Local date at the person’s site.'),
          time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM').describe('Local time at the person’s site.'),
          breakKind: z.enum(['meal', 'rest']).optional(),
        })
        .optional(),
      note: z.string().min(3).max(500).describe('Why the correction was made (shown in the audit trail).'),
    }),
  ]),
  output: z.object({ approved: z.number(), corrected: z.boolean(), weekStart: z.string() }),
  scope: 'time:approve',
  roles: ['owner', 'admin', 'manager'],
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i, o) => (i.op === 'approve' ? `Approved ${o.approved} timesheet(s) for the week of ${o.weekStart}` : `Corrected a punch for the week of ${o.weekStart}`),
  async handler({ db, actor, now }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Approving or correcting timesheets is for people only.');
    const visible = new Set(await visibleMemberIds(db, actor));
    const me = actingMemberId(actor);
    if (input.op === 'approve') {
      const ids = input.memberIds.filter((id) => visible.has(id));
      if (ids.length !== input.memberIds.length) throw new CapabilityError('not_found', 'One or more members were not found among the people you manage.');
      if (!isAdmin(actor) && me && ids.includes(me)) throw new CapabilityError('forbidden', 'You can’t approve your own timesheet; ask an admin.');
      const weekStart = workweekStart(input.week);
      const weeks = await teamWeek(db, actor.orgId, weekStart, now, ids);
      let approved = 0;
      for (const w of weeks) {
        if (w.week.open) continue; // a shift still running can’t be approved yet
        const prior = await db
          .select()
          .from(timesheetApprovals)
          .where(and(eq(timesheetApprovals.orgId, actor.orgId), eq(timesheetApprovals.memberId, w.member.memberId), eq(timesheetApprovals.weekStart, weekStart), isNull(timesheetApprovals.supersededAt)));
        const b = w.week.bands;
        if (prior.some((p) => Number(p.totalHours) === b.total && Number(p.overtimeHours) === b.overtime)) {
          approved++;
          continue;
        }
        for (const p of prior) await db.update(timesheetApprovals).set({ supersededAt: now }).where(eq(timesheetApprovals.id, p.id));
        await db.insert(timesheetApprovals).values({
          orgId: actor.orgId,
          memberId: w.member.memberId,
          weekStart,
          totalHours: String(b.total),
          regularHours: String(b.regular),
          overtimeHours: String(b.overtime),
          doubleTimeHours: String(b.doubleTime),
          issueCount: w.week.issueCount,
          approvedByMemberId: me,
          approvedAt: now,
        });
        approved++;
      }
      return { approved, corrected: false, weekStart };
    }
    if (!visible.has(input.memberId)) throw new CapabilityError('not_found', 'Member not found among the people you manage.');
    if (!input.voidPunchId && !input.add) throw new CapabilityError('invalid_input', 'Give voidPunchId, add, or both.');
    const [ctx] = await memberClockContext(db, actor.orgId, [input.memberId]);
    const weeks = new Set<string>();
    if (input.voidPunchId) {
      const [p] = await db.select().from(timePunches).where(and(eq(timePunches.orgId, actor.orgId), eq(timePunches.id, input.voidPunchId), eq(timePunches.memberId, input.memberId), isNull(timePunches.voidedAt)));
      if (!p) throw new CapabilityError('not_found', 'Punch not found (or already corrected).');
      await db.update(timePunches).set({ voidedAt: now, voidedByMemberId: me }).where(eq(timePunches.id, p.id));
      weeks.add(weekOf(p.at, ctx!.tz));
    }
    if (input.add) {
      const at = new Date(zonedToUtc(input.add.date, parseHhmm(input.add.time), ctx!.tz));
      if (at.getTime() > now.getTime() + 60_000) throw new CapabilityError('invalid_input', 'A corrected punch can’t be in the future.');
      await db.insert(timePunches).values({
        orgId: actor.orgId,
        memberId: input.memberId,
        locationId: ctx!.locationId,
        kind: input.add.kind,
        breakKind: input.add.kind === 'break_start' ? (input.add.breakKind ?? 'meal') : null,
        at,
        source: 'correction',
        note: input.note,
        createdByMemberId: me,
      });
      weeks.add(weekOf(at, ctx!.tz));
    }
    for (const w of weeks) await syncWeekHours(db, actor.orgId, input.memberId, w, now);
    return { approved: 0, corrected: true, weekStart: [...weeks][0]! };
  },
});

/* ------------------------------------------------------------------ compliance inbox */

const taskOut = z.object({
  id: z.string(),
  kind: z.enum(['missed_clock_out', 'break_issue', 'overtime_now', 'overtime_projected', 'timesheet_approval', 'credential_expiring', 'leave_approval', 'open_cover']),
  severity: z.enum(['action', 'warning', 'info']),
  title: z.string(),
  detail: z.string(),
  href: z.string(),
  who: z.object({ untrusted_text: z.string() }).nullable(),
  rule: z.string().nullable(),
});

export const getComplianceTasks = defineCapability({
  name: 'getComplianceTasks',
  description:
    'The admin work the system has already found for you: missed clock-outs, meal and rest break issues, people in ' +
    'overtime now or pushed into it by the schedule this week, last week’s timesheets to approve, credentials expiring ' +
    'within 30 days, pending leave approvals and open cover requests. Each task links to where it is fixed. Reads only.',
  input: z.object({}),
  output: z.object({ generatedAt: z.string(), items: z.array(taskOut), counts: z.object({ action: z.number(), warning: z.number(), info: z.number() }), notice: z.string() }),
  scope: 'time:approve',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }) {
    const ids = await visibleMemberIds(db, actor);
    const org = await getOrg(db, actor.orgId);
    const items: z.infer<typeof taskOut>[] = [];
    const people = await memberClockContext(db, actor.orgId, ids);
    const tz = people[0]?.tz ?? 'UTC';
    const today = localDate(now, tz);
    const thisWeek = workweekStart(today);
    const lastWeek = addDays(thisWeek, -7);

    if (org.timeClockEnabled && ids.length) {
      const [cur, prev] = [await teamWeek(db, actor.orgId, thisWeek, now, ids), await teamWeek(db, actor.orgId, lastWeek, now, ids)];
      for (const [weeks, ws] of [[prev, lastWeek], [cur, thisWeek]] as const) {
        for (const w of weeks) {
          const who = untrusted(w.member.name);
          const href = `/app/time?week=${ws}&member=${w.member.memberId}`;
          for (const a of w.week.anomalies) {
            if (a.kind !== 'forgotten_clock_out' && a.kind !== 'missing_clock_out') continue;
            items.push({ id: `clock:${w.member.memberId}:${a.at}`, kind: 'missed_clock_out', severity: 'action', title: 'Missed clock-out', detail: `${a.detail} (${localParts(a.at, w.member.tz).date} from ${localHm(a.at, w.member.tz)})`, href, who, rule: null });
          }
          for (const s of w.week.sessions) {
            for (const i of s.issues) items.push({ id: `brk:${w.member.memberId}:${s.session.start}:${i.ruleId}:${i.kind}`, kind: 'break_issue', severity: 'warning', title: i.kind === 'rest_declined' ? 'Rest breaks not taken' : 'Meal break issue', detail: `${s.session.date}: ${i.detail}`, href, who, rule: citeOf(i.provenance as never) });
          }
        }
      }
      // Overtime now (clocked) and projected (clocked so far + the rest of this week's schedule).
      const sched = await orgShifts(db, actor.orgId, today, addDays(thisWeek, 6));
      for (const w of cur) {
        const ot = w.rules.rules.overtime;
        if (!ot || w.member.employmentType !== 'hourly') continue;
        const who = untrusted(w.member.name);
        const href = `/app/time?week=${thisWeek}&member=${w.member.memberId}`;
        const b = w.week.bands;
        if (b.overtime + b.doubleTime > 0) {
          items.push({ id: `ot:${w.member.memberId}`, kind: 'overtime_now', severity: 'warning', title: 'In overtime this week', detail: `${b.total} h clocked: ${b.overtime} h at ${b.multiplier}×${b.doubleTime ? `, ${b.doubleTime} h at ${b.doubleTimeMultiplier}×` : ''}`, href, who, rule: citeOf(ot.provenance as never) });
          continue;
        }
        const clockedDays = b.days.filter((d) => d.hours > 0).map((d) => ({ date: d.date, hours: d.hours }));
        const workedDates = new Set(clockedDays.map((d) => d.date));
        const future = (sched.get(w.member.memberId) ?? []).filter((s) => !workedDates.has(s.date) && s.date >= today).map((s) => ({ date: s.date, hours: r2((s.interval.end - s.interval.start) / H) }));
        if (!future.length) continue;
        const proj = overtimeForWeek(thisWeek, [...clockedDays, ...future], ot);
        if (proj.overtime + proj.doubleTime > 0) {
          items.push({ id: `otp:${w.member.memberId}`, kind: 'overtime_projected', severity: 'info', title: 'Schedule leads to overtime', detail: `Clocked plus scheduled this week comes to ${proj.total} h: ${proj.overtime} h at ${proj.multiplier}×${proj.doubleTime ? `, ${proj.doubleTime} h at ${proj.doubleTimeMultiplier}×` : ''}. Swap a shift or approve it ahead.`, href: '/app/coverage', who, rule: citeOf(ot.provenance as never) });
        }
      }
      // Last week's timesheets with hours and no standing approval.
      const appr = await db.select().from(timesheetApprovals).where(and(eq(timesheetApprovals.orgId, actor.orgId), eq(timesheetApprovals.weekStart, lastWeek), isNull(timesheetApprovals.supersededAt)));
      const waiting = prev.filter((w) => w.week.sessions.length && !appr.some((a) => a.memberId === w.member.memberId) && w.member.memberId !== actingMemberId(actor));
      if (waiting.length) items.push({ id: `appr:${lastWeek}`, kind: 'timesheet_approval', severity: 'action', title: `Approve last week’s timesheets (${waiting.length})`, detail: `Week of ${lastWeek}: ${waiting.length} ${waiting.length === 1 ? 'person has' : 'people have'} clocked hours waiting for approval.`, href: `/app/time?week=${lastWeek}`, who: null, rule: null });
    }

    // Credentials expiring in the next 30 days (or expired in the last 7).
    if (ids.length) {
      const creds = await db
        .select({ memberId: memberCredentials.memberId, expiresOn: memberCredentials.expiresOn, name: credentials.name })
        .from(memberCredentials)
        .innerJoin(credentials, eq(credentials.id, memberCredentials.credentialId))
        .where(and(eq(memberCredentials.orgId, actor.orgId), inArray(memberCredentials.memberId, ids), gte(memberCredentials.expiresOn, addDays(today, -7)), lte(memberCredentials.expiresOn, addDays(today, 30))));
      const names = new Map(people.map((p) => [p.memberId, p.name]));
      for (const c of creds) {
        const expired = c.expiresOn! <= today;
        items.push({ id: `cred:${c.memberId}:${c.name}`, kind: 'credential_expiring', severity: expired ? 'action' : 'warning', title: expired ? 'Credential expired' : 'Credential expiring', detail: `${c.name} ${expired ? 'expired' : 'expires'} on ${c.expiresOn}`, href: '/app/admin/credentials', who: untrusted(names.get(c.memberId)), rule: null });
      }
      const pending = await db.select({ id: leaveRequests.id }).from(leaveRequests).where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.status, 'pending'), inArray(leaveRequests.memberId, ids.filter((x) => x !== actingMemberId(actor)))));
      if (pending.length) items.push({ id: 'leave', kind: 'leave_approval', severity: 'action', title: `Leave requests to decide (${pending.length})`, detail: `${pending.length} pending ${pending.length === 1 ? 'request' : 'requests'}.`, href: '/app/approvals', who: null, rule: null });
    }
    const reqs = await db.select({ id: coverRequests.id, date: coverRequests.date }).from(coverRequests).where(and(eq(coverRequests.orgId, actor.orgId), gte(coverRequests.date, today)));
    let openCover = 0;
    for (const r of reqs) if ((await coverStatus(db, actor.orgId, r.id)).status === 'open') openCover++;
    if (openCover) items.push({ id: 'cover', kind: 'open_cover', severity: 'info', title: `Open cover requests (${openCover})`, detail: 'Offers are out; nobody has accepted yet.', href: '/app/coverage', who: null, rule: null });

    const rank = { action: 0, warning: 1, info: 2 } as const;
    items.sort((a, b) => rank[a.severity] - rank[b.severity]);
    const count = (s: 'action' | 'warning' | 'info') => items.filter((i) => i.severity === s).length;
    return { generatedAt: now.toISOString(), items, counts: { action: count('action'), warning: count('warning'), info: count('info') }, notice: WORK_RULES_NOTICE };
  },
});

/* ------------------------------------------------------------------ work rules */

const ruleOut = z.object({ id: z.string(), label: z.string(), source: z.string().nullable(), url: z.string().nullable(), retrievedOn: z.string().nullable(), needsVerification: z.boolean() });

export const getWorkRules = defineCapability({
  name: 'getWorkRules',
  description: 'Workspace work rules: industry preset, whether the time clock is on, the overtime policy for cover, and each site’s overtime and break rules with their sources. Reads only.',
  input: z.object({}),
  output: z.object({
    industry: z.string(),
    industries: z.array(z.object({ key: z.string(), label: z.string(), blurb: z.string() })),
    timeClockEnabled: z.boolean(),
    overtimePolicy: z.enum(OVERTIME_POLICIES),
    sites: z.array(z.object({ locationId: z.string(), name: z.string(), region: z.string(), laborPackKey: z.string().nullable(), source: z.string(), rules: z.array(ruleOut), notes: z.array(z.string()) })),
    laborPacks: z.array(z.object({ key: z.string(), name: z.string(), country: z.string(), state: z.string().nullable(), city: z.string().nullable() })),
    notice: z.string(),
  }),
  scope: 'time:approve',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }) {
    const org = await getOrg(db, actor.orgId);
    const locs = await db.select().from(locations).where(eq(locations.orgId, actor.orgId)).orderBy(locations.name);
    const today = localDate(now, locs[0]?.timezone ?? 'UTC');
    const sites = [];
    for (const l of locs) {
      const r = await siteWorkRules(db, actor.orgId, l.id, today);
      const all = [...(r.rules.overtime ? [r.rules.overtime as unknown as { id: string; label: string }] : []), ...r.rules.meals, ...r.rules.rest] as unknown as {
        id: string;
        label: string;
        basis: string;
        needsVerification?: boolean;
        citation?: { regulation: string; section: string; url: string; retrievedOn: string };
      }[];
      sites.push({
        locationId: l.id,
        name: l.name,
        region: [l.subdivisionCode, l.countryCode].filter(Boolean).join(', '),
        laborPackKey: l.laborPackKey,
        source: ruleSummary(r).label,
        rules: all.map((x) => ({ id: x.id, label: x.label, source: citeOf(x), url: x.citation?.url ?? null, retrievedOn: x.citation?.retrievedOn ?? null, needsVerification: !!x.needsVerification })),
        notes: [...r.source.notes],
      });
    }
    return {
      industry: org.vertical,
      industries: INDUSTRIES.map((i) => ({ key: i.key, label: i.label, blurb: i.blurb })),
      timeClockEnabled: org.timeClockEnabled,
      overtimePolicy: org.overtimePolicy,
      sites,
      laborPacks: LABOR_PACKS.map((p) => ({ key: p.key, name: p.name, country: p.jurisdiction.country, state: p.jurisdiction.state ?? null, city: p.jurisdiction.city ?? null })),
      notice: WORK_RULES_NOTICE,
    };
  },
});

export const manageWorkRules = defineCapability({
  name: 'manageWorkRules',
  description: 'Admin-only work rules: pick the industry preset, turn the time clock on or off, set the overtime policy for cover ranking (allow, avoid = rank last, exclude), or choose a site’s labour pack.',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('setIndustry'), industry: z.enum(VERTICALS) }),
    z.object({ op: z.literal('setTimeClock'), enabled: z.boolean() }),
    z.object({ op: z.literal('setOvertimePolicy'), policy: z.enum(OVERTIME_POLICIES) }),
    z.object({ op: z.literal('setSiteLaborPack'), locationId: z.uuid(), packKey: z.string().nullable() }),
  ]),
  output: z.object({ ok: z.literal(true) }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) =>
    i.op === 'setIndustry' ? `Set the industry to ${i.industry}` : i.op === 'setTimeClock' ? `Turned the time clock ${i.enabled ? 'on' : 'off'}` : i.op === 'setOvertimePolicy' ? `Set the overtime policy to ${i.policy}` : `Set a site's labour rules to ${i.packKey ?? 'the default'}`,
  async handler({ db, actor }, input) {
    if (input.op === 'setIndustry') await db.update(organizations).set({ vertical: input.industry }).where(eq(organizations.id, actor.orgId));
    else if (input.op === 'setTimeClock') await db.update(organizations).set({ timeClockEnabled: input.enabled }).where(eq(organizations.id, actor.orgId));
    else if (input.op === 'setOvertimePolicy') await db.update(organizations).set({ overtimePolicy: input.policy }).where(eq(organizations.id, actor.orgId));
    else {
      const [l] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.orgId, actor.orgId), eq(locations.id, input.locationId)));
      if (!l) throw new CapabilityError('not_found', 'Site not found.');
      const pack = input.packKey ? seedPack(input.packKey) : null;
      if (input.packKey && (!pack || !LABOR_PACKS.some((p) => p.key === input.packKey))) throw new CapabilityError('invalid_input', `Unknown labour pack. Use one of: ${LABOR_PACKS.map((p) => p.key).join(', ')}.`);
      await db.update(locations).set({ laborPackKey: input.packKey }).where(and(eq(locations.orgId, actor.orgId), eq(locations.id, input.locationId)));
    }
    return { ok: true as const };
  },
});
