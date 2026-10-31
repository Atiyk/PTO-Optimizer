import { and, eq, isNull } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { hoursWorked, locations, members, timePunches } from '@/db/schema';
import { freshDb } from '@/test/db';
import { buildOrg, humanActor } from '@/test/fixtures';
import { invokeCapability, type CapabilityName } from './registry';
import type { Actor } from './types';

/*
 * Time clock capabilities: people-only punching, the state machine, idempotency, the hours
 * sync into hours_worked, approvals and corrections, visibility, and the compliance inbox.
 */

let db: Db;
let O: Awaited<ReturnType<typeof buildOrg>>;
const run = <N extends CapabilityName>(actor: Actor, name: N, input: unknown, now: Date) => invokeCapability(name, { db, actor, now }, input);
const at = (iso: string) => new Date(iso);
// The fixture site is UTC; the week of Mon 2026-11-02.
const day = (d: string, hm: string) => at(`2026-11-${d}T${hm}:00Z`);

beforeAll(async () => {
  db = await freshDb();
  O = await buildOrg(db, 'Clockwork');
  await db.update(members).set({ employmentType: 'hourly' }).where(eq(members.orgId, O.org.id));
  await db.update(locations).set({ timezone: 'UTC' }).where(eq(locations.id, O.location.id));
});

describe('clockPunch', () => {
  it('is off until an admin turns the time clock on', async () => {
    await expect(run(humanActor(O.emp), 'clockPunch', { op: 'in', idempotencyKey: 'off-00001' }, day('02', '08:00'))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(humanActor(O.manager), 'manageWorkRules', { op: 'setTimeClock', enabled: true }, day('02', '07:00'))).rejects.toMatchObject({ code: 'forbidden' });
    await run(humanActor(O.owner), 'manageWorkRules', { op: 'setTimeClock', enabled: true }, day('02', '07:00'));
  });

  it('agents can never punch, even on behalf of the person', async () => {
    const agent: Actor = { ...humanActor(O.emp), type: 'agent-on-behalf-of-user', clientId: 'x', onBehalfOfMemberId: O.emp.id };
    await expect(run(agent, 'clockPunch', { op: 'in', idempotencyKey: 'agent-0001' }, day('02', '08:00'))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('follows the state machine, is idempotent, and shows the meal deadline from the site rules (FLSA: none)', async () => {
    const me = humanActor(O.emp);
    const a = await run(me, 'clockPunch', { op: 'in', idempotencyKey: 'emp-in-001' }, day('02', '08:00'));
    expect(a).toMatchObject({ state: 'working', since: '08:00', allowed: ['break_start', 'out'] });
    expect(a.rules.label).toMatch(/FLSA/);
    expect(a.mealsDue).toEqual([]); // the federal baseline has no meal rule
    const again = await run(me, 'clockPunch', { op: 'in', idempotencyKey: 'emp-in-001' }, day('02', '08:01'));
    expect(again.state).toBe('working');
    expect(await db.select().from(timePunches).where(eq(timePunches.memberId, O.emp.id))).toHaveLength(1);
    await expect(run(me, 'clockPunch', { op: 'in', idempotencyKey: 'emp-in-002' }, day('02', '08:05'))).rejects.toMatchObject({ code: 'conflict' });
  });

  it('switching the site to California shows "meal break due by 13:00"', async () => {
    await run(humanActor(O.owner), 'manageWorkRules', { op: 'setSiteLaborPack', locationId: O.location.id, packKey: 'labor-us-ca' }, day('02', '09:00'));
    const c = await run(humanActor(O.emp), 'getMyTimeClock', {}, day('02', '10:00'));
    expect(c.mealsDue[0]).toMatchObject({ minutes: 30, dueBy: '13:00', taken: false });
    expect(c.askRestAttestation).toBe(true);
    expect(c.rules.overtime).toBe('Overtime over 40 h a week or over 8 h a day at 1.5×; over 12 h a day at 2×; 7th day in a row');
  });

  it('clock-out syncs the week’s hours into hours_worked (replacing, never adding)', async () => {
    const me = humanActor(O.emp);
    await run(me, 'clockPunch', { op: 'break_start', breakKind: 'meal', idempotencyKey: 'emp-b-0001' }, day('02', '12:00'));
    await run(me, 'clockPunch', { op: 'break_end', idempotencyKey: 'emp-b-0002' }, day('02', '12:30'));
    const out = await run(me, 'clockPunch', { op: 'out', restBreaksTaken: true, idempotencyKey: 'emp-out-001' }, day('02', '18:30'));
    expect(out.state).toBe('off');
    expect(out.week.bands).toMatchObject({ total: 10, regular: 8, overtime: 2 });
    const rows = async () => db.select().from(hoursWorked).where(and(eq(hoursWorked.memberId, O.emp.id), isNull(hoursWorked.voidedAt)));
    expect((await rows()).map((r) => [r.source, r.periodStart, r.periodEnd, Number(r.hours)])).toEqual([['time_clock', '2026-11-02', '2026-11-08', 10]]);
    // A second shift the same week replaces the row with the new total.
    await run(me, 'clockPunch', { op: 'in', idempotencyKey: 'emp-in-003' }, day('03', '08:00'));
    await run(me, 'clockPunch', { op: 'out', restBreaksTaken: false, idempotencyKey: 'emp-out-002' }, day('03', '12:00'));
    expect((await rows()).map((r) => Number(r.hours))).toEqual([14]);
  });
});

describe('timesheets, approvals and corrections', () => {
  it('staff see only themselves; managers see their people with bands and issues', async () => {
    const mine = await run(humanActor(O.emp2), 'getTimesheets', { week: '2026-11-04' }, day('04', '09:00'));
    expect(mine.people.map((p) => p.memberId)).toEqual([O.emp2.id]);
    await expect(run(humanActor(O.emp2), 'getTimesheets', { memberId: O.emp.id }, day('04', '09:00'))).rejects.toMatchObject({ code: 'not_found' });
    const team = await run(humanActor(O.manager), 'getTimesheets', { week: '2026-11-04' }, day('04', '09:00'));
    const emp = team.people.find((p) => p.memberId === O.emp.id)!;
    expect(emp.name).toEqual({ untrusted_text: 'Clockwork Emp' });
    expect(emp.bands).toMatchObject({ total: 14, overtime: 2 });
    expect(emp.days[0]!.reasons).toEqual(['over 8 h in a day at 1.5×']);
    // Tuesday's 4 h needs a rest break (CA: 4 h → 1) and they said no.
    expect(emp.issues.map((i) => i.kind)).toEqual(['rest_declined']);
    expect(JSON.stringify(team.people)).not.toMatch(/hourlyRate|payRate|\$/i); // hours only, never pay
  });

  it('approve snapshots the engine totals; a later correction supersedes it and re-syncs hours', async () => {
    const mgr = humanActor(O.manager);
    await expect(run(mgr, 'manageTimesheets', { op: 'approve', week: '2026-11-02', memberIds: [O.manager.id] }, day('09', '09:00'))).rejects.toMatchObject({ code: 'forbidden' });
    expect((await run(mgr, 'manageTimesheets', { op: 'approve', week: '2026-11-02', memberIds: [O.emp.id] }, day('09', '09:00'))).approved).toBe(1);
    let ts = await run(mgr, 'getTimesheets', { week: '2026-11-02', memberId: O.emp.id }, day('09', '09:05'));
    expect(ts.people[0]!.approval).toMatchObject({ stale: false });

    const [outPunch] = await db.select().from(timePunches).where(and(eq(timePunches.memberId, O.emp.id), eq(timePunches.idempotencyKey, 'emp-out-002')));
    await run(mgr, 'manageTimesheets', { op: 'correct', memberId: O.emp.id, voidPunchId: outPunch!.id, add: { kind: 'out', at: '2026-11-03T13:00:00Z' }, note: 'Left at 1 pm, forgot to clock out' }, day('09', '10:00'));
    ts = await run(mgr, 'getTimesheets', { week: '2026-11-02', memberId: O.emp.id }, day('09', '10:05'));
    expect(ts.people[0]!.bands.total).toBe(15);
    expect(ts.people[0]!.approval).toMatchObject({ stale: true });
    const live = await db.select().from(hoursWorked).where(and(eq(hoursWorked.memberId, O.emp.id), isNull(hoursWorked.voidedAt)));
    expect(live.map((r) => Number(r.hours))).toEqual([15]);
  });

  it('employees cannot approve or correct', async () => {
    await expect(run(humanActor(O.emp2), 'manageTimesheets', { op: 'approve', week: '2026-11-02', memberIds: [O.emp.id] }, day('09', '09:00'))).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('compliance inbox', () => {
  it('finds missed clock-outs, meal issues, overtime and timesheets waiting, each with a link', async () => {
    const me = humanActor(O.emp2);
    // Monday: a 9 h shift with no meal (CA: missed). Tuesday: clocked in and never out.
    await run(me, 'clockPunch', { op: 'in', idempotencyKey: 'e2-in-0001' }, day('02', '07:00'));
    await run(me, 'clockPunch', { op: 'out', restBreaksTaken: true, idempotencyKey: 'e2-out-001' }, day('02', '16:00'));
    await run(me, 'clockPunch', { op: 'in', idempotencyKey: 'e2-in-0002' }, day('03', '07:00'));
    const out = await run(humanActor(O.manager), 'getComplianceTasks', {}, day('10', '09:00'));
    const kinds = out.items.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['missed_clock_out', 'break_issue', 'timesheet_approval', 'leave_approval']));
    const meal = out.items.find((i) => i.kind === 'break_issue' && i.who?.untrusted_text === 'Clockwork Emp2')!;
    expect(meal).toMatchObject({ title: 'Meal break issue', rule: 'Cal. Labor Code § 512(a)', href: expect.stringContaining('/app/time?week=2026-11-02') });
    expect(out.items[0]!.severity).toBe('action');
    expect(out.notice).toMatch(/Not legal advice/);
    await expect(run(humanActor(O.emp), 'getComplianceTasks', {}, day('10', '09:00'))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('work rules list each site’s rules with sources', async () => {
    const r = await run(humanActor(O.owner), 'getWorkRules', {}, day('10', '09:00'));
    expect(r).toMatchObject({ timeClockEnabled: true, overtimePolicy: 'avoid' });
    expect(r.sites[0]!.rules.map((x) => x.id)).toEqual(['ca-overtime', 'ca-meal-1', 'ca-meal-2', 'ca-rest']);
    expect(r.sites[0]!.rules[1]!.source).toBe('Cal. Labor Code § 512(a)');
    expect(r.industries.map((i) => i.key)).toContain('retail');
    await expect(run(humanActor(O.owner), 'manageWorkRules', { op: 'setSiteLaborPack', locationId: O.location.id, packKey: 'childcare-us-ca' }, day('10', '09:00'))).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
