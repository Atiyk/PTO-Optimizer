import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import {
  evaluateCandidate,
  isShortNotice,
  leaveInterval,
  localInterval,
  rankCandidates,
  rulesOf,
  type CandidateFacts,
  type CoverNeed,
  type RankedCandidate,
  type WorkedShift,
} from '@daysoff/engine/coverage/index';
import type { Db } from '@/db/client';
import { coverEvents, coverOffers, coverRequests, leaveRequests, locations, memberCoverPrefs, members, organizations, rooms, shiftExceptions, shiftTemplates } from '@/db/schema';
import { CapabilityError } from '@/capabilities/errors';
import { credentialFacts, getLocation, packsOn, sitePacks, type GapWindow } from './coverage';
import { holidayMap } from './holidays';

/*
 * Cover workflow (COVERAGE-SPEC §4): load candidates' facts org-wide, rank with the pure
 * engine, and keep the request's state as a fold over its append-only events. Pay rates are
 * never loaded here: ranking only sees the overtime band.
 */

export type CoverRequestRow = typeof coverRequests.$inferSelect;
export type CoverStatus = 'open' | 'filled' | 'cancelled';

const DAY_MS = 86_400_000;

/** Every member's shifts across the org on [start, end] (local dates per room's site), from templates and exceptions. */
export async function orgShifts(db: Db, orgId: string, start: string, end: string): Promise<Map<string, WorkedShift[]>> {
  const roomRows = await db
    .select({ id: rooms.id, locationId: rooms.locationId, tz: locations.timezone })
    .from(rooms)
    .innerJoin(locations, eq(locations.id, rooms.locationId))
    .where(eq(rooms.orgId, orgId));
  const roomTz = new Map(roomRows.map((r) => [r.id, r]));
  const tpl = await db.select().from(shiftTemplates).where(eq(shiftTemplates.orgId, orgId));
  const sx = await db.select().from(shiftExceptions).where(and(eq(shiftExceptions.orgId, orgId), gte(shiftExceptions.date, start), lte(shiftExceptions.date, end)));
  const off = new Set(sx.filter((x) => x.kind === 'off').map((x) => `${x.memberId}|${x.date}`));
  const out = new Map<string, WorkedShift[]>();
  const add = (memberId: string, s: WorkedShift) => {
    const list = out.get(memberId) ?? [];
    list.push(s);
    out.set(memberId, list);
  };
  for (const d of rangeISO(start, end)) {
    const dow = mondayIndexedDow(d);
    for (const t of tpl) {
      if (t.weekday !== dow || (t.effectiveFrom && t.effectiveFrom > d) || (t.effectiveTo && t.effectiveTo < d) || off.has(`${t.memberId}|${d}`)) continue;
      const r = roomTz.get(t.roomId);
      if (!r) continue;
      add(t.memberId, { date: d, interval: localInterval(d, t.startMinute, t.endMinute, r.tz), siteId: r.locationId });
    }
  }
  for (const x of sx) {
    if (x.kind !== 'shift' || !x.roomId || x.startMinute == null || x.endMinute == null) continue;
    const r = roomTz.get(x.roomId);
    if (r) add(x.memberId, { date: x.date, interval: localInterval(x.date, x.startMinute, x.endMinute, r.tz), siteId: r.locationId });
  }
  return out;
}

/** Fairness ledger: filled covers per member over the 90 days before `now` (derived, never a counter). */
export async function fairnessLedger(db: Db, orgId: string, now: Date): Promise<Map<string, CandidateFacts['fairness']>> {
  const rows = await db
    .select({ memberId: coverEvents.memberId, data: coverEvents.data })
    .from(coverEvents)
    .where(and(eq(coverEvents.orgId, orgId), eq(coverEvents.kind, 'filled'), gte(coverEvents.at, new Date(now.getTime() - 90 * DAY_MS))));
  const out = new Map<string, CandidateFacts['fairness']>();
  for (const r of rows) {
    if (!r.memberId) continue;
    const f = out.get(r.memberId) ?? { coverTaken: 0, holidayCover: 0, shortNotice: 0 };
    const d = (r.data ?? {}) as { holiday?: boolean; shortNotice?: boolean };
    f.coverTaken++;
    if (d.holiday) f.holidayCover++;
    if (d.shortNotice) f.shortNotice++;
    out.set(r.memberId, f);
  }
  return out;
}

export interface CoverTarget {
  locationId: string;
  roomId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  absentMemberId?: string | null;
  /** The gap's rule, to pick credential needs (role rules need their credential). */
  gap?: Pick<GapWindow, 'kind' | 'ruleId'> | null;
}

export interface RankingResult {
  need: CoverNeed;
  ranked: RankedCandidate[];
  names: Map<string, string>;
  costAware: boolean;
}

/** Build the need from the site's pack and rank every active member of the org. */
export async function rankForTarget(db: Db, orgId: string, t: CoverTarget, now: Date, opts: { onlyMemberIds?: string[] } = {}): Promise<RankingResult> {
  const location = await getLocation(db, orgId, t.locationId);
  const [room] = await db.select().from(rooms).where(and(eq(rooms.orgId, orgId), eq(rooms.id, t.roomId), eq(rooms.locationId, t.locationId)));
  if (!room) throw new CapabilityError('not_found', 'Room not found at this site.');
  if (t.endMinute <= t.startMinute) throw new CapabilityError('invalid_input', 'The cover must end after it starts.');
  const pack = packsOn(await sitePacks(db, orgId, t.locationId), t.date) ?? { ageGroups: [], rules: [] };
  const interval = localInterval(t.date, t.startMinute, t.endMinute, location.timezone);

  const needs: CoverNeed['credentials'][number][] = [];
  for (const r of rulesOf(pack, 'ratio_counts_credential')) if (t.gap?.kind !== 'role_present') needs.push({ anyOf: r.anyOf, ruleId: r.id, provenance: r });
  if (t.gap?.kind === 'role_present') {
    const r = rulesOf(pack, 'role_present').find((x) => x.id === t.gap!.ruleId);
    if (r) needs.push({ anyOf: [r.credential], ruleId: r.id, provenance: r });
  }
  const holidays = await holidayMap(location.countryCode, location.subdivisionCode, t.date, t.date);
  const need: CoverNeed = {
    siteId: t.locationId,
    roomId: t.roomId,
    date: t.date,
    interval,
    credentials: needs,
    absentMemberId: t.absentMemberId ?? null,
    isHoliday: holidays.has(t.date),
    requestedAt: now.getTime(),
  };

  const people = await db
    .select({ id: members.id, name: members.name, locationId: members.locationId, endDate: members.endDate })
    .from(members)
    .where(and(eq(members.orgId, orgId), isNull(members.deletedAt), opts.onlyMemberIds ? inArray(members.id, opts.onlyMemberIds) : undefined));
  const ids = people.map((p) => p.id);
  const ws = addDays(t.date, -mondayIndexedDow(t.date));
  const shifts = await orgShifts(db, orgId, addDays(ws, -7), addDays(ws, 13));
  const prefs = ids.length ? await db.select().from(memberCoverPrefs).where(and(eq(memberCoverPrefs.orgId, orgId), inArray(memberCoverPrefs.memberId, ids))) : [];
  const creds = await credentialFacts(db, orgId, ids);
  const fair = await fairnessLedger(db, orgId, now);
  const leave = ids.length
    ? await db
        .select()
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.orgId, orgId),
            inArray(leaveRequests.memberId, ids),
            inArray(leaveRequests.status, ['pending', 'approved']),
            lte(leaveRequests.startDate, addDays(t.date, 1)),
            gte(leaveRequests.endDate, addDays(t.date, -1)),
          ),
        )
    : [];
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const facts: CandidateFacts[] = people.map((p) => {
    const pref = prefs.find((x) => x.memberId === p.id);
    return {
      memberId: p.id,
      active: !p.endDate || p.endDate >= t.date,
      homeSiteId: p.locationId,
      allowedSiteIds: pref?.allowedLocationIds ?? [],
      optIn: pref?.optIn ?? 'ask',
      shifts: shifts.get(p.id) ?? [],
      absences: leave
        .filter((l) => l.memberId === p.id)
        .flatMap((l) =>
          rangeISO(l.startDate, l.endDate).map((d) => ({
            interval: leaveInterval(d, l.part, location.timezone, l.part === 'hours' && l.startMinute != null && l.endMinute != null ? { startMinute: l.startMinute, endMinute: l.endMinute } : null),
            status: l.status as 'approved' | 'pending',
          })),
        ),
      credentials: creds.get(p.id) ?? [],
      fairness: fair.get(p.id) ?? { coverTaken: 0, holidayCover: 0, shortNotice: 0 },
    };
  });
  const costAware = !!org?.costAwareRanking;
  return { need, ranked: rankCandidates(need, facts, { pack, costAware }), names: new Map(people.map((p) => [p.id, p.name])), costAware };
}

/** Re-check one member at accept time (fresh facts). */
export async function recheck(db: Db, orgId: string, t: CoverTarget, memberId: string, now: Date): Promise<RankedCandidate> {
  const r = await rankForTarget(db, orgId, t, now, { onlyMemberIds: [memberId] });
  const c = r.ranked[0];
  if (!c) throw new CapabilityError('not_found', 'Member not found.');
  return c;
}

export { evaluateCandidate, isShortNotice };

export function targetOf(req: CoverRequestRow): CoverTarget {
  const gap = req.gap as { kind?: GapWindow['kind']; ruleId?: string } | null;
  return {
    locationId: req.locationId,
    roomId: req.roomId,
    date: req.date,
    startMinute: req.startMinute,
    endMinute: req.endMinute,
    absentMemberId: req.absentMemberId,
    gap: gap?.kind && gap.ruleId ? { kind: gap.kind, ruleId: gap.ruleId } : null,
  };
}

/** State is a fold over the request's events. */
export async function coverStatus(db: Db, orgId: string, requestId: string): Promise<{ status: CoverStatus; filledBy: string | null; wave: number }> {
  const ev = await db
    .select({ kind: coverEvents.kind, memberId: coverEvents.memberId, data: coverEvents.data })
    .from(coverEvents)
    .where(and(eq(coverEvents.orgId, orgId), eq(coverEvents.coverRequestId, requestId)))
    .orderBy(coverEvents.at, coverEvents.id);
  let status: CoverStatus = 'open';
  let filledBy: string | null = null;
  let wave = 0;
  for (const e of ev) {
    if (e.kind === 'filled') {
      status = 'filled';
      filledBy = e.memberId;
    } else if (e.kind === 'cancelled') status = 'cancelled';
    else if (e.kind === 'reverted') {
      status = 'open';
      filledBy = null;
    } else if (e.kind === 'offers_sent') wave = Math.max(wave, Number((e.data as { wave?: number } | null)?.wave ?? 0));
  }
  return { status, filledBy, wave };
}

export const offerCount = (db: Db, requestId: string) =>
  db
    .select({ n: sql<number>`count(*)::int` })
    .from(coverOffers)
    .where(eq(coverOffers.coverRequestId, requestId))
    .then((r) => r[0]?.n ?? 0);
