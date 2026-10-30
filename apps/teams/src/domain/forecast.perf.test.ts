import { eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { leaveRequests, leaveTypes, members } from '@/db/schema';
import { invokeCapability, type CapabilityName } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { createOrganization } from '@/server/bootstrap';
import { freshDb } from '@/test/db';

/*
 * Phase 5 performance: 60 staff over 5 regulated sites (3 rooms, 12 staff each), one team,
 * forecast of every site for 8 weeks and a team plan through year end with the block-level
 * re-check. Budgets are generous for CI; the measured times go in PROGRESS.md.
 */
const TODAY = '2026-11-01';
const NOW = new Date(`${TODAY}T18:00:00Z`);

it('forecast (5 sites x 8 weeks) and planner (60 staff) stay within budget', async () => {
  const db = await freshDb();
  const { org, owner, team, location } = await createOrganization(
    db,
    { provider: 'dev', subject: 'perf-owner', name: 'Owner', email: null, slackTeamId: null, issuedAt: 0 },
    { orgName: 'Perf', countryCode: 'US', subdivisionCode: 'US-CA', teamName: 'All staff', today: TODAY },
  );
  const actor: Actor = { type: 'human', orgId: org.id, memberId: owner.id, role: 'owner', clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES.owner };
  const run = <N extends CapabilityName>(name: N, input: unknown) => invokeCapability(name, { db, actor, now: NOW }, input);
  const [vac] = (await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, org.id))).filter((t) => t.key === 'vacation');

  const siteIds = [location.id];
  for (let s = 1; s < 5; s++) siteIds.push((await run('manageOrgSetup', { op: 'addLocation', name: `Site ${s + 1}`, countryCode: 'US', subdivisionCode: 'US-CA' })).id!);
  let n = 0;
  for (const [s, siteId] of siteIds.entries()) {
    await run('manageSchedule', { op: 'setTimezone', locationId: siteId, timezone: 'America/Los_Angeles' });
    await run('manageSchedule', { op: 'selectRulePack', locationId: siteId, packKey: 'childcare-us-ca', sickPolicy: 'none', effectiveFrom: '2026-01-01' });
    for (const [room, group, kids] of [['Infants', 'infant', 8], ['Toddlers', 'toddler', 12], ['Preschool', 'preschool', 24]] as const) {
      const roomId = (await run('manageSchedule', { op: 'upsertRoom', locationId: siteId, name: room, groupKey: group })).id!;
      await run('manageSchedule', {
        op: 'setDemand', roomId,
        rows: [0, 1, 2, 3, 4].flatMap((weekday) => [
          { weekday, start: '07:00', end: '09:30', group, count: kids / 2 },
          { weekday, start: '09:30', end: '15:30', group, count: kids },
          { weekday, start: '15:30', end: '18:00', group, count: kids / 2 },
        ]),
      });
      for (let k = 0; k < 4; k++) {
        const [m] = await db.insert(members).values({ orgId: org.id, name: `Staff ${++n}`, role: 'employee', teamId: team.id, locationId: siteId, startDate: '2022-01-01', tags: ['teacher'], employmentType: 'hourly', hoursPerDay: '8' }).returning();
        const [start, end] = k < 2 ? ['07:00', '15:30'] : ['09:30', '18:00'];
        await run('manageSchedule', { op: 'setShifts', memberId: m!.id, rows: [0, 1, 2, 3, 4].map((weekday) => ({ roomId, weekday, start, end })) });
        // Some booked leave across the 8 weeks, half of it pending.
        if (n % 3 === 0) {
          const d = addDays('2026-11-02', (n * 5) % 49);
          await db.insert(leaveRequests).values({ orgId: org.id, memberId: m!.id, leaveTypeId: vac!.id, status: n % 2 ? 'pending' : 'approved', startDate: d, endDate: d, engineSnapshot: {} });
        }
      }
    }
    expect(s).toBeLessThan(5);
  }
  expect(n).toBe(60);

  let t = performance.now();
  const f = await run('getCoverageForecast', { weeks: 8 });
  const forecastMs = performance.now() - t;
  expect(f.sites).toHaveLength(5);
  expect(f.sites.every((s) => s.weeks.length === 8)).toBe(true);

  t = performance.now();
  const plan = await run('runTeamPlan', {});
  const planMs = performance.now() - t;
  expect(plan.people.length).toBeGreaterThanOrEqual(60);

  const line = `PERF forecast 5 sites x 8 weeks: ${Math.round(forecastMs)} ms (${f.sites.map((s) => s.stats.engineRuns).reduce((a, b) => a + b, 0)} engine day-runs); planner 61 people: ${Math.round(planMs)} ms, placed ${plan.totals.placed}/${plan.totals.atRisk}`;
  if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, line);
  expect(forecastMs).toBeLessThan(20_000);
  expect(planMs).toBeLessThan(30_000);
}, 180_000);
