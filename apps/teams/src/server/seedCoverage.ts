import { eq } from 'drizzle-orm';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import type { Db } from '@/db/client';
import { leaveRequests, leaveTypes, locations, memberCoverPrefs, members, organizations, profileChangeRequests, timePunches } from '@/db/schema';
import { parseHhmm, zonedToUtc } from '@daysoff/engine/coverage/timeBlocks';
import { invokeCapability, type CapabilityName } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { evaluateRequest, getMember } from '@/domain/leave';
import { advanceEscalations } from '@/domain/escalation';
import { createOrganization } from './bootstrap';

/*
 * Demo: a licensed childcare centre in California with three rooms and 18 staff. All
 * numbers on screen come from the engine and the CA pack; children are counts per age group
 * only. Deterministic for a given `today`. Used by screenshots, the demo and RC tests.
 */

const STAFF: [name: string, role: 'owner' | 'admin' | 'manager' | 'employee', room: 'Infants' | 'Toddlers' | 'Preschool' | null, shift: 'early' | 'late' | 'office'][] = [
  ['Dana Whitfield', 'owner', null, 'office'],
  ['Marisol Ortega', 'manager', null, 'office'],
  ['Priya Raman', 'employee', 'Infants', 'early'],
  ['Lena Vogel', 'employee', 'Infants', 'early'],
  ['Tomás Ibarra', 'employee', 'Infants', 'late'],
  ['Grace Kim', 'employee', 'Infants', 'late'],
  ['Hannah Moore', 'employee', 'Toddlers', 'early'],
  ['Kwame Mensah', 'employee', 'Toddlers', 'early'],
  ['Sofia Russo', 'employee', 'Toddlers', 'late'],
  ['Ava Bennett', 'employee', 'Toddlers', 'late'],
  ['Noah Fischer', 'employee', 'Preschool', 'early'],
  ['Isla Campbell', 'employee', 'Preschool', 'early'],
  ['Mateo Alvarez', 'employee', 'Preschool', 'late'],
  ['Zoe Laurent', 'employee', 'Preschool', 'late'],
  ['Ethan Park', 'employee', null, 'early'],
  ['Maya Haddad', 'employee', null, 'late'],
  ['Owen Gallagher', 'employee', null, 'early'],
  ['Lucy Tran', 'employee', null, 'late'],
];

const SHIFT = { early: ['07:00', '15:30'], late: ['09:30', '18:00'] } as const;

export async function seedChildcareCentre(db: Db, today: string, opts: { orgName?: string; history?: boolean } = {}) {
  const { org, owner, team, location } = await createOrganization(
    db,
    { provider: 'dev', subject: `childcare-owner-${opts.orgName ?? 'sunbeam'}`, name: STAFF[0]![0], email: null, slackTeamId: null, issuedAt: 0 },
    { orgName: opts.orgName ?? 'Sunbeam Early Learning', countryCode: 'US', subdivisionCode: 'US-CA', teamName: 'Classroom staff', today },
  );
  const orgId = org.id;
  await db.update(locations).set({ name: 'Sunbeam Oakland' }).where(eq(locations.id, location.id));
  await db.update(members).set({ startDate: '2019-08-01', employmentType: 'salaried' }).where(eq(members.id, owner.id));
  const actor: Actor = { type: 'human', orgId, memberId: owner.id, role: 'owner', clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES.owner };
  const now = new Date(`${today}T16:00:00Z`);
  const run = <N extends CapabilityName>(name: N, input: unknown) => invokeCapability(name, { db, actor, now }, input);

  const ids: string[] = [owner.id];
  for (const [i, [name, role]] of STAFF.entries()) {
    if (i === 0) continue;
    const [m] = await db
      .insert(members)
      .values({
        orgId,
        name,
        role,
        teamId: team.id,
        locationId: location.id,
        startDate: `${2020 + (i % 5)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
        tags: role === 'manager' ? ['director'] : ['teacher'],
        employmentType: role === 'employee' ? 'hourly' : 'salaried',
        hoursPerDay: '8',
      })
      .returning();
    ids.push(m!.id);
  }
  for (const id of ids.slice(2)) await db.update(members).set({ managerId: ids[1] }).where(eq(members.id, id));

  await run('manageSchedule', { op: 'setTimezone', locationId: location.id, timezone: 'America/Los_Angeles' });
  await run('manageSchedule', { op: 'selectRulePack', locationId: location.id, packKey: 'childcare-us-ca', sickPolicy: 'none', effectiveFrom: '2026-01-01' });
  await run('manageSchedule', { op: 'selectRulePack', locationId: location.id, packKey: 'labor-us-ca', sickPolicy: 'accrue', effectiveFrom: '2026-01-01' });

  const room: Record<string, string> = {};
  for (const [name, groupKey] of [
    ['Infants', 'infant'],
    ['Toddlers', 'toddler'],
    ['Preschool', 'preschool'],
  ] as const) {
    room[name] = (await run('manageSchedule', { op: 'upsertRoom', locationId: location.id, name, groupKey })).id!;
  }
  // Children expected, Mon–Fri (counts only). CA: infants 1:4, toddlers 1:6, preschool 1:12.
  const weekdays = [0, 1, 2, 3, 4];
  const demand: Record<string, [start: string, end: string, count: number][]> = {
    Infants: [['07:00', '09:30', 4], ['09:30', '15:30', 8], ['15:30', '18:00', 4]],
    Toddlers: [['07:00', '09:30', 6], ['09:30', '16:30', 12], ['16:30', '18:00', 6]],
    Preschool: [['07:00', '09:30', 12], ['09:30', '15:30', 24], ['15:30', '18:00', 12]],
  };
  const group = { Infants: 'infant', Toddlers: 'toddler', Preschool: 'preschool' } as const;
  for (const [name, rows] of Object.entries(demand)) {
    await run('manageSchedule', {
      op: 'setDemand',
      roomId: room[name],
      rows: weekdays.flatMap((weekday) => rows.map(([start, end, count]) => ({ weekday, start, end, group: group[name as keyof typeof group], count }))),
    });
  }
  // Floaters back up the infant and preschool rooms.
  const floaterRoom = ['Infants', 'Preschool', 'Infants', 'Preschool'];
  let f = 0;
  for (const [i, [, , r, shift]] of STAFF.entries()) {
    if (shift === 'office') continue;
    const target = r ?? floaterRoom[f++ % floaterRoom.length]!;
    const [start, end] = SHIFT[shift];
    await run('manageSchedule', { op: 'setShifts', memberId: ids[i], rows: weekdays.map((weekday) => ({ roomId: room[target], weekday, start, end })) });
  }

  // Credentials: pediatric CPR for everyone; a few lapsing soon, one already lapsed.
  await run('manageCredentials', { op: 'define', key: 'pediatric_cpr', name: 'Pediatric CPR and first aid' });
  await run('manageCredentials', { op: 'define', key: 'ece_12_units', name: '12 ECE units (teacher qualified)', needsExpiry: false });
  for (const [i, id] of ids.entries()) {
    const expiresOn = i === 4 ? addDays(today, -3) : i === 7 ? addDays(today, 6) : i === 11 ? addDays(today, 12) : i === 14 ? addDays(today, 25) : `${Number(today.slice(0, 4)) + 1}-0${(i % 9) + 1}-15`;
    await run('manageCredentials', { op: 'grant', memberId: id, credentialKey: 'pediatric_cpr', issuedOn: '2025-01-15', expiresOn, verified: i % 3 !== 0 });
    if (STAFF[i]![2]) await run('manageCredentials', { op: 'grant', memberId: id, credentialKey: 'ece_12_units', issuedOn: '2021-06-01', verified: true });
  }

  // Hours worked for hourly staff since January (two-week periods, 76–80 h).
  const rows: { member: string; periodStart: string; periodEnd: string; hours: number }[] = [];
  for (const [i, id] of ids.entries()) {
    if (STAFF[i]![1] !== 'employee') continue;
    for (let p = `${today.slice(0, 4)}-01-01`; addDays(p, 13) < today; p = addDays(p, 14)) rows.push({ member: id, periodStart: p, periodEnd: addDays(p, 13), hours: 76 + ((i + p.charCodeAt(6)) % 5) });
  }
  await run('importHoursWorked', { stage: 'commit', rows });

  // Next Monday a toddler teacher is on approved leave: the early shift leaves at 15:30 and
  // 12 toddlers stay until 16:30, so 15:30–16:30 is one short (CA 1:6). Wednesday's pending
  // request would open the same gap ("likely" view). The Tuesday after, both early toddler
  // teachers have asked for the day; the later request is the one the forecast suggests moving.
  const nextMonday = addDays(today, 7 - mondayIndexedDow(today));
  const [vac] = (await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId))).filter((t) => t.key === 'vacation');
  for (const [n, [idx, start, status]] of ([
    [8, nextMonday, 'approved'],
    [9, addDays(nextMonday, 2), 'pending'],
    [7, addDays(nextMonday, 8), 'pending'],
    [6, addDays(nextMonday, 8), 'pending'],
  ] as const).entries()) {
    const member = await getMember(db, orgId, ids[idx]!);
    const ev = await evaluateRequest(db, orgId, member, { leaveTypeKey: 'vacation', start, end: start, part: 'full' }, today);
    await db.insert(leaveRequests).values({
      orgId,
      memberId: member.id,
      leaveTypeId: vac!.id,
      status,
      startDate: start,
      endDate: start,
      createdAt: new Date(now.getTime() - (10 - n) * 3_600_000),
      engineSnapshot: { amount: ev.cost.amount, unit: ev.unit, chargedDates: ev.cost.chargedDates, excluded: ev.cost.excluded },
    });
  }
  await seedPunches(db, orgId, ids, location.id, today);
  await seedAutomations(db, orgId, run, { ids, teamId: team.id, locationId: location.id, nextMonday, today });
  if (opts.history) {
    await seedLeaveHistory(db, orgId, ids, today);
    await seedDecisionFlow(db, orgId, run, { ids, teamId: team.id, nextMonday, today, now });
  }
  return { org, ownerId: owner.id, managerId: ids[1]!, staffIds: ids, locationId: location.id, rooms: room, nextMonday };
}

/**
 * Approvals and policies demo: the Complete plan, the director approves the classroom team (the
 * owner is backup), an "Infant room" group with at most 2 away at once (soft), a 90-day
 * probation for vacation, a soft vacation-only blackout over the winter break, a staff meeting
 * next Thursday, and one pending change to a work email.
 */
async function seedAutomations(
  db: Db,
  orgId: string,
  run: <N extends CapabilityName>(name: N, input: unknown) => Promise<unknown>,
  c: { ids: string[]; teamId: string; locationId: string; nextMonday: string; today: string },
) {
  await db.update(organizations).set({ plan: 'complete' }).where(eq(organizations.id, orgId));
  await run('manageOrgSetup', { op: 'setTeamApprovers', teamId: c.teamId, approverMemberId: c.ids[1], backupApproverMemberId: c.ids[0] });
  const infants = (await run('manageOrgSetup', { op: 'addGroup', name: 'Infant room' })) as { id: string };
  await run('manageOrgSetup', { op: 'setGroupMembers', groupId: infants.id, memberIds: c.ids.filter((_, i) => STAFF[i]![2] === 'Infants') });
  await run('manageOrgSetup', { op: 'addGroup', name: 'Floaters' }).then((g) =>
    run('manageOrgSetup', { op: 'setGroupMembers', groupId: (g as { id: string }).id, memberIds: c.ids.filter((_, i) => STAFF[i]![2] === null && STAFF[i]![3] !== 'office') }),
  );
  await run('manageOrgSetup', { op: 'addPolicyRule', kind: 'max_out', name: 'Infant room cover', maxOut: 2, hard: false, groupIds: [infants.id] });
  await run('manageOrgSetup', { op: 'addPolicyRule', kind: 'probation', name: 'New-hire probation', minDays: 90, leaveTypeKeys: ['vacation'] });
  const y = Number(c.today.slice(0, 4));
  await run('manageOrgSetup', { op: 'addBlackout', start: `${y}-12-22`, end: `${y + 1}-01-02`, reason: 'Winter break enrollment', hard: false, leaveTypeKeys: ['vacation'], locationIds: [c.locationId] });
  await run('manageTeamEvents', { op: 'create', title: 'Monthly staff meeting', date: addDays(c.nextMonday, 3), start: '18:15', end: '19:15' });
  await run('manageTeamEvents', { op: 'create', title: 'Infant room CPR refresher', date: addDays(c.nextMonday, 10), start: '13:00', end: '14:00', groupIds: [infants.id] });
  const [m] = await db.select().from(members).where(eq(members.id, c.ids[5]!));
  if (m) {
    await db.insert(profileChangeRequests).values({ orgId, memberId: m.id, field: 'email', oldValue: m.email, newValue: `${m.name.split(' ')[0]!.toLowerCase()}@sunbeam.example` });
  }
}

/**
 * Decision flow demo (live demo and dev login only, like the history): the classroom team on
 * `auto` for vacation up to 3 days with a week's notice (team events tolerated), the infant room on
 * `suggest`; one request already auto-approved and still undoable, one waiting with a "max away"
 * warning, one escalated after three days, a possible-FMLA request recorded for HR, and a request
 * window with 4 requests for 2 places that closed yesterday.
 */
async function seedDecisionFlow(
  db: Db,
  orgId: string,
  run: <N extends CapabilityName>(name: N, input: unknown) => Promise<unknown>,
  c: { ids: string[]; teamId: string; nextMonday: string; today: string; now: Date },
) {
  const groupsList = (await run('getOrgSetup', {})) as { groups: { id: string; name: string }[] };
  const infants = groupsList.groups.find((g) => g.name === 'Infant room')!;
  await run('manageOrgSetup', { op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant', level: 3 });
  await run('manageOrgSetup', { op: 'setApprovalPolicy', name: 'Classroom short breaks', mode: 'auto', teamIds: [c.teamId], leaveTypeKeys: ['vacation'], maxDays: 3, minNoticeDays: 7, toleratedWarnings: ['event'] });
  await run('manageOrgSetup', { op: 'setApprovalPolicy', name: 'Infant room', mode: 'suggest', groupIds: [infants.id], leaveTypeKeys: ['vacation'], maxDays: 3, minNoticeDays: 7 });
  await run('manageOrgSetup', {
    op: 'upsertLeaveType',
    key: 'family-medical',
    name: 'Family or medical leave',
    paid: false,
    countsAgainstBalance: false,
    requiresApproval: true,
    isHealthRelated: true,
    protectedCategory: 'fmla_possible',
  });
  const base = addDays(c.nextMonday, 14);
  const as = (i: number) => {
    const role = STAFF[i]![1];
    const actor: Actor = { type: 'human', orgId, memberId: c.ids[i]!, role, clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES[role] };
    return <N extends CapabilityName>(name: N, input: unknown) => invokeCapability(name, { db, actor, now: c.now }, input);
  };
  const submit = (i: number, leaveType: string, start: string, end: string) =>
    as(i)('submitLeaveRequest', { leaveType, start, end, idempotencyKey: `demo-flow-${i}-${start}` }).catch(() => null);

  // Auto-approved two weeks ahead: still inside the undo window.
  await submit(10, 'vacation', addDays(base, 1), addDays(base, 2));
  // Two infant-room teachers already off on Thursday; a third asks: waits with a "max away" warning.
  const [vac] = (await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId))).filter((t) => t.key === 'vacation');
  const thu = addDays(base, 3);
  for (const i of [2, 3]) {
    const member = await getMember(db, orgId, c.ids[i]!);
    const ev = await evaluateRequest(db, orgId, member, { leaveTypeKey: 'vacation', start: thu, end: thu, part: 'full' }, c.today);
    await db.insert(leaveRequests).values({ orgId, memberId: member.id, leaveTypeId: vac!.id, status: 'approved', startDate: thu, endDate: thu, decidedByMemberId: c.ids[1]!, decidedAt: c.now, engineSnapshot: { amount: ev.cost.amount, unit: ev.unit, chargedDates: ev.cost.chargedDates, excluded: ev.cost.excluded } });
  }
  await submit(4, 'vacation', thu, thu);
  // Four days (over the auto limit) asked three days ago and not decided: escalated to the backup.
  const late = (await submit(15, 'vacation', addDays(base, 14), addDays(base, 17))) as { request: { id: string } } | null;
  if (late) await db.update(leaveRequests).set({ createdAt: new Date(c.now.getTime() - 3 * 86_400_000) }).where(eq(leaveRequests.id, late.request.id));
  await advanceEscalations(db, orgId, c.now);
  // Possible FMLA: recorded, never decided by rules; HR gets the notice task (5 business days).
  await submit(5, 'family-medical', base, addDays(base, 4));
  // A contested week: requests collected until yesterday, 2 places, 4 asked.
  const ws = addDays(base, 7);
  await run('manageOrgSetup', { op: 'addPolicyRule', kind: 'request_window', name: 'Holiday week', start: ws, end: addDays(ws, 4), collectUntil: addDays(c.today, -1), slots: 2, tieBreak: 'rotation', teamIds: [c.teamId], leaveTypeKeys: ['vacation'] });
  for (const [n, i] of [13, 12, 11, 14].entries()) {
    const member = await getMember(db, orgId, c.ids[i]!);
    const start = addDays(ws, 1);
    const end = addDays(ws, 2);
    const ev = await evaluateRequest(db, orgId, member, { leaveTypeKey: 'vacation', start, end, part: 'full' }, c.today);
    await db.insert(leaveRequests).values({
      orgId,
      memberId: member.id,
      leaveTypeId: vac!.id,
      status: 'pending',
      startDate: start,
      endDate: end,
      createdAt: new Date(c.now.getTime() - (20 - n * 3) * 3_600_000),
      lastRemindedAt: c.now,
      engineSnapshot: { amount: ev.cost.amount, unit: ev.unit, chargedDates: ev.cost.chargedDates, excluded: ev.cost.excluded },
    });
  }
}

/** Marks seeded past leave, so the demo's "story Monday" (its first upcoming approved request) skips it. */
export const DEMO_HISTORY_KEY = 'demo-history-';

/**
 * Leave history for the absence report (live demo and dev login only; the test seed stays as it
 * was so coverage and forecast tests keep their numbers): about two requests a month over the last
 * nine months, mostly vacation with some sick and personal days, decided by the director a day or
 * two after they were asked for, and two declined. Weekdays only; nothing on or after today.
 */
async function seedLeaveHistory(db: Db, orgId: string, ids: string[], today: string) {
  const types = new Map((await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId))).map((t) => [t.key, t]));
  const pick: Array<[key: string, days: number, status: 'approved' | 'declined']> = [
    ['vacation', 3, 'approved'], ['sick', 1, 'approved'], ['vacation', 5, 'approved'], ['personal', 1, 'approved'],
    ['vacation', 2, 'declined'], ['sick', 2, 'approved'], ['vacation', 4, 'approved'], ['vacation', 1, 'approved'],
    ['personal', 1, 'approved'], ['vacation', 3, 'approved'], ['sick', 1, 'approved'], ['vacation', 2, 'approved'],
    ['vacation', 5, 'approved'], ['sick', 1, 'approved'], ['vacation', 2, 'declined'], ['personal', 1, 'approved'],
    ['vacation', 3, 'approved'], ['vacation', 1, 'approved'],
  ];
  const rows: (typeof leaveRequests.$inferInsert)[] = [];
  for (const [n, [key, len, status]] of pick.entries()) {
    const t = types.get(key);
    const memberId = ids[2 + ((n * 7) % (ids.length - 2))]!;
    if (!t) continue;
    let start = addDays(today, -(270 - n * 14));
    while (mondayIndexedDow(start) > 4) start = addDays(start, 1);
    const dates: string[] = [];
    for (let d = start; dates.length < len; d = addDays(d, 1)) if (mondayIndexedDow(d) < 5) dates.push(d);
    if (dates.at(-1)! >= today) continue;
    const lead = key === 'sick' ? 0 : 5 + ((n * 3) % 20);
    const asked = new Date(`${addDays(start, -lead)}T16:00:00Z`);
    const ev = await evaluateRequest(db, orgId, await getMember(db, orgId, memberId), { leaveTypeKey: key, start, end: dates.at(-1)!, part: 'full' }, start);
    rows.push({
      orgId,
      memberId,
      leaveTypeId: t.id,
      status,
      startDate: start,
      endDate: dates.at(-1)!,
      createdAt: asked,
      decidedByMemberId: ids[1]!,
      decidedAt: new Date(asked.getTime() + (1 + (n % 2)) * 86_400_000),
      idempotencyKey: `${DEMO_HISTORY_KEY}${n}`,
      engineSnapshot: { amount: ev.cost.amount, unit: ev.unit, chargedDates: ev.cost.chargedDates, excluded: ev.cost.excluded },
    });
  }
  if (rows.length) await db.insert(leaveRequests).values(rows);
}

/**
 * Time clock demo: last week and this week (before today) for hourly staff, mostly clean,
 * with the things the compliance inbox is for: Kwame stays late Mon–Thu (CA daily overtime),
 * Noah skips a meal, Mateo takes a late meal, Ava says she missed her rest breaks once, and
 * Grace forgets to clock out on the last working day. Punches go straight in (no hours
 * sync), so the imported hours behind sick-leave balances stay as they were.
 */
async function seedPunches(db: Db, orgId: string, ids: string[], locationId: string, today: string) {
  await db.update(organizations).set({ timeClockEnabled: true, overtimePolicy: 'avoid' }).where(eq(organizations.id, orgId));
  const tz = 'America/Los_Angeles';
  const at = (d: string, hm: string) => new Date(zonedToUtc(d, parseHhmm(hm), tz));
  const thisMonday = addDays(today, -mondayIndexedDow(today));
  const days = [0, 1, 2, 3, 4].map((i) => addDays(addDays(thisMonday, -7), i)).concat([0, 1, 2, 3, 4].map((i) => addDays(thisMonday, i)).filter((d) => d < today));
  const lastDay = days.at(-1)!;
  const rows: (typeof timePunches.$inferInsert)[] = [];
  for (const [i, [, role, , shift]] of STAFF.entries()) {
    if (role !== 'employee' || shift === 'office') continue;
    const [start, end] = SHIFT[shift];
    const meal = shift === 'early' ? ['11:00', '11:30'] : ['13:00', '13:30'];
    for (const [n, d] of days.entries()) {
      const name = STAFF[i]![0];
      const dow = mondayIndexedDow(d);
      const out = name === 'Kwame Mensah' && dow < 4 ? '17:30' : end;
      const skipMeal = name === 'Noah Fischer' && dow === 2;
      const m = name === 'Mateo Alvarez' && dow === 1 ? ['15:45', '16:15'] : meal;
      const p = (kind: 'in' | 'out' | 'break_start' | 'break_end', hm: string, extra: Partial<typeof timePunches.$inferInsert> = {}) =>
        rows.push({ orgId, memberId: ids[i]!, locationId, kind, at: at(d, hm), source: 'self', createdByMemberId: ids[i]!, idempotencyKey: `seed-${n}-${i}-${kind}`, ...extra });
      p('in', start);
      if (!skipMeal) {
        p('break_start', m[0]!, { breakKind: 'meal' });
        p('break_end', m[1]!);
      }
      if (name === 'Grace Kim' && d === lastDay) continue; // forgot to clock out
      p('out', out, { restBreaksTaken: !(name === 'Ava Bennett' && dow === 3 && d < thisMonday) });
    }
  }
  if (rows.length) await db.insert(timePunches).values(rows);
}

/*
 * Demo for the second vertical: a dental practice with two sites using the clinic pack.
 * Configuration only (no clinic code): posts with a service each, demand as booked chairs,
 * licences as credentials. Every rule is the practice's own policy, as the pack says.
 * Next Tuesday a hygienist at the first site is on approved leave, so Hygiene 2 is a
 * clinician short all day; the second site's part-time hygienist is free on Tuesdays and is
 * the one cover can come from.
 */
const CLINIC_SITES = ['Harbor Dental Oakland', 'Harbor Dental Alameda'] as const;
type ClinicStaff = [name: string, role: 'owner' | 'manager' | 'employee', post: 'Hygiene 1' | 'Hygiene 2' | 'Surgery' | null, licence: 'dds_licence' | 'rdh_licence' | null, days: number[]];
const FULL = [0, 1, 2, 3, 4];
const CLINIC_STAFF: ClinicStaff[][] = [
  [
    ['Rosa Delgado', 'owner', 'Surgery', 'dds_licence', FULL],
    ['Ben Okafor', 'employee', 'Surgery', 'dds_licence', FULL],
    ['Mia Chen', 'employee', 'Hygiene 1', 'rdh_licence', FULL],
    ['Jonah Weiss', 'employee', 'Hygiene 2', 'rdh_licence', FULL],
    ['Leila Haddad', 'employee', 'Surgery', null, FULL],
    ['Carmen Ruiz', 'manager', null, null, []],
  ],
  [
    ['Sam Patel', 'employee', 'Surgery', 'dds_licence', FULL],
    ['Grace Liu', 'employee', 'Surgery', 'dds_licence', FULL],
    ['Ines Moreau', 'employee', 'Hygiene 1', 'rdh_licence', FULL],
    ['Theo Nakamura', 'employee', 'Hygiene 2', 'rdh_licence', [0, 2, 4]],
    ['Ada Brooks', 'employee', 'Surgery', null, FULL],
  ],
];

export async function seedClinic(db: Db, today: string, opts: { orgName?: string } = {}) {
  const [[owner0]] = CLINIC_STAFF as [[ClinicStaff]];
  const { org, owner, team, location } = await createOrganization(
    db,
    { provider: 'dev', subject: `clinic-owner-${opts.orgName ?? 'harbor'}`, name: owner0[0], email: null, slackTeamId: null, issuedAt: 0 },
    { orgName: opts.orgName ?? 'Harbor Dental', countryCode: 'US', subdivisionCode: 'US-CA', teamName: 'Clinical staff', today },
  );
  const orgId = org.id;
  const actor: Actor = { type: 'human', orgId, memberId: owner.id, role: 'owner', clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES.owner };
  const now = new Date(`${today}T16:00:00Z`);
  const run = <N extends CapabilityName>(name: N, input: unknown) => invokeCapability(name, { db, actor, now }, input);

  await run('manageSchedule', { op: 'setVertical', vertical: 'clinic' });
  await db.update(locations).set({ name: CLINIC_SITES[0] }).where(eq(locations.id, location.id));
  const siteIds: string[] = [location.id, (await run('manageOrgSetup', { op: 'addLocation', name: CLINIC_SITES[1], countryCode: 'US', subdivisionCode: 'US-CA' })).id!];
  await run('manageCredentials', { op: 'define', key: 'dds_licence', name: 'Dentist licence (DDS/DMD)' });
  await run('manageCredentials', { op: 'define', key: 'rdh_licence', name: 'Registered dental hygienist licence' });

  const posts: Record<string, string>[] = [];
  const ids: string[][] = [];
  for (const [s, siteId] of siteIds.entries()) {
    await run('manageSchedule', { op: 'setTimezone', locationId: siteId, timezone: 'America/Los_Angeles' });
    await run('manageSchedule', { op: 'selectRulePack', locationId: siteId, packKey: 'clinic-template', effectiveFrom: '2026-01-01' });
    await run('manageSchedule', { op: 'selectRulePack', locationId: siteId, packKey: 'labor-us-ca', sickPolicy: 'accrue', effectiveFrom: '2026-01-01' });
    const post: Record<string, string> = {};
    for (const [name, group] of [['Hygiene 1', 'hygiene'], ['Hygiene 2', 'hygiene'], ['Surgery', 'surgery']] as const) {
      post[name] = (await run('manageSchedule', { op: 'upsertRoom', locationId: siteId, name, kind: 'post', groupKey: group })).id!;
      // Bookings (counts only): a chair booked all day; one procedure every morning. Alameda's
      // second hygiene chair runs on Theo's days only.
      const rows = name === 'Surgery' ? [['09:00', '12:00', 1]] : [['08:00', '17:00', 1]];
      const days = s === 1 && name === 'Hygiene 2' ? [0, 2, 4] : FULL;
      await run('manageSchedule', { op: 'setDemand', roomId: post[name], rows: days.flatMap((weekday) => rows.map(([start, end, count]) => ({ weekday, start, end, group, count }))) });
    }
    posts.push(post);
    const siteIdsOut: string[] = [];
    for (const [i, [name, role, p, licence, days]] of CLINIC_STAFF[s]!.entries()) {
      let id = owner.id;
      if (!(s === 0 && i === 0)) {
        const [m] = await db
          .insert(members)
          .values({ orgId, name, role, teamId: team.id, locationId: siteId, startDate: `${2019 + i}-0${(i % 9) + 1}-01`, tags: [licence === 'dds_licence' ? 'dentist' : licence ? 'hygienist' : role === 'manager' ? 'office' : 'assistant'], employmentType: role === 'employee' ? 'hourly' : 'salaried', hoursPerDay: '8' })
          .returning();
        id = m!.id;
      }
      siteIdsOut.push(id);
      if (p) await run('manageSchedule', { op: 'setShifts', memberId: id, rows: days.map((weekday) => ({ roomId: post[p], weekday, start: '08:00', end: '17:00' })) });
      if (licence) await run('manageCredentials', { op: 'grant', memberId: id, credentialKey: licence, issuedOn: '2020-01-01', expiresOn: `${Number(today.slice(0, 4)) + 1}-0${(i % 9) + 1}-28`, verified: true });
    }
    ids.push(siteIdsOut);
  }
  // Theo (Alameda, Mon/Wed/Fri) may cover at Oakland on his days off.
  await db.insert(memberCoverPrefs).values({ orgId, memberId: ids[1]![3]!, optIn: 'yes', allowedLocationIds: siteIds });

  const nextTuesday = addDays(today, ((1 - mondayIndexedDow(today) + 7) % 7) || 7);
  const [vac] = (await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId))).filter((t) => t.key === 'vacation');
  const jonah = await getMember(db, orgId, ids[0]![3]!);
  const ev = await evaluateRequest(db, orgId, jonah, { leaveTypeKey: 'vacation', start: nextTuesday, end: nextTuesday, part: 'full' }, today);
  await db.insert(leaveRequests).values({
    orgId, memberId: jonah.id, leaveTypeId: vac!.id, status: 'approved', startDate: nextTuesday, endDate: nextTuesday,
    engineSnapshot: { amount: ev.cost.amount, unit: ev.unit, chargedDates: ev.cost.chargedDates, excluded: ev.cost.excluded },
  });
  return { org, ownerId: owner.id, managerId: ids[0]![5]!, staffIds: ids, siteIds, posts, nextTuesday };
}
