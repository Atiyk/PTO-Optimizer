import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { coverEvents, leaveRequests, memberCoverPrefs, members } from '@/db/schema';
import { advanceWaves } from '@/domain/coverFlow';
import { MockSmsChannel, setPushSender, setSmsChannel } from '@/server/messaging';
import { seedChildcareCentre } from '@/server/seedCoverage';
import { freshDb } from '@/test/db';
import { CAPABILITIES, invokeCapability, type CapabilityName } from './registry';
import { ROLE_SCOPES } from './scopes';
import type { Actor } from './types';

/*
 * Cover workflow (RC3–RC5): ranking with reasons, waves, first-eligible-accept wins (also
 * under a race), re-check at accept, two-tap call-off with no reason, messaging via the
 * adapter only, fairness ledger.
 */

const TODAY = '2026-11-01'; // Sunday: the seed's next Monday (2026-11-02) is tomorrow.
const NOW = new Date(`${TODAY}T18:00:00Z`);
const MON = '2026-11-02';

let db: Db;
let S: Awaited<ReturnType<typeof seedChildcareCentre>>;
let sms: MockSmsChannel;
const pushed: string[] = [];
const id = (i: number) => S.staffIds[i]!;
async function actor(i: number): Promise<Actor> {
  const [m] = await db.select().from(members).where(eq(members.id, id(i)));
  return { type: 'human', orgId: m!.orgId, memberId: m!.id, role: m!.role, clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m!.role] };
}
const run = <N extends CapabilityName>(a: Actor, name: N, input: unknown, now = NOW) => invokeCapability(name, { db, actor: a, now }, input);
const toddlerGap = () => ({ locationId: S.locationId, roomId: S.rooms.Toddlers!, date: MON, start: '15:30', end: '16:30', absentMemberId: id(8) });

beforeEach(async () => {
  db = await freshDb();
  S = await seedChildcareCentre(db, TODAY);
  sms = new MockSmsChannel();
  setSmsChannel(sms);
  pushed.length = 0;
  setPushSender({ send: async (_s, p) => (pushed.push(p), { ok: true }) });
});
afterEach(() => {
  setSmsChannel(null);
  setPushSender(null);
});

describe('findCover', () => {
  it('ranks eligible people by fairness then id, and says why others are excluded', async () => {
    const out = await run(await actor(1), 'findCover', toddlerGap());
    expect(out.gap).toMatchObject({ short: 1 });
    expect(out.gap!.citation).toMatch(/1596\.955/);
    const by = new Map(out.candidates.map((c) => [c.memberId, c]));
    expect(by.get(id(8))).toMatchObject({ eligible: false, excludedBy: 'active' }); // the absent person
    expect(by.get(id(9))).toMatchObject({ eligible: false, excludedBy: 'available' }); // already in Toddlers then
    const eligible = out.candidates.filter((c) => c.eligible);
    expect(eligible.length).toBeGreaterThan(3);
    expect(eligible.map((c) => c.rank)).toEqual(eligible.map((_, i) => i + 1));
    const ids = eligible.map((c) => c.memberId);
    expect(ids).toEqual([...ids].sort()); // all score 0: tie-break by id
    expect(JSON.stringify(out)).not.toMatch(/rate|wage|\$/i);
  });

  it('staff cannot rank cover', async () => {
    await expect(run(await actor(5), 'findCover', toddlerGap())).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('requestCover and respondToCover', () => {
  it('offers a wave of 3, the first accept fills it, the gap closes, a later accept is "already filled"', async () => {
    const mgr = await actor(1);
    const r = await run(mgr, 'requestCover', { op: 'create', ...toddlerGap(), idempotencyKey: 'cover-req-001' });
    expect(r.offersSent).toBe(3);
    expect(pushed).toHaveLength(0); // nobody subscribed to push
    const offered = (await run(mgr, 'getCoverRequests', {})).requests[0]!.offers;
    expect(offered.map((o) => o.wave)).toEqual([1, 1, 1]);

    const offersOf = async (i: number) => (await run(await actor(i), 'getCoverRequests', {})).myOffers;
    const who = (await Promise.all(S.staffIds.map(async (_, i) => ((await offersOf(i)).length ? i : -1)))).filter((i) => i >= 0);
    expect(who).toHaveLength(3);
    const [a, b] = who;
    const first = await run(await actor(a!), 'respondToCover', { offerId: (await offersOf(a!))[0]!.offerId, response: 'accept' });
    expect(first.status).toBe('filled');
    const again = await run(await actor(a!), 'respondToCover', { offerId: (await offersOf(a!))[0]!.offerId, response: 'accept' });
    expect(again.status).toBe('filled'); // idempotent
    const late = await run(await actor(b!), 'respondToCover', { offerId: (await offersOf(b!))[0]!.offerId, response: 'accept' });
    expect(late.status).toBe('already_filled');

    const cov = await run(mgr, 'getCoverage', { locationId: S.locationId, date: MON });
    expect(cov.days[0]!.gaps).toEqual([]);
    const filled = await db.select().from(coverEvents).where(eq(coverEvents.kind, 'filled'));
    expect(filled).toHaveLength(1);
  });

  it('two simultaneous accepts: exactly one wins (RC4)', async () => {
    const mgr = await actor(1);
    await run(mgr, 'requestCover', { op: 'create', ...toddlerGap(), idempotencyKey: 'cover-req-002' });
    const offers = await Promise.all(S.staffIds.map(async (_, i) => ({ i, o: (await run(await actor(i), 'getCoverRequests', {})).myOffers[0] })));
    const two = offers.filter((x) => x.o).slice(0, 2);
    const results = await Promise.all(two.map(async ({ i, o }) => run(await actor(i), 'respondToCover', { offerId: o!.offerId, response: 'accept' })));
    expect(results.map((r) => r.status).sort()).toEqual(['already_filled', 'filled']);
    expect(await db.select().from(coverEvents).where(eq(coverEvents.kind, 'filled'))).toHaveLength(1);
  });

  it('re-checks at accept: someone who went on leave since the offer is refused with the reason', async () => {
    const mgr = await actor(1);
    await run(mgr, 'requestCover', { op: 'create', ...toddlerGap(), idempotencyKey: 'cover-req-003' });
    const offers = await Promise.all(S.staffIds.map(async (_, i) => ({ i, o: (await run(await actor(i), 'getCoverRequests', {})).myOffers[0] })));
    const { i, o } = offers.find((x) => x.o)!;
    const [vac] = await db.select().from(leaveRequests).limit(1);
    await db.insert(leaveRequests).values({ orgId: S.org.id, memberId: id(i), leaveTypeId: vac!.leaveTypeId, status: 'approved', startDate: MON, endDate: MON, engineSnapshot: { amount: 1, unit: 'days', chargedDates: [MON], excluded: [] } });
    const r = await run(await actor(i), 'respondToCover', { offerId: o!.offerId, response: 'accept' });
    expect(r).toMatchObject({ status: 'no_longer_eligible' });
    expect(r.reason).toMatch(/approved leave/);
  });

  it('when the whole wave declines, the next wave goes out at once; otherwise after the wait', async () => {
    const mgr = await actor(1);
    const r = await run(mgr, 'requestCover', { op: 'create', ...toddlerGap(), waveSize: 2, waveWaitMinutes: 15 , idempotencyKey: 'cover-req-004' });
    expect(r.offersSent).toBe(2);
    expect(await advanceWaves(db, S.org.id, new Date(NOW.getTime() + 5 * 60_000))).toBe(0);
    expect(await advanceWaves(db, S.org.id, new Date(NOW.getTime() + 16 * 60_000))).toBe(1);
    let req = (await run(mgr, 'getCoverRequests', {})).requests[0]!;
    expect(req.offers.map((o) => o.wave)).toEqual([1, 1, 2, 2]);
    for (const [i] of S.staffIds.entries()) {
      for (const o of (await run(await actor(i), 'getCoverRequests', {})).myOffers) await run(await actor(i), 'respondToCover', { offerId: o.offerId, response: 'decline' });
    }
    req = (await run(mgr, 'getCoverRequests', {})).requests[0]!;
    expect(Math.max(...req.offers.map((o) => o.wave))).toBeGreaterThanOrEqual(3);
  });

  it('an agent can never accept cover', async () => {
    const mgr = await actor(1);
    await run(mgr, 'requestCover', { op: 'create', ...toddlerGap(), idempotencyKey: 'cover-req-005' });
    const offers = await Promise.all(S.staffIds.map(async (_, i) => ({ i, o: (await run(await actor(i), 'getCoverRequests', {})).myOffers[0] })));
    const { i, o } = offers.find((x) => x.o)!;
    const human = await actor(i);
    const agent: Actor = { ...human, type: 'agent-on-behalf-of-user', clientId: 'x', onBehalfOfMemberId: human.memberId };
    await expect(run(agent, 'respondToCover', { offerId: o!.offerId, response: 'accept' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('the fairness ledger: a filled cover counts against that person next time', async () => {
    const mgr = await actor(1);
    await run(mgr, 'requestCover', { op: 'create', ...toddlerGap(), idempotencyKey: 'cover-req-006' });
    const offers = await Promise.all(S.staffIds.map(async (_, i) => ({ i, o: (await run(await actor(i), 'getCoverRequests', {})).myOffers[0] })));
    const { i, o } = offers.find((x) => x.o)!;
    await run(await actor(i), 'respondToCover', { offerId: o!.offerId, response: 'accept' });
    const next = await run(mgr, 'findCover', { ...toddlerGap(), date: '2026-11-03', absentMemberId: null });
    const me = next.candidates.find((c) => c.memberId === id(i))!;
    expect(me.eligible).toBe(true);
    expect(me.scoreParts!.fairness).toBe(100); // one cover taken; it started > 24 h after the request, so not short notice
    expect(next.candidates.filter((c) => c.eligible).at(-1)!.memberId).toBe(id(i));
  });
});

describe('reportCallOff', () => {
  it('two taps: records sick leave with no reason, asks for cover for every new gap, messages only via the adapter', async () => {
    // Ava (late toddler shift) calls off tomorrow; Sofia is already out, so Toddlers is short.
    const ava = await actor(9);
    const someone = id(14); // Ethan: early shift ends 15:30, opted in, so ranked first
    await db.insert(memberCoverPrefs).values({ orgId: S.org.id, memberId: someone, optIn: 'yes', smsOptIn: true, smsPhone: '+15555550100' });
    const out = await run(ava, 'reportCallOff', { date: MON, idempotencyKey: 'calloff-ava-1' });
    expect(out.coverRequests.map((c) => [c.roomName, c.start, c.end])).toEqual([
      ['Toddlers', '15:30', '16:30'],
      ['Toddlers', '16:30', '18:00'],
    ]);
    expect(out.coverRequests.every((c) => c.offersSent > 0)).toBe(true);
    const [req] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.id, out.requestId)));
    expect(req).toMatchObject({ source: 'call_off', status: 'approved', note: null });
    // The input has no reason field at all, and nothing else on the request holds one.
    expect(Object.keys(CAPABILITIES.reportCallOff.input.shape).sort()).toEqual(['date', 'idempotencyKey']);
    const again = await run(ava, 'reportCallOff', { date: MON, idempotencyKey: 'calloff-ava-1' });
    expect(again.requestId).toBe(out.requestId);
    // The opted-in SMS recipient got a message with no reason, child data or pay.
    expect(sms.outbox.length).toBeGreaterThan(0);
    for (const m of sms.outbox) {
      expect(m.to).toBe('+15555550100');
      expect(m.msg.text).toMatch(/^Cover offer: Toddlers, Mon, Nov 2, 1[56]:30–1[68]:[03]0 at Sunbeam Oakland\.$/);
    }
  });

  it('rejects dates other than today or tomorrow; a reason sent anyway is dropped, never stored', async () => {
    const ava = await actor(9);
    await expect(run(ava, 'reportCallOff', { date: '2026-11-05', idempotencyKey: 'calloff-x-1' })).rejects.toMatchObject({ code: 'invalid_input' });
    const out = await run(ava, 'reportCallOff', { date: MON, idempotencyKey: 'calloff-x-2', reason: 'flu', note: 'flu' });
    const [req] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, out.requestId));
    expect(JSON.stringify(req)).not.toMatch(/flu/);
  });
});
