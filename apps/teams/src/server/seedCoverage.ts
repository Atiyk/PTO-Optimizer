import { eq } from 'drizzle-orm';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import type { Db } from '@/db/client';
import { leaveRequests, leaveTypes, locations, memberCoverPrefs, members, organizations, timePunches } from '@/db/schema';
import { parseHhmm, zonedToUtc } from '@daysoff/engine/coverage/timeBlocks';
import { invokeCapability, type CapabilityName } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { evaluateRequest, getMember } from '@/domain/leave';
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

export async function seedChildcareCentre(db: Db, today: string, opts: { orgName?: string } = {}) {
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
  return { org, ownerId: owner.id, managerId: ids[1]!, staffIds: ids, locationId: location.id, rooms: room, nextMonday };
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
