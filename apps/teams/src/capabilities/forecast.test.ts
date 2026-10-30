import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { Db } from '@/db/client';
import { credentials, leaveRequests, leaveTypes, memberCredentials, members } from '@/db/schema';
import { coverageDays, newGaps, siteContext } from '@/domain/coverage';
import { seedChildcareCentre } from '@/server/seedCoverage';
import { freshDb } from '@/test/db';
import { invokeCapability, type CapabilityName } from './registry';
import { ROLE_SCOPES } from './scopes';
import type { Actor } from './types';

/*
 * Phase 5: the coverage forecast (gaps by cause, credential expiry, stagger suggestions) and
 * the planner's block-level re-check at regulated sites. Seed: 3-room CA centre, today Sunday
 * 2026-11-01; Monday 11-02 has approved toddler leave (late shift, 15:30–16:30 one short),
 * Wednesday 11-04 a pending one that would open the same gap; Tuesday 11-10 both early
 * toddler teachers asked for the day (Kwame first, then Hannah).
 */
const TODAY = '2026-11-01';
const NOW = new Date(`${TODAY}T18:00:00Z`);
let db: Db;
let S: Awaited<ReturnType<typeof seedChildcareCentre>>;
const id = (i: number) => S.staffIds[i]!;
async function actor(i: number): Promise<Actor> {
  const [m] = await db.select().from(members).where(eq(members.id, id(i)));
  return { type: 'human', orgId: m!.orgId, memberId: m!.id, role: m!.role, clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m!.role] };
}
const run = <N extends CapabilityName>(a: Actor, name: N, input: unknown) => invokeCapability(name, { db, actor: a, now: NOW }, input);

async function addLeave(i: number, date: string, status: 'approved' | 'pending', createdAt?: Date) {
  const [vac] = (await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, S.org.id))).filter((t) => t.key === 'vacation');
  const [r] = await db.insert(leaveRequests).values({ orgId: S.org.id, memberId: id(i), leaveTypeId: vac!.id, status, startDate: date, endDate: date, engineSnapshot: {}, ...(createdAt ? { createdAt } : {}) }).returning();
  return r!.id;
}

beforeEach(async () => {
  db = await freshDb();
  S = await seedChildcareCentre(db, TODAY);
});

describe('getCoverageForecast', () => {
  it('splits staff-hours short by cause per week, from the engine', async () => {
    const f = await run(await actor(1), 'getCoverageForecast', {});
    expect(f.start).toBe(TODAY);
    expect(f.sites).toHaveLength(1);
    const s = f.sites[0]!;
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks[0]).toMatchObject({ weekStart: TODAY, weekEnd: '2026-11-07', hoursShort: { schedule: 0, credential: 0, approved: 1, pending: 1 }, gapDates: ['2026-11-02', '2026-11-04'] });
    expect(s.weeks[1]).toMatchObject({ hoursShort: { schedule: 0, credential: 0, approved: 0 }, gapDates: ['2026-11-10'] });
    expect(s.weeks[1]!.hoursShort.pending).toBe(2.5); // nobody in Toddlers 07:00–09:30; the late shift covers from 09:30
    expect(s.weeks.slice(2).every((w) => w.gapDates.length === 0)).toBe(true);
    expect(s.totals).toMatchObject({ schedule: 0, credential: 0, approved: 1 });
    // Only Hannah's later request is flagged, with Wednesday 11-11 as the nearest clear day.
    expect(s.staggers.map((x) => [x.name.untrusted_text, x.start, x.suggestion?.start ?? null])).toEqual([
      ['Ava Bennett', '2026-11-04', null],
      ['Hannah Moore', '2026-11-10', '2026-11-11'],
    ]);
    expect(f.notice).toMatch(/Not legal advice/);
    expect(JSON.stringify(f)).not.toMatch(/rate|wage|\$/i);
  });

  it('lists expiring credentials, and says when an expiry first leaves a room short', async () => {
    // Org policy on top of the CA pack: a CPR holder in every room with children. Hannah's CPR
    // (toddlers, early) lapses on 11-05 and Kwame's (same shift) on 11-07, so from Monday 11-09
    // nobody in Toddlers holds CPR before the late shift arrives at 09:30.
    const owner = await actor(0);
    const pack = await run(owner, 'saveRulePack', {
      pack: {
        name: 'CPR in every room', vertical: 'childcare', jurisdiction: 'US-CA', version: 1, effectiveFrom: '2026-01-01', ageGroups: [],
        rules: [{ id: 'cpr-room', label: 'A CPR holder in each room', kind: 'role_present', credential: 'pediatric_cpr', min: 1, scope: 'room', when: 'children_present', basis: 'org_policy' }],
      },
    });
    await run(owner, 'manageSchedule', { op: 'selectRulePack', locationId: S.locationId, packKey: pack.key, effectiveFrom: '2026-01-01' });
    const [cpr] = await db.select().from(credentials).where(and(eq(credentials.orgId, S.org.id), eq(credentials.key, 'pediatric_cpr')));
    await db.update(memberCredentials).set({ expiresOn: '2026-11-05' }).where(and(eq(memberCredentials.memberId, id(6)), eq(memberCredentials.credentialId, cpr!.id)));

    const s = (await run(await actor(1), 'getCoverageForecast', { weeks: 2 })).sites[0]!;
    const alert = (i: number) => s.credentialAlerts.find((a) => a.memberId === id(i));
    expect(s.credentialAlerts.map((a) => a.expiresOn)).toEqual([...s.credentialAlerts.map((a) => a.expiresOn)].sort());
    expect(alert(4)).toMatchObject({ expiresOn: '2026-10-29', credentialName: 'Pediatric CPR and first aid', firstGapDate: null }); // infants: others hold CPR
    expect(alert(6)).toMatchObject({ expiresOn: '2026-11-05', firstGapDate: '2026-11-09', gapDays: 5 });
    expect(alert(7)).toMatchObject({ expiresOn: '2026-11-07', firstGapDate: '2026-11-09', gapDays: 5 });
    expect(alert(6)!.name).toEqual({ untrusted_text: 'Hannah Moore' });
    // 07:00–09:30, five weekdays in week 2: 2.5 staff-hours a day, all down to credentials.
    expect(s.weeks[1]!.hoursShort).toMatchObject({ schedule: 0, credential: 12.5 });
    expect(s.weeks[0]!.hoursShort.credential).toBe(0);
  });

  it('suggests moving a pending request by the fewest days that opens no gap', async () => {
    // Hannah (toddlers, early) is off Tue 11-24; Kwame's pending request the same day would
    // leave Toddlers with nobody before 09:30. Wednesday is clear.
    await addLeave(6, '2026-11-24', 'approved');
    const reqId = await addLeave(7, '2026-11-24', 'pending');
    const s = (await run(await actor(1), 'getCoverageForecast', {})).sites[0]!;
    const st = s.staggers.find((x) => x.requestId === reqId)!;
    expect(st).toMatchObject({ start: '2026-11-24', end: '2026-11-24', suggestion: { start: '2026-11-25', end: '2026-11-25', shiftDays: 1 } });
    expect(st.firstGap).toMatchObject({ date: '2026-11-24', roomName: 'Toddlers', start: '07:00' });
    expect(st.hoursAdded).toBeGreaterThan(0);
    // The seeded Wednesday request (late toddler shift) has no move that works: every weekday
    // the late shift is the only cover 15:30–16:30.
    expect(s.staggers.find((x) => x.start === '2026-11-04')).toMatchObject({ suggestion: null, hoursAdded: 1 });
  });

  it('two clashing pending requests: first come, first served, so only the later one is flagged', async () => {
    const first = await addLeave(7, '2026-11-17', 'pending', new Date('2026-10-20T10:00:00Z'));
    const later = await addLeave(6, '2026-11-17', 'pending', new Date('2026-10-21T10:00:00Z'));
    const s = (await run(await actor(1), 'getCoverageForecast', {})).sites[0]!;
    expect(s.staggers.some((x) => x.requestId === first)).toBe(false);
    expect(s.staggers.find((x) => x.requestId === later)).toMatchObject({ suggestion: { shiftDays: 1, start: '2026-11-18' } });
    expect(s.weeks[2]!.hoursShort.pending).toBeGreaterThan(0);
  });

  it('is for managers and above only, and stays in the org', async () => {
    await expect(run(await actor(5), 'getCoverageForecast', {})).rejects.toMatchObject({ code: 'forbidden' });
    const other = await seedChildcareCentre(db, TODAY, { orgName: 'Other' });
    await expect(run(await actor(1), 'getCoverageForecast', { locationId: other.locationId })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('runTeamPlan at a regulated site', () => {
  it('never plans a day that opens a ratio gap, re-plans around it, and says why', async () => {
    const plan = await run(await actor(1), 'runTeamPlan', {});
    expect(plan.exact).toBe(false);
    expect(plan.totals.placed).toBeGreaterThan(0);
    // Late toddler staff are the only cover 15:30–16:30: no day works for them.
    for (const i of [8, 9]) {
      const p = plan.people.find((x) => x.memberId === id(i))!;
      expect(p.placed).toBe(0);
      expect(p.shortfallReason).toMatch(/Staffing rules leave room for only 0 of \d+ days .*Toddler program: 1 teacher per 6/);
    }
    // Independent check: every planned day together, on top of booked leave, adds no gap.
    const days = [...new Set(plan.people.flatMap((p) => p.days))].sort();
    const ctx = await siteContext(db, S.org.id, S.locationId, days[0]!, days.at(-1)!);
    const { leaveInterval } = await import('@daysoff/engine/coverage/index');
    for (const d of days) {
      const extra = plan.people.filter((p) => p.days.includes(d)).map((p) => ({ memberId: p.memberId, status: 'approved' as const, interval: leaveInterval(d, 'full', 'America/Los_Angeles', null) }));
      const [before] = coverageDays(ctx, d, d, { includePending: true });
      const [after] = coverageDays(ctx, d, d, { includePending: true, extraAbsences: extra });
      expect(newGaps(before!, after!), d).toEqual([]);
    }
    expect(rangeISO(plan.start, '2026-12-31')).toContain(days.at(-1));
    const again = await run(await actor(1), 'runTeamPlan', {});
    expect(again.people).toEqual(plan.people); // deterministic
  }, 30_000);
});
