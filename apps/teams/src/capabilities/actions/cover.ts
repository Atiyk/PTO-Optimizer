import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { scanCoverageGaps } from '@/server/coverageEvents';
import { kickWebhooks } from '@/server/webhooks';
import { z } from 'zod';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { hhmm, parseHhmm } from '@daysoff/engine/coverage/timeBlocks';
import { balanceLedger, coverOffers as offersTable, coverRequests, leaveRequests, locations, members, rooms, shiftExceptions, shiftTemplates } from '@/db/schema';
import { coverStatus, memberToday, rankForTarget } from '@/domain/cover';
import { acceptOffer, advanceWaves, cancelCoverRequest, createCoverRequest, declineOffer, offersFor } from '@/domain/coverFlow';
import { blockImpact, coverageDays, gapWindows, getLocation, siteContext, type GapWindow } from '@/domain/coverage';
import { evaluateRequest, getLeaveTypeByKey, getMember, isoDate } from '@/domain/leave';
import { CapabilityError } from '../errors';
import { actingMemberId, subjectMember, untrusted } from '../helpers';
import { defineCapability, type Actor } from '../types';
import { NOT_LEGAL_ADVICE } from './coverage';

/*
 * Cover workflow capabilities (COVERAGE-SPEC §4, §7). The engine ranks; these only load
 * facts, record events and send offers. Pay rates never appear: only a cost band.
 */

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const hhmmStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'HH:MM');
const by = (a: Actor) => ({ actorType: a.type, memberId: actingMemberId(a) });
const minute = (s: string) => parseHhmm(s);

export const target = z.object({
  locationId: z.uuid(),
  roomId: z.uuid(),
  date: isoDay,
  start: hhmmStr.describe('Local start time of the cover, HH:MM.'),
  end: hhmmStr.describe('Local end time, HH:MM.'),
  absentMemberId: z.uuid().nullable().optional().describe('The person whose absence made the gap (never offered the cover).'),
});

/** The engine's gap overlapping this window in this room, if any (for the snapshot and credential needs). */
async function gapAt(db: Parameters<typeof siteContext>[0], orgId: string, t: { locationId: string; roomId: string; date: string; startMinute: number; endMinute: number }): Promise<GapWindow | null> {
  const ctx = await siteContext(db, orgId, t.locationId, t.date, t.date);
  const day = coverageDays(ctx, t.date, t.date)[0];
  if (!day) return null;
  return gapWindows(day).find((g) => (g.roomId === t.roomId || g.roomId === null) && g.kind !== 'group_size' && g.startMinute < t.endMinute && t.startMinute < g.endMinute) ?? null;
}

const checkOut = z.object({ id: z.string(), passed: z.boolean(), detail: z.string(), rule: z.string().nullable() });
const candidateOut = z.object({
  memberId: z.string(),
  name: z.object({ untrusted_text: z.string() }).nullable(),
  eligible: z.boolean(),
  rank: z.number().nullable(),
  score: z.number().nullable(),
  scoreParts: z.object({ fairness: z.number(), preference: z.number(), cost: z.number(), travel: z.number() }).nullable(),
  costBand: z.enum(['regular', 'overtime']),
  excludedBy: z.string().nullable(),
  checks: z.array(checkOut),
});

export const findCover = defineCapability({
  name: 'findCover',
  description:
    'Ranks who can legally and fairly cover a time window in a room: every person is checked against hard rules ' +
    '(active, allowed at the site, opted in, not on leave, not already scheduled, valid credential, minimum rest, ' +
    'maximum hours per day and week, consecutive days), then scored for fairness (covers taken in 90 days, holiday ' +
    'and short-notice covers), preference and overtime band. Every exclusion says why. Reads only; send offers with ' +
    'requestCover. Quote these results; never rank people yourself.',
  input: target,
  output: z.object({
    window: z.object({ date: z.string(), start: z.string(), end: z.string(), roomName: z.string() }),
    gap: z.object({ label: z.string(), short: z.number(), citation: z.string().nullable() }).nullable(),
    candidates: z.array(candidateOut),
    notice: z.string(),
  }),
  scope: 'cover:request',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    await getLocation(db, actor.orgId, input.locationId);
    const t = { ...input, startMinute: minute(input.start), endMinute: minute(input.end) };
    const gap = await gapAt(db, actor.orgId, t);
    const r = await rankForTarget(db, actor.orgId, { ...t, gap }, now);
    const [room] = await db.select({ name: rooms.name }).from(rooms).where(eq(rooms.id, input.roomId));
    return {
      window: { date: input.date, start: input.start, end: input.end, roomName: room?.name ?? '' },
      gap: gap ? { label: gap.label, short: gap.short, citation: gap.citation ? `${gap.citation.regulation} ${gap.citation.section}` : null } : null,
      candidates: r.ranked.map((c) => ({
        memberId: c.memberId,
        name: untrusted(r.names.get(c.memberId)),
        eligible: c.eligible,
        rank: c.rank,
        score: c.score,
        scoreParts: c.scoreParts,
        costBand: c.costBand,
        excludedBy: c.excludedBy,
        checks: c.checks.map((x) => ({ id: x.id, passed: x.passed, detail: x.detail, rule: x.provenance?.citation ? `${x.provenance.citation.regulation} ${x.provenance.citation.section}` : x.ruleId ? 'your policy' : null })),
      })),
      notice: NOT_LEGAL_ADVICE,
    };
  },
});

const requestOut = z.object({
  requestId: z.string(),
  status: z.enum(['open', 'filled', 'cancelled']),
  offersSent: z.number(),
  eligible: z.number(),
  excluded: z.number(),
});

export const requestCover = defineCapability({
  name: 'requestCover',
  description:
    'Asks for cover for a time window: ranks candidates (as findCover) and sends offers to the top few (a wave, ' +
    'default 3), then the next wave after the wait (default 15 minutes) if nobody accepts. The first eligible ' +
    'person to accept gets it, re-checked at that moment. Use op "cancel" with requestId to withdraw. Agents ' +
    'create a draft a manager confirms.',
  input: z.discriminatedUnion('op', [
    target.extend({
      op: z.literal('create'),
      waveSize: z.number().int().min(1).max(10).default(3),
      waveWaitMinutes: z.number().int().min(5).max(240).default(15),
      idempotencyKey: z.string().min(8).max(100).describe('Unique per request, so a retry returns the same cover request.'),
    }),
    z.object({ op: z.literal('cancel'), requestId: z.uuid() }),
  ]),
  output: requestOut,
  scope: 'cover:request',
  roles: ['owner', 'admin', 'manager'],
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: (i, o) => (i.op === 'cancel' ? `Cancelled cover request` : `Requested cover ${i.date} ${i.start}–${i.end}: ${o.offersSent} offers sent`),
  async handler({ db, actor, now }, input) {
    if (input.op === 'cancel') {
      const req = await cancelCoverRequest(db, actor.orgId, input.requestId, by(actor), now);
      return { requestId: req.id, status: 'cancelled' as const, offersSent: 0, eligible: 0, excluded: 0 };
    }
    await getLocation(db, actor.orgId, input.locationId);
    if (input.absentMemberId) await getMember(db, actor.orgId, input.absentMemberId);
    const [dup] = await db.select().from(coverRequests).where(and(eq(coverRequests.orgId, actor.orgId), eq(coverRequests.idempotencyKey, input.idempotencyKey)));
    if (dup) {
      const st = await coverStatus(db, actor.orgId, dup.id);
      const offered = (await offersFor(db, actor.orgId, [dup.id])).length;
      return { requestId: dup.id, status: st.status, offersSent: offered, eligible: 0, excluded: 0 };
    }
    const t = { ...input, startMinute: minute(input.start), endMinute: minute(input.end) };
    const gap = await gapAt(db, actor.orgId, t);
    const { request, ranking, sent } = await createCoverRequest(db, actor.orgId, { ...t, source: 'manual', gap, waveSize: input.waveSize, waveWaitMinutes: input.waveWaitMinutes, idempotencyKey: input.idempotencyKey }, by(actor), now);
    const eligible = ranking.ranked.filter((c) => c.eligible).length;
    return { requestId: request.id, status: 'open' as const, offersSent: sent.length, eligible, excluded: ranking.ranked.length - eligible };
  },
});

export const respondToCover = defineCapability({
  name: 'respondToCover',
  description:
    'Accepts or declines a cover offer made to you. Accepting re-checks every rule at that moment; if someone else ' +
    'already took it, the answer is "already_filled". Accepting is for people only, never an agent.',
  input: z.object({ offerId: z.uuid(), response: z.enum(['accept', 'decline']) }),
  output: z.object({ status: z.enum(['filled', 'already_filled', 'cancelled', 'no_longer_eligible', 'declined']), reason: z.string().nullable() }),
  scope: 'cover:respond',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: (i, o) => `${i.response === 'accept' ? 'Accepted' : 'Declined'} a cover offer: ${o.status}`,
  async handler({ db, actor, now }, input) {
    const me = actingMemberId(actor);
    if (!me) throw new CapabilityError('forbidden', 'Only a member can answer a cover offer.');
    if (input.response === 'accept' && actor.type !== 'human') throw new CapabilityError('forbidden', 'Accepting cover is for people only. Open the app to accept.');
    if (input.response === 'decline') {
      await declineOffer(db, actor.orgId, input.offerId, me, by(actor), now);
      return { status: 'declined' as const, reason: null };
    }
    const r = await acceptOffer(db, actor.orgId, input.offerId, me, by(actor), now);
    return { status: r.status, reason: r.status === 'no_longer_eligible' ? r.reason : null };
  },
});

export const reportCallOff = defineCapability({
  name: 'reportCallOff',
  description:
    'Tells your manager you cannot come in (sick or an emergency). No reason is asked or stored. It records the ' +
    'absence as sick leave and, at regulated sites, immediately asks for cover for any staffing gap it opens.',
  input: z.object({
    date: isoDay.optional().describe('Defaults to today.'),
    idempotencyKey: z.string().min(8).max(100).describe('Unique per call-off, so a retry does not record it twice.'),
  }),
  output: z.object({
    requestId: z.string(),
    date: z.string(),
    deducted: z.number(),
    balanceNote: z.string().nullable(),
    coverRequests: z.array(z.object({ requestId: z.string(), roomName: z.string().nullable(), start: z.string(), end: z.string(), offersSent: z.number() })),
  }),
  scope: 'cover:respond',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: (_i, o) => `Call-off for ${o.date}: ${o.coverRequests.length} cover requests`,
  async handler({ db, actor, now }, input) {
    const member = await subjectMember(db, actor);
    const today = await memberToday(db, actor.orgId, member.id, now);
    const date = input.date ?? today;
    if (date < today || date > addDays(today, 1)) throw new CapabilityError('invalid_input', 'A call-off is for today or tomorrow. Use a leave request for other dates.');
    const [existing] = await db.select().from(leaveRequests).where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.idempotencyKey, input.idempotencyKey)));
    if (existing) {
      if (existing.memberId !== member.id) throw new CapabilityError('conflict', 'That idempotency key was already used.');
      const reqs = await db.select().from(coverRequests).where(and(eq(coverRequests.orgId, actor.orgId), eq(coverRequests.sourceId, existing.id)));
      const snap = existing.engineSnapshot as { amount?: number } | null;
      return {
        requestId: existing.id,
        date: existing.startDate,
        deducted: snap?.amount ?? 0,
        balanceNote: null,
        coverRequests: reqs.map((r) => ({ requestId: r.id, roomName: null, start: hhmm(r.startMinute), end: hhmm(r.endMinute), offersSent: 0 })),
      };
    }
    const sick = await getLeaveTypeByKey(db, actor.orgId, 'sick');
    const ev = await evaluateRequest(db, actor.orgId, member, { leaveTypeKey: 'sick', start: date, end: date, part: 'full' }, isoDate(now));
    // A call-off is a notice, not a request: it is recorded even when the balance cannot cover it.
    const deduct = sick.countsAgainstBalance && ev.problems.length === 0 ? ev.cost.amount : 0;
    const balanceNote = sick.countsAgainstBalance && ev.problems.length ? `Not deducted from the balance: ${ev.problems.join(' ')}` : null;
    const gaps = (await blockImpact(db, actor.orgId, member.id, [date], 'full', null)).filter((g) => g.kind !== 'group_size' && g.roomId);
    const [req] = await db
      .insert(leaveRequests)
      .values({
        orgId: actor.orgId,
        memberId: member.id,
        leaveTypeId: sick.id,
        status: 'approved',
        startDate: date,
        endDate: date,
        part: 'full',
        note: null,
        source: 'call_off',
        engineSnapshot: { amount: deduct, unit: ev.unit, chargedDates: ev.cost.chargedDates, excluded: ev.cost.excluded },
        createdByActorType: actor.type,
        createdByClientId: actor.clientId,
        decidedAt: now,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    if (deduct > 0) {
      await db.insert(balanceLedger).values({ orgId: actor.orgId, memberId: member.id, leaveTypeId: sick.id, kind: 'usage', amount: String(-deduct), unit: ev.unit, effectiveDate: date, requestId: req!.id, createdByActorType: actor.type, createdByMemberId: actor.memberId });
    }
    const covers = [];
    for (const g of gaps) {
      const { request, sent } = await createCoverRequest(
        db,
        actor.orgId,
        { locationId: g.siteId, roomId: g.roomId!, date, startMinute: g.startMinute, endMinute: g.endMinute, absentMemberId: member.id, source: 'call_off', sourceId: req!.id, gap: g },
        { actorType: 'service-agent', memberId: null },
        now,
      );
      covers.push({ requestId: request.id, roomName: g.roomName, start: g.start, end: g.end, offersSent: sent.length });
    }
    // Gap events now rather than at the next daily scan: today and tomorrow at the sites it hits.
    let gapEvents = 0;
    for (const siteId of new Set(gaps.map((g) => g.siteId))) gapEvents += await scanCoverageGaps(db, actor.orgId, now, { locationId: siteId, days: 2 });
    if (gapEvents) kickWebhooks(db, actor.orgId);
    return { requestId: req!.id, date, deducted: deduct, balanceNote, coverRequests: covers };
  },
});

const offerOut = z.object({
  offerId: z.string(),
  requestId: z.string(),
  roomName: z.string(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  response: z.string().nullable(),
  requestStatus: z.enum(['open', 'filled', 'cancelled']),
  takenByYou: z.boolean(),
});

export const getCoverRequests = defineCapability({
  name: 'getCoverRequests',
  description:
    'Cover status. Staff: the cover offers made to you, newest first. Managers and admins: cover requests for a site ' +
    'and date range with who was offered, who answered and who filled it. Reads only.',
  input: z.object({ locationId: z.uuid().optional(), from: isoDay.optional(), to: isoDay.optional() }),
  output: z.object({
    myOffers: z.array(offerOut),
    requests: z.array(
      z.object({
        requestId: z.string(),
        roomName: z.string(),
        date: z.string(),
        start: z.string(),
        end: z.string(),
        source: z.string(),
        status: z.enum(['open', 'filled', 'cancelled']),
        filledBy: z.object({ untrusted_text: z.string() }).nullable(),
        gap: z.string().nullable(),
        offers: z.array(z.object({ name: z.object({ untrusted_text: z.string() }).nullable(), wave: z.number(), response: z.string().nullable() })),
      }),
    ),
  }),
  scope: 'coverage:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }, input) {
    await advanceWaves(db, actor.orgId, now);
    const me = actingMemberId(actor);
    const today = isoDate(now);
    const roomNames = new Map((await db.select({ id: rooms.id, name: rooms.name }).from(rooms).where(eq(rooms.orgId, actor.orgId))).map((r) => [r.id, r.name]));
    const myOffers = [];
    if (me) {
      const rows = await db
        .select({ req: coverRequests, offerId: offersTable.id, response: offersTable.response })
        .from(offersTable)
        .innerJoin(coverRequests, eq(coverRequests.id, offersTable.coverRequestId))
        .where(and(eq(offersTable.orgId, actor.orgId), eq(offersTable.memberId, me), gte(coverRequests.date, addDays(today, -7))))
        .orderBy(desc(offersTable.sentAt))
        .limit(50);
      for (const r of rows) {
        const st = await coverStatus(db, actor.orgId, r.req.id);
        myOffers.push({
          offerId: r.offerId,
          requestId: r.req.id,
          roomName: roomNames.get(r.req.roomId) ?? '',
          date: r.req.date,
          start: hhmm(r.req.startMinute),
          end: hhmm(r.req.endMinute),
          response: r.response,
          requestStatus: st.status,
          takenByYou: st.filledBy === me,
        });
      }
    }
    const manager = actor.role === 'owner' || actor.role === 'admin' || actor.role === 'manager';
    const requests = [];
    if (manager) {
      if (input.locationId) await getLocation(db, actor.orgId, input.locationId);
      const from = input.from ?? addDays(today, -7);
      const to = input.to ?? addDays(today, 28);
      const reqs = await db
        .select()
        .from(coverRequests)
        .where(and(eq(coverRequests.orgId, actor.orgId), input.locationId ? eq(coverRequests.locationId, input.locationId) : undefined, gte(coverRequests.date, from), lte(coverRequests.date, to)))
        .orderBy(coverRequests.date, coverRequests.startMinute)
        .limit(200);
      const offers = await offersFor(db, actor.orgId, reqs.map((r) => r.id));
      const ids = [...new Set(offers.map((o) => o.memberId))];
      const names = new Map(ids.length ? (await db.select({ id: members.id, name: members.name }).from(members).where(inArray(members.id, ids))).map((m) => [m.id, m.name]) : []);
      for (const r of reqs) {
        const st = await coverStatus(db, actor.orgId, r.id);
        const gap = r.gap as { label?: string; citation?: { regulation: string; section: string } | null } | null;
        requests.push({
          requestId: r.id,
          roomName: roomNames.get(r.roomId) ?? '',
          date: r.date,
          start: hhmm(r.startMinute),
          end: hhmm(r.endMinute),
          source: r.source,
          status: st.status,
          filledBy: st.filledBy ? untrusted(names.get(st.filledBy) ?? (await getMember(db, actor.orgId, st.filledBy)).name) : null,
          gap: gap?.label ? `${gap.label}${gap.citation ? ` (${gap.citation.regulation} ${gap.citation.section})` : ''}` : null,
          offers: offers.filter((o) => o.coverRequestId === r.id).map((o) => ({ name: untrusted(names.get(o.memberId)), wave: o.wave, response: o.response })),
        });
      }
    }
    return { myOffers, requests };
  },
});

export const getMySchedule = defineCapability({
  name: 'getMySchedule',
  description: 'Your shifts for the next days (including cover you took) with room and site, and any leave you have booked on them. Reads only.',
  input: z.object({ days: z.number().int().min(1).max(28).default(14) }),
  output: z.object({
    /** Today at your site (its time zone), so "today" and "tomorrow" mean what you expect. */
    today: z.string(),
    shifts: z.array(z.object({ date: z.string(), start: z.string(), end: z.string(), roomName: z.string(), siteName: z.string(), cover: z.boolean(), onLeave: z.boolean() })),
  }),
  scope: 'coverage:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const me = actingMemberId(actor);
    if (!me) throw new CapabilityError('forbidden', 'Only a member has a schedule.');
    const today = await memberToday(db, actor.orgId, me, now);
    const end = addDays(today, input.days - 1);
    const roomRows = await db
      .select({ id: rooms.id, name: rooms.name, site: locations.name })
      .from(rooms)
      .innerJoin(locations, eq(locations.id, rooms.locationId))
      .where(eq(rooms.orgId, actor.orgId));
    const room = (id: string | null) => roomRows.find((x) => x.id === id);
    const tpl = await db.select().from(shiftTemplates).where(and(eq(shiftTemplates.orgId, actor.orgId), eq(shiftTemplates.memberId, me)));
    const ex = await db
      .select()
      .from(shiftExceptions)
      .where(and(eq(shiftExceptions.orgId, actor.orgId), eq(shiftExceptions.memberId, me), gte(shiftExceptions.date, today), lte(shiftExceptions.date, end)));
    const offDays = new Set(ex.filter((x) => x.kind === 'off').map((x) => x.date));
    const leave = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.orgId, actor.orgId), eq(leaveRequests.memberId, me), inArray(leaveRequests.status, ['approved', 'pending']), lte(leaveRequests.startDate, end), gte(leaveRequests.endDate, today)));
    const onLeave = (d: string) => leave.some((l) => l.startDate <= d && l.endDate >= d);
    const out: { date: string; start: string; end: string; roomName: string; siteName: string; cover: boolean; onLeave: boolean }[] = [];
    for (const d of rangeISO(today, end)) {
      for (const t of tpl) {
        if (t.weekday !== mondayIndexedDow(d) || offDays.has(d) || (t.effectiveFrom && t.effectiveFrom > d) || (t.effectiveTo && t.effectiveTo < d)) continue;
        out.push({ date: d, start: hhmm(t.startMinute), end: hhmm(t.endMinute), roomName: room(t.roomId)?.name ?? '', siteName: room(t.roomId)?.site ?? '', cover: false, onLeave: onLeave(d) });
      }
    }
    for (const c of ex.filter((x) => x.kind === 'shift' && x.startMinute != null && x.endMinute != null)) {
      out.push({ date: c.date, start: hhmm(c.startMinute!), end: hhmm(c.endMinute!), roomName: room(c.roomId)?.name ?? '', siteName: room(c.roomId)?.site ?? '', cover: true, onLeave: onLeave(c.date) });
    }
    out.sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
    return { today, shifts: out };
  },
});
