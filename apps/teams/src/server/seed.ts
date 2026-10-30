import 'server-only';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { balanceLedger, coverageRules, leaveRequests, leaveTypes, locations, members, teams } from '@/db/schema';
import { evaluateRequest, getMember } from '@/domain/leave';
import { createOrganization } from './bootstrap';

/*
 * A realistic demo org: 25 people across the US (California) and the UK (England), two
 * teams with an engineer coverage rule, starting balances imported from a previous tool,
 * and some booked leave. Deterministic: the same `today` gives the same org.
 */

const PEOPLE: [name: string, team: 'Engineering' | 'Customer Success', country: 'US' | 'GB', role: 'owner' | 'admin' | 'manager' | 'employee', tags: string[]][] = [
  ['Avery Chen', 'Engineering', 'US', 'owner', ['engineer']],
  ['Jordan Patel', 'Engineering', 'US', 'manager', ['engineer']],
  ['Sam Rivera', 'Engineering', 'US', 'employee', ['engineer']],
  ['Riley Okafor', 'Engineering', 'US', 'employee', ['engineer']],
  ['Casey Nguyen', 'Engineering', 'US', 'employee', ['engineer']],
  ['Morgan Lee', 'Engineering', 'GB', 'employee', ['engineer']],
  ['Taylor Brooks', 'Engineering', 'GB', 'employee', ['engineer']],
  ['Quinn Murphy', 'Engineering', 'GB', 'employee', ['engineer']],
  ['Harper Singh', 'Engineering', 'US', 'employee', ['designer']],
  ['Rowan Adeyemi', 'Engineering', 'GB', 'employee', ['engineer']],
  ['Drew Kowalski', 'Engineering', 'US', 'employee', ['engineer']],
  ['Emerson Silva', 'Engineering', 'US', 'employee', ['engineer']],
  ['Alex Morgan', 'Customer Success', 'GB', 'manager', ['support']],
  ['Jamie Fraser', 'Customer Success', 'GB', 'employee', ['support']],
  ['Robin Hughes', 'Customer Success', 'GB', 'employee', ['support']],
  ['Skyler Evans', 'Customer Success', 'GB', 'employee', ['support']],
  ['Parker Davies', 'Customer Success', 'GB', 'employee', ['support']],
  ['Reese Thomas', 'Customer Success', 'US', 'employee', ['support']],
  ['Hayden Clarke', 'Customer Success', 'US', 'employee', ['support']],
  ['Finley Wright', 'Customer Success', 'US', 'admin', ['support']],
  ['Kendall Price', 'Customer Success', 'GB', 'employee', ['support']],
  ['Sage Walker', 'Customer Success', 'US', 'employee', ['support']],
  ['Blake Turner', 'Customer Success', 'GB', 'employee', ['support']],
  ['Dakota Hill', 'Customer Success', 'US', 'employee', ['support']],
  ['Charlie Green', 'Engineering', 'GB', 'employee', ['engineer']],
];

export async function seedDemoOrg(db: Db, today: string, opts: { orgName?: string } = {}) {
  const [ownerName] = PEOPLE[0]!;
  const { org, owner, team: firstTeam, location: usLoc } = await createOrganization(
    db,
    { provider: 'dev', subject: 'demo-owner', name: ownerName, email: null, slackTeamId: null, issuedAt: 0 },
    { orgName: opts.orgName ?? 'Northwind Labs', countryCode: 'US', subdivisionCode: 'US-CA', teamName: 'Engineering', today },
  );
  const orgId = org.id;
  await db.update(locations).set({ name: 'San Francisco' }).where(eq(locations.id, usLoc.id));
  const [gbLoc] = await db.insert(locations).values({ orgId, name: 'London', countryCode: 'GB', subdivisionCode: 'GB-ENG', timezone: 'Europe/London' }).returning();
  const [cs] = await db.insert(teams).values({ orgId, name: 'Customer Success' }).returning();
  const teamId = { Engineering: firstTeam.id, 'Customer Success': cs!.id };
  await db.update(members).set({ tags: ['engineer'], startDate: '2021-03-01' }).where(eq(members.id, owner.id));

  const ids: string[] = [owner.id];
  for (const [i, [name, team, country, role, tags]] of PEOPLE.entries()) {
    if (i === 0) continue;
    const [m] = await db
      .insert(members)
      .values({
        orgId,
        name,
        role,
        teamId: teamId[team],
        locationId: country === 'US' ? usLoc.id : gbLoc!.id,
        tags,
        startDate: `${2019 + (i % 6)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
        // Two part-timers: Mon–Thu, and 7.5 h days for UK staff.
        workWeek: i === 9 || i === 16 ? '1111000' : '1111100',
        hoursPerDay: country === 'GB' ? '7.5' : '8',
      })
      .returning();
    ids.push(m!.id);
  }
  // Managers.
  const engMgr = ids[1]!;
  const csMgr = ids[12]!;
  for (const [i, id] of ids.entries()) {
    if (i === 1 || i === 12 || i === 0) continue;
    await db.update(members).set({ managerId: PEOPLE[i]![1] === 'Engineering' ? engMgr : csMgr }).where(eq(members.id, id));
  }
  await db.insert(coverageRules).values([
    { orgId, teamId: teamId.Engineering, minPresent: 2, tag: 'engineer', weekdays: '1111100' },
    { orgId, teamId: teamId['Customer Success'], minPresent: 3, tag: null, weekdays: '1111100' },
  ]);

  // Carried-in balances from "the previous tool": deterministic spread of 0–9.5 days.
  const [vac] = await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId)).then((r) => r.filter((t) => t.key === 'vacation'));
  const yearStart = `${today.slice(0, 4)}-01-01`;
  await db.insert(balanceLedger).values(
    ids.map((memberId, i) => ({
      orgId,
      memberId,
      leaveTypeId: vac!.id,
      kind: 'import' as const,
      amount: String(-((i * 7) % 20) / 2),
      effectiveDate: yearStart,
      reason: 'Used before switching (imported)',
    })),
  );
  // A few booked requests in the coming weeks.
  const add = (d: number) => new Date(Date.parse(`${today}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
  const booked: [number, number, number, 'approved' | 'pending'][] = [
    [2, 7, 9, 'approved'],
    [3, 7, 11, 'approved'],
    [13, 14, 18, 'pending'],
    [5, 21, 22, 'pending'],
  ];
  for (const [idx, s, e, status] of booked) {
    const start = add(s);
    const end = add(e);
    const member = await getMember(db, orgId, ids[idx]!);
    const ev = await evaluateRequest(db, orgId, member, { leaveTypeKey: 'vacation', start, end, part: 'full' }, today);
    const [req] = await db
      .insert(leaveRequests)
      .values({
        orgId,
        memberId: member.id,
        leaveTypeId: vac!.id,
        status,
        startDate: start,
        endDate: end,
        engineSnapshot: { amount: ev.cost.amount, unit: ev.unit, chargedDates: ev.cost.chargedDates, excluded: ev.cost.excluded },
      })
      .returning();
    if (status === 'approved' && ev.cost.amount > 0) {
      await db.insert(balanceLedger).values({ orgId, memberId: member.id, leaveTypeId: vac!.id, kind: 'usage', amount: String(-ev.cost.amount), effectiveDate: start, requestId: req!.id });
    }
  }
  return { org, ownerId: owner.id, memberIds: ids };
}
