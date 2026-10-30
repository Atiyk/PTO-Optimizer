import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { members, webhookDeliveries } from '@/db/schema';
import { invokeCapability, type CapabilityName } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { freshDb } from '@/test/db';
import { scanCoverageGaps, scanExpiringCredentials } from './coverageEvents';
import { seedChildcareCentre } from './seedCoverage';
import { WEBHOOK_DATA } from './webhookSchemas';

/*
 * Phase 6 coverage webhooks: coverage.gap_detected, cover.requested, cover.filled,
 * credential.expiring. Each fires once (dedupe keys), carries the rule and its citation, and
 * never carries children, pay or a reason for absence.
 */
const TODAY = '2026-11-01'; // Sunday; Monday 11-02 has approved toddler leave (15:30–16:30 one short).
const NOW = new Date(`${TODAY}T18:00:00Z`);
const MON = '2026-11-02';
let db: Db;
let S: Awaited<ReturnType<typeof seedChildcareCentre>>;
const id = (i: number) => S.staffIds[i]!;
async function actor(i: number): Promise<Actor> {
  const [m] = await db.select().from(members).where(eq(members.id, id(i)));
  return { type: 'human', orgId: m!.orgId, memberId: m!.id, role: m!.role, clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m!.role] };
}
const run = <N extends CapabilityName>(a: Actor, name: N, input: unknown) => invokeCapability(name, { db, actor: a, now: NOW }, input);
// Every real payload must match its published schema exactly (no extra keys).
const delivered = async (event: keyof typeof WEBHOOK_DATA) =>
  (await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.orgId, S.org.id), eq(webhookDeliveries.event, event)))).map((d) => {
    expect(WEBHOOK_DATA[event].parse(d.payload), event).toEqual(d.payload);
    return d.payload as any;
  });
const FORBIDDEN = /reason|children|child|wage|pay ?rate|hourly ?rate|\$|birth/i;

beforeEach(async () => {
  db = await freshDb();
  S = await seedChildcareCentre(db, TODAY);
  await run(await actor(0), 'manageWebhooks', {
    op: 'create',
    url: 'https://hooks.example.com/coverage',
    events: ['coverage.gap_detected', 'cover.requested', 'cover.filled', 'credential.expiring'],
  });
});

describe('coverage webhooks', () => {
  it('coverage.gap_detected: each gap in the next 14 days once, with the rule and its citation', async () => {
    const n = await scanCoverageGaps(db, S.org.id, NOW);
    expect(n).toBeGreaterThan(0);
    const gaps = await delivered('coverage.gap_detected');
    const toddler = gaps.find((g) => g.date === MON && g.room?.name === 'Toddlers');
    expect(toddler).toMatchObject({ start: '15:30', end: '16:30', short: 1, rule: { kind: 'ratio', basis: 'law' }, site: { id: S.locationId } });
    expect(toddler.rule.citation.section).toMatch(/1596\.955/);
    expect(toddler.notice).toMatch(/Not legal advice/);
    // Pending leave (Wednesday) is not a gap yet.
    expect(gaps.some((g) => g.date === '2026-11-04')).toBe(false);
    expect(await scanCoverageGaps(db, S.org.id, NOW)).toBe(0); // deduped
    expect(JSON.stringify(gaps)).not.toMatch(FORBIDDEN);
  });

  it('credential.expiring: at 30, 14 and 7 days and just after expiry, once each', async () => {
    expect(await scanExpiringCredentials(db, S.org.id, NOW)).toBe(4);
    const ev = await delivered('credential.expiring');
    expect(ev.map((e) => e.daysLeft).sort((a, b) => a - b)).toEqual([-3, 6, 12, 25]);
    expect(ev[0]).toMatchObject({ credential: { key: 'pediatric_cpr', name: 'Pediatric CPR and first aid' } });
    expect(ev[0].member.name).toHaveProperty('untrusted_text');
    expect(await scanExpiringCredentials(db, S.org.id, NOW)).toBe(0);
    // Three weeks on, the 25-day one crosses the 7-day line (one new event); the expired one stays quiet.
    expect(await scanExpiringCredentials(db, S.org.id, new Date('2026-11-21T18:00:00Z'))).toBe(1);
  });

  it('cover.requested and cover.filled: once each, with the filler and no reason', async () => {
    const mgr = await actor(1);
    const r = await run(mgr, 'requestCover', { op: 'create', locationId: S.locationId, roomId: S.rooms.Toddlers!, date: MON, start: '15:30', end: '16:30', absentMemberId: id(8), idempotencyKey: 'wh-cover-01' });
    const [req] = await delivered('cover.requested');
    expect(req.coverRequest).toMatchObject({ id: r.requestId, room: { name: 'Toddlers' }, date: MON, start: '15:30', end: '16:30', source: 'manual', short: 1, rule: { kind: 'ratio' } });
    expect(req.coverRequest).not.toHaveProperty('absentMember');
    const offered = await Promise.all(S.staffIds.map(async (_, i) => ((await run(await actor(i), 'getCoverRequests', {})).myOffers.length ? i : -1)));
    const who = offered.find((i) => i >= 0)!;
    const offer = (await run(await actor(who), 'getCoverRequests', {})).myOffers[0]!;
    await run(await actor(who), 'respondToCover', { offerId: offer.offerId, response: 'accept' });
    await run(await actor(who), 'respondToCover', { offerId: offer.offerId, response: 'accept' }); // repeat: no second event
    const filled = await delivered('cover.filled');
    expect(filled).toHaveLength(1);
    expect(filled[0]).toMatchObject({ coverRequest: { id: r.requestId }, filledBy: { id: id(who) } });
    expect(JSON.stringify([req, filled])).not.toMatch(FORBIDDEN);
  });

  it('a call-off sends gap events at once, never why', async () => {
    await run(await actor(9), 'reportCallOff', { date: MON, idempotencyKey: 'wh-calloff-1' });
    const gaps = await delivered('coverage.gap_detected');
    expect(gaps.some((g) => g.date === MON && g.start === '16:30' && g.room.name === 'Toddlers')).toBe(true);
    expect((await delivered('cover.requested')).every((c) => c.coverRequest.source === 'call_off')).toBe(true);
    expect(JSON.stringify(gaps)).not.toMatch(FORBIDDEN);
  });
});
