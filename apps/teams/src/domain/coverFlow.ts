import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { hhmm } from '@daysoff/engine/coverage/index';
import type { Db } from '@/db/client';
import { coverEvents, coverOffers, coverRequests, locations, rooms, shiftExceptions } from '@/db/schema';
import type { ActorType } from '@/capabilities/types';
import { CapabilityError } from '@/capabilities/errors';
import { coverStatus, isShortNotice, rankForTarget, recheck, targetOf, type CoverRequestRow, type CoverTarget, type RankingResult } from './cover';

const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
import { deliver, type OutboundMessage } from '@/server/messaging';
import { appUrl } from '@/lib/appUrl';
import type { GapWindow } from './coverage';

/*
 * The cover workflow's writes: create a request, send offers in waves, accept (first
 * eligible wins, re-checked at that moment, enforced by a unique index), decline, cancel.
 * Every change is an append-only cover_event.
 */

type By = { actorType: ActorType; memberId: string | null };

export interface CreateCoverInput extends CoverTarget {
  source: 'leave_request' | 'call_off' | 'credential_lapse' | 'manual';
  sourceId?: string | null;
  gap: (Pick<GapWindow, 'kind' | 'ruleId' | 'label' | 'required' | 'present' | 'short'> & { citation?: GapWindow['citation'] }) | null;
  waveSize?: number;
  waveWaitMinutes?: number;
  idempotencyKey?: string | null;
}

export async function createCoverRequest(db: Db, orgId: string, input: CreateCoverInput, by: By, now: Date) {
  const ranking = await rankForTarget(db, orgId, input, now);
  const [req] = await db
    .insert(coverRequests)
    .values({
      orgId,
      locationId: input.locationId,
      roomId: input.roomId,
      date: input.date,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      gap: input.gap ?? { kind: 'manual' },
      source: input.source,
      sourceId: input.sourceId ?? null,
      absentMemberId: input.absentMemberId ?? null,
      waveSize: input.waveSize ?? 3,
      waveWaitMinutes: input.waveWaitMinutes ?? 15,
      createdByMemberId: by.memberId,
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();
  const ev = (kind: (typeof coverEvents.$inferInsert)['kind'], data: unknown, memberId: string | null = null) =>
    db.insert(coverEvents).values({ orgId, coverRequestId: req!.id, at: now, kind, memberId, actorType: by.actorType, actorMemberId: by.memberId, data: data as never });
  await ev('created', { source: input.source });
  const eligible = ranking.ranked.filter((c) => c.eligible);
  await ev('ranked', { eligible: eligible.length, excluded: ranking.ranked.length - eligible.length, order: eligible.map((c) => c.memberId) });
  const sent = await sendWave(db, req!, ranking, 1, by, now);
  return { request: req!, ranking, sent };
}

/** Offer the next `waveSize` eligible people who have no offer yet. */
export async function sendWave(db: Db, req: CoverRequestRow, ranking: RankingResult, wave: number, by: By, now: Date): Promise<string[]> {
  const already = new Set((await db.select({ m: coverOffers.memberId }).from(coverOffers).where(eq(coverOffers.coverRequestId, req.id))).map((r) => r.m));
  const next = ranking.ranked.filter((c) => c.eligible && !already.has(c.memberId)).slice(0, req.waveSize);
  if (next.length === 0) return [];
  const [room] = await db.select({ name: rooms.name, site: locations.name }).from(rooms).innerJoin(locations, eq(locations.id, rooms.locationId)).where(eq(rooms.id, req.roomId));
  const text = `Cover offer: ${room?.name ?? 'a room'}, ${formatDay(req.date)}, ${hhmm(req.startMinute)}–${hhmm(req.endMinute)} at ${room?.site ?? 'your site'}.`;
  const msgs: OutboundMessage[] = next.map((c) => ({ memberId: c.memberId, text, url: `${appUrl()}/m/offers`, dedupeKey: `${req.id}:${c.memberId}` }));
  const channels = await deliver(db, req.orgId, msgs);
  await db.insert(coverOffers).values(
    next.map((c) => ({ orgId: req.orgId, coverRequestId: req.id, memberId: c.memberId, wave, rank: c.rank ?? 0, channel: channels.get(c.memberId) ?? 'in_app', sentAt: now })),
  );
  await db.insert(coverEvents).values({ orgId: req.orgId, coverRequestId: req.id, at: now, kind: 'offers_sent', actorType: by.actorType, actorMemberId: by.memberId, data: { wave, memberIds: next.map((c) => c.memberId) } });
  return next.map((c) => c.memberId);
}

/**
 * Send the next wave for open requests whose last wave has waited long enough (or where
 * everyone offered has declined). Called by the cron route and lazily on cover reads, so no
 * worker or polling is needed. Returns the number of waves sent.
 */
export async function advanceWaves(db: Db, orgId: string | null, now: Date): Promise<number> {
  const open = await db
    .select()
    .from(coverRequests)
    .where(orgId ? eq(coverRequests.orgId, orgId) : undefined)
    .orderBy(desc(coverRequests.createdAt))
    .limit(200);
  let sent = 0;
  for (const req of open) {
    const st = await coverStatus(db, req.orgId, req.id);
    if (st.status !== 'open' || st.wave === 0) continue;
    const offers = await db.select().from(coverOffers).where(eq(coverOffers.coverRequestId, req.id));
    const last = offers.filter((o) => o.wave === st.wave);
    const lastAt = Math.max(...last.map((o) => o.sentAt.getTime()));
    const allDeclined = last.length > 0 && last.every((o) => o.response === 'declined');
    if (!allDeclined && now.getTime() - lastAt < req.waveWaitMinutes * 60_000) continue;
    const ranking = await rankForTarget(db, req.orgId, targetOf(req), now);
    const n = await sendWave(db, req, ranking, st.wave + 1, { actorType: 'service-agent', memberId: null }, now);
    if (n.length) sent++;
  }
  return sent;
}

export type AcceptResult = { status: 'filled'; requestId: string } | { status: 'already_filled' | 'cancelled' } | { status: 'no_longer_eligible'; reason: string };

export async function acceptOffer(db: Db, orgId: string, offerId: string, memberId: string, by: By, now: Date): Promise<AcceptResult> {
  const { offer, req } = await loadOffer(db, orgId, offerId, memberId);
  const st = await coverStatus(db, orgId, req.id);
  if (st.status === 'filled') {
    if (st.filledBy === memberId) return { status: 'filled', requestId: req.id }; // idempotent repeat
    await db.update(coverOffers).set({ response: 'superseded', respondedAt: now }).where(and(eq(coverOffers.id, offer.id), isNull(coverOffers.response)));
    return { status: 'already_filled' };
  }
  if (st.status === 'cancelled') return { status: 'cancelled' };

  // Re-check every hard filter with today's facts (credentials can lapse, a shift can appear).
  const c = await recheck(db, orgId, targetOf(req), memberId, now);
  if (!c.eligible) {
    const failed = c.checks.find((x) => !x.passed)!;
    await db.insert(coverEvents).values({ orgId, coverRequestId: req.id, at: now, kind: 'rule_recheck_failed', memberId, actorType: by.actorType, actorMemberId: by.memberId, data: { check: failed.id, detail: failed.detail } });
    return { status: 'no_longer_eligible', reason: failed.detail };
  }
  const r = await rankForTarget(db, orgId, targetOf(req), now, { onlyMemberIds: [memberId] });
  // Fairness facts for the ledger: holiday cover, and short notice (< 24 h from request to start).
  const data = { offerId: offer.id, holiday: !!r.need.isHoliday, shortNotice: isShortNotice({ interval: r.need.interval, requestedAt: req.createdAt.getTime() }), costBand: c.costBand };
  try {
    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      // The unique partial index on (cover_request_id) WHERE kind = 'filled' makes this the race's single winner.
      await t.insert(coverEvents).values({ orgId, coverRequestId: req.id, at: now, kind: 'filled', memberId, actorType: by.actorType, actorMemberId: by.memberId, data });
      await t.update(coverOffers).set({ response: 'accepted', respondedAt: now }).where(eq(coverOffers.id, offer.id));
      await t
        .update(coverOffers)
        .set({ response: 'superseded', respondedAt: now })
        .where(and(eq(coverOffers.coverRequestId, req.id), isNull(coverOffers.response)));
      await t.insert(shiftExceptions).values({ orgId, memberId, date: req.date, kind: 'shift', roomId: req.roomId, startMinute: req.startMinute, endMinute: req.endMinute });
    });
  } catch (e) {
    const again = await coverStatus(db, orgId, req.id);
    if (again.status === 'filled' && again.filledBy !== memberId) return { status: 'already_filled' };
    if (again.status === 'filled') return { status: 'filled', requestId: req.id };
    throw e;
  }
  return { status: 'filled', requestId: req.id };
}

export async function declineOffer(db: Db, orgId: string, offerId: string, memberId: string, by: By, now: Date) {
  const { offer, req } = await loadOffer(db, orgId, offerId, memberId);
  if (offer.response === 'declined') return { status: 'declined' as const };
  if (offer.response) throw new CapabilityError('conflict', `This offer is already ${offer.response}.`);
  await db.update(coverOffers).set({ response: 'declined', respondedAt: now }).where(eq(coverOffers.id, offer.id));
  await db.insert(coverEvents).values({ orgId, coverRequestId: req.id, at: now, kind: 'declined', memberId, actorType: by.actorType, actorMemberId: by.memberId, data: null });
  await advanceWaves(db, orgId, now);
  return { status: 'declined' as const };
}

export async function cancelCoverRequest(db: Db, orgId: string, requestId: string, by: By, now: Date) {
  const [req] = await db.select().from(coverRequests).where(and(eq(coverRequests.orgId, orgId), eq(coverRequests.id, requestId)));
  if (!req) throw new CapabilityError('not_found', 'Cover request not found.');
  const st = await coverStatus(db, orgId, req.id);
  if (st.status === 'cancelled') return req;
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await t.insert(coverEvents).values({ orgId, coverRequestId: req.id, at: now, kind: st.status === 'filled' ? 'reverted' : 'cancelled', actorType: by.actorType, actorMemberId: by.memberId, data: null });
    if (st.status === 'filled') {
      await t.insert(coverEvents).values({ orgId, coverRequestId: req.id, at: now, kind: 'cancelled', actorType: by.actorType, actorMemberId: by.memberId, data: null });
      // Remove the cover shift that the accept added.
      await t
        .delete(shiftExceptions)
        .where(and(eq(shiftExceptions.orgId, orgId), eq(shiftExceptions.memberId, st.filledBy!), eq(shiftExceptions.date, req.date), eq(shiftExceptions.roomId, req.roomId), eq(shiftExceptions.startMinute, req.startMinute)));
    }
    await t.update(coverOffers).set({ response: 'expired', respondedAt: now }).where(and(eq(coverOffers.coverRequestId, req.id), isNull(coverOffers.response)));
  });
  return req;
}

async function loadOffer(db: Db, orgId: string, offerId: string, memberId: string) {
  const [row] = await db
    .select({ offer: coverOffers, req: coverRequests })
    .from(coverOffers)
    .innerJoin(coverRequests, eq(coverRequests.id, coverOffers.coverRequestId))
    .where(and(eq(coverOffers.orgId, orgId), eq(coverOffers.id, offerId), eq(coverOffers.memberId, memberId)));
  if (!row) throw new CapabilityError('not_found', 'Offer not found.');
  return row;
}

export async function offersFor(db: Db, orgId: string, requestIds: string[]) {
  if (requestIds.length === 0) return [];
  return db.select().from(coverOffers).where(and(eq(coverOffers.orgId, orgId), inArray(coverOffers.coverRequestId, requestIds)));
}
