import { and, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import {
  coverageForDay,
  leaveInterval,
  localInterval,
  mergePacks,
  validateRulePack,
  type Absence,
  type CoverageDay,
  type DemandException,
  type DemandTemplateRow,
  type MemberCredentialFact,
  type RulePack,
  type Shortfall,
  type ShiftInstance,
  hhmm,
} from '@daysoff/engine/coverage/index';
import type { Db } from '@/db/client';
import {
  credentials,
  demandExceptions,
  demandTemplates,
  leaveRequests,
  locations,
  memberCredentials,
  members,
  rooms,
  rulePacks,
  shiftExceptions,
  shiftTemplates,
  siteRulePacks,
} from '@/db/schema';
import { CapabilityError } from '@/capabilities/errors';

/*
 * Loads one site's coverage inputs from the DB and hands them to the pure engine
 * (packages/engine/src/coverage). Every query filters by org. A site without a rule pack is
 * not "regulated": callers fall back to the MVP's day-level coverage.
 */

export type LocationRow = typeof locations.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;

export async function getLocation(db: Db, orgId: string, locationId: string): Promise<LocationRow> {
  const [l] = await db.select().from(locations).where(and(eq(locations.orgId, orgId), eq(locations.id, locationId)));
  if (!l) throw new CapabilityError('not_found', 'Site not found in this organization.');
  return l;
}

export interface SitePack {
  id: string;
  key: string;
  version: number;
  pack: RulePack;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** Packs linked to a site (all dates), oldest first. */
export async function sitePacks(db: Db, orgId: string, locationId: string): Promise<SitePack[]> {
  const rows = await db
    .select({ link: siteRulePacks, pack: rulePacks })
    .from(siteRulePacks)
    .innerJoin(rulePacks, and(eq(rulePacks.id, siteRulePacks.rulePackId), eq(rulePacks.orgId, orgId)))
    .where(and(eq(siteRulePacks.orgId, orgId), eq(siteRulePacks.locationId, locationId)))
    .orderBy(siteRulePacks.effectiveFrom);
  return rows.map((r) => ({
    id: r.pack.id,
    key: r.pack.key,
    version: r.pack.version,
    pack: r.pack.pack as RulePack,
    effectiveFrom: r.link.effectiveFrom,
    effectiveTo: r.link.effectiveTo,
  }));
}

/** The merged rules in force at a site on a date (null = not a regulated site that day). */
export function packsOn(packs: readonly SitePack[], date: string): Pick<RulePack, 'ageGroups' | 'rules'> | null {
  // One pack per key: the latest link that applies on the date.
  const byKey = new Map<string, SitePack>();
  for (const p of packs) if (p.effectiveFrom <= date && (!p.effectiveTo || p.effectiveTo >= date)) byKey.set(p.key, p);
  if (byKey.size === 0) return null;
  return mergePacks([...byKey.values()].map((p) => p.pack));
}

export async function isRegulatedSite(db: Db, orgId: string, locationId: string | null): Promise<boolean> {
  if (!locationId) return false;
  return (await sitePacks(db, orgId, locationId)).length > 0;
}

export function assertValidPack(pack: RulePack): void {
  const errs = validateRulePack(pack);
  if (errs.length) throw new CapabilityError('invalid_input', `The rule pack is not valid: ${errs.join('; ')}`);
}

export interface SiteContext {
  location: LocationRow;
  rooms: RoomRow[];
  packs: SitePack[];
  demand: DemandTemplateRow[];
  exceptions: DemandException[];
  shifts: (ShiftInstance & { date: string })[];
  absences: (Absence & { requestId: string; date: string })[];
  credentials: Map<string, MemberCredentialFact[]>;
  memberNames: Map<string, string>;
}

export interface ContextOptions {
  /** Leave requests to ignore (e.g. the one being re-evaluated). */
  excludeRequestId?: string;
}

/** Everything the engine needs for a site over [start, end] (local dates). */
export async function siteContext(db: Db, orgId: string, locationId: string, start: string, end: string, opts: ContextOptions = {}): Promise<SiteContext> {
  const location = await getLocation(db, orgId, locationId);
  const tz = location.timezone;
  const roomRows = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.orgId, orgId), eq(rooms.locationId, locationId), isNull(rooms.archivedAt)))
    .orderBy(rooms.name);
  const roomIds = roomRows.map((r) => r.id);
  const packs = await sitePacks(db, orgId, locationId);
  const ctx: SiteContext = { location, rooms: roomRows, packs, demand: [], exceptions: [], shifts: [], absences: [], credentials: new Map(), memberNames: new Map() };
  if (roomIds.length === 0) return ctx;

  const dem = await db.select().from(demandTemplates).where(and(eq(demandTemplates.orgId, orgId), inArray(demandTemplates.roomId, roomIds)));
  ctx.demand = dem.map((d) => ({ roomId: d.roomId, weekday: d.weekday, startMinute: d.startMinute, endMinute: d.endMinute, group: d.groupKey, count: d.count }));
  const ex = await db
    .select()
    .from(demandExceptions)
    .where(and(eq(demandExceptions.orgId, orgId), inArray(demandExceptions.roomId, roomIds), gte(demandExceptions.date, start), lte(demandExceptions.date, end)));
  ctx.exceptions = ex.map((e) => ({
    roomId: e.roomId,
    date: e.date,
    closed: e.closed,
    startMinute: e.startMinute ?? undefined,
    endMinute: e.endMinute ?? undefined,
    group: e.groupKey ?? undefined,
    count: e.count ?? undefined,
  }));

  // Shifts: templates expanded per date (from the day before, for night shifts), minus `off`
  // exceptions, plus dated `shift` exceptions.
  const tpl = await db.select().from(shiftTemplates).where(and(eq(shiftTemplates.orgId, orgId), inArray(shiftTemplates.roomId, roomIds)));
  const from = addDays(start, -1);
  const sx = await db
    .select()
    .from(shiftExceptions)
    .where(and(eq(shiftExceptions.orgId, orgId), gte(shiftExceptions.date, from), lte(shiftExceptions.date, end)));
  const off = new Set(sx.filter((x) => x.kind === 'off').map((x) => `${x.memberId}|${x.date}`));
  for (const d of rangeISO(from, end)) {
    const dow = mondayIndexedDow(d);
    for (const t of tpl) {
      if (t.weekday !== dow || (t.effectiveFrom && t.effectiveFrom > d) || (t.effectiveTo && t.effectiveTo < d)) continue;
      if (off.has(`${t.memberId}|${d}`)) continue;
      ctx.shifts.push({ memberId: t.memberId, roomId: t.roomId, date: d, interval: localInterval(d, t.startMinute, t.endMinute, tz) });
    }
  }
  for (const x of sx) {
    if (x.kind !== 'shift' || !x.roomId || !roomIds.includes(x.roomId) || x.startMinute == null || x.endMinute == null) continue;
    ctx.shifts.push({ memberId: x.memberId, roomId: x.roomId, date: x.date, interval: localInterval(x.date, x.startMinute, x.endMinute, tz) });
  }

  const memberIds = [...new Set(ctx.shifts.map((s) => s.memberId))];
  if (memberIds.length) {
    const reqs = await db
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.orgId, orgId),
          inArray(leaveRequests.memberId, memberIds),
          inArray(leaveRequests.status, ['pending', 'approved']),
          lte(leaveRequests.startDate, end),
          gte(leaveRequests.endDate, from),
          opts.excludeRequestId ? ne(leaveRequests.id, opts.excludeRequestId) : undefined,
        ),
      );
    for (const r of reqs) {
      for (const d of rangeISO(r.startDate < from ? from : r.startDate, r.endDate > end ? end : r.endDate)) {
        ctx.absences.push({
          requestId: r.id,
          memberId: r.memberId,
          date: d,
          status: r.status as 'approved' | 'pending',
          interval: leaveInterval(d, r.part, tz, r.part === 'hours' && r.startMinute != null && r.endMinute != null ? { startMinute: r.startMinute, endMinute: r.endMinute } : null),
        });
      }
    }
    ctx.credentials = await credentialFacts(db, orgId, memberIds);
    const names = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.orgId, orgId), inArray(members.id, memberIds)));
    ctx.memberNames = new Map(names.map((n) => [n.id, n.name]));
  }
  return ctx;
}

export async function credentialFacts(db: Db, orgId: string, memberIds: readonly string[]): Promise<Map<string, MemberCredentialFact[]>> {
  const out = new Map<string, MemberCredentialFact[]>();
  if (memberIds.length === 0) return out;
  const rows = await db
    .select({ memberId: memberCredentials.memberId, key: credentials.key, issuedOn: memberCredentials.issuedOn, expiresOn: memberCredentials.expiresOn })
    .from(memberCredentials)
    .innerJoin(credentials, and(eq(credentials.id, memberCredentials.credentialId), eq(credentials.orgId, orgId)))
    .where(and(eq(memberCredentials.orgId, orgId), inArray(memberCredentials.memberId, [...memberIds])));
  for (const r of rows) {
    const list = out.get(r.memberId) ?? [];
    list.push({ key: r.key, issuedOn: r.issuedOn, expiresOn: r.expiresOn });
    out.set(r.memberId, list);
  }
  return out;
}

/** Run the engine for each date. Dates without a pack in force return null. */
export function coverageDays(ctx: SiteContext, start: string, end: string, opts: { includePending?: boolean; extraAbsences?: Absence[] } = {}): (CoverageDay | null)[] {
  return rangeISO(start, end).map((date) => {
    const pack = packsOn(ctx.packs, date);
    if (!pack) return null;
    return coverageForDay({
      pack,
      date,
      timezone: ctx.location.timezone,
      rooms: ctx.rooms.map((r) => ({ id: r.id, name: r.name })),
      demand: ctx.demand,
      exceptions: ctx.exceptions,
      shifts: ctx.shifts,
      absences: [...ctx.absences, ...(opts.extraAbsences ?? [])],
      credentials: ctx.credentials,
      includePending: opts.includePending,
    });
  });
}

/** A gap window: consecutive blocks in one room (or site-wide) with the same shortfall. */
export interface GapWindow {
  date: string;
  roomId: string | null;
  start: string;
  end: string;
  startMinute: number;
  endMinute: number;
  ruleId: string;
  kind: Shortfall['kind'];
  label: string;
  required: number;
  present: number;
  short: number;
  citation: { regulation: string; section: string; url: string; retrievedOn: string; publisher: string } | null;
  basis: 'law' | 'org_policy';
  needsVerification: boolean;
}

const minuteOfEnd = (startMinute: number, blockMinutes: number) => startMinute + blockMinutes;

/** Collapse block shortfalls into windows ("toddler room 14:00–18:00, 1 short, § 1596.955"). */
export function gapWindows(day: CoverageDay, blockMinutes = 30): GapWindow[] {
  const out: GapWindow[] = [];
  const push = (roomId: string | null, blockKey: string, startMinute: number, s: Shortfall) => {
    const prev = out.at(-1);
    const short = Math.max(0, s.required - s.present);
    if (prev && prev.roomId === roomId && prev.ruleId === s.ruleId && prev.required === s.required && prev.present === s.present && prev.endMinute === startMinute) {
      prev.endMinute = minuteOfEnd(startMinute, blockMinutes);
      prev.end = hhmm(prev.endMinute % 1440 === 0 && prev.endMinute > 0 ? 1440 : prev.endMinute);
      return;
    }
    const p = s.provenance;
    out.push({
      date: blockKey.slice(0, 10),
      roomId,
      start: hhmm(startMinute),
      end: hhmm(minuteOfEnd(startMinute, blockMinutes)),
      startMinute,
      endMinute: minuteOfEnd(startMinute, blockMinutes),
      ruleId: s.ruleId,
      kind: s.kind,
      label: s.label,
      required: s.required,
      present: s.present,
      short: s.kind === 'group_size' ? 0 : short,
      citation: p.citation ? { regulation: p.citation.regulation, section: p.citation.section, url: p.citation.url, retrievedOn: p.citation.retrievedOn, publisher: p.citation.publisher } : null,
      basis: p.basis,
      needsVerification: !!p.needsVerification,
    });
  };
  const roomIds = [...new Set(day.rooms.map((r) => r.roomId))];
  for (const roomId of roomIds) {
    for (const rb of day.rooms.filter((r) => r.roomId === roomId)) for (const s of rb.shortfalls) push(roomId, rb.block.key, rb.block.startMinute, s);
  }
  for (const sb of day.site) for (const s of sb.shortfalls) push(null, sb.block.key, sb.block.startMinute, s);
  return out;
}

/** Windows present in `after` but not in `before` (same room, rule and block): what an absence adds. */
export function newGaps(before: CoverageDay, after: CoverageDay): GapWindow[] {
  const key = (roomId: string | null, blockKey: string, s: Shortfall) => `${roomId}|${blockKey}|${s.ruleId}`;
  const had = new Map<string, number>();
  for (const r of before.rooms) for (const s of r.shortfalls) had.set(key(r.roomId, r.block.key, s), s.required - s.present);
  for (const b of before.site) for (const s of b.shortfalls) had.set(key(null, b.block.key, s), s.required - s.present);
  const worse = (k: string, s: Shortfall) => s.kind !== 'group_size' && (!had.has(k) || s.required - s.present > had.get(k)!);
  const filtered: CoverageDay = {
    ...after,
    rooms: after.rooms.map((r) => ({ ...r, shortfalls: r.shortfalls.filter((s) => worse(key(r.roomId, r.block.key, s), s)) })),
    site: after.site.map((b) => ({ ...b, shortfalls: b.shortfalls.filter((s) => worse(key(null, b.block.key, s), s)) })),
  };
  return gapWindows(filtered);
}

/**
 * Block-level impact of a proposed absence for a member at regulated sites they are
 * scheduled at: the new ratio / role gaps it would create, with citations.
 */
export async function blockImpact(
  db: Db,
  orgId: string,
  memberId: string,
  dates: readonly string[],
  part: 'full' | 'am' | 'pm' | 'hours',
  window: { startMinute: number; endMinute: number } | null,
  opts: ContextOptions = {},
): Promise<(GapWindow & { siteId: string; roomName: string | null })[]> {
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  const start = sorted[0]!;
  const end = sorted.at(-1)!;
  // Sites where the member has a shift in the window (any room).
  const tplRooms = await db
    .select({ roomId: shiftTemplates.roomId })
    .from(shiftTemplates)
    .where(and(eq(shiftTemplates.orgId, orgId), eq(shiftTemplates.memberId, memberId)));
  const exRooms = await db
    .select({ roomId: shiftExceptions.roomId })
    .from(shiftExceptions)
    .where(and(eq(shiftExceptions.orgId, orgId), eq(shiftExceptions.memberId, memberId), gte(shiftExceptions.date, start), lte(shiftExceptions.date, end)));
  const ids = [...new Set([...tplRooms, ...exRooms].map((r) => r.roomId).filter((x): x is string => !!x))];
  if (ids.length === 0) return [];
  const siteRows = await db
    .selectDistinct({ locationId: rooms.locationId })
    .from(rooms)
    .where(and(eq(rooms.orgId, orgId), or(...ids.map((id) => eq(rooms.id, id)))));
  const out: (GapWindow & { siteId: string; roomName: string | null })[] = [];
  for (const { locationId } of siteRows) {
    const ctx = await siteContext(db, orgId, locationId, start, end, opts);
    if (ctx.packs.length === 0) continue;
    const tz = ctx.location.timezone;
    const extra: Absence[] = sorted.map((d) => ({ memberId, status: 'approved', interval: leaveInterval(d, part, tz, window) }));
    const before = coverageDays(ctx, start, end, { includePending: false });
    const after = coverageDays(ctx, start, end, { includePending: false, extraAbsences: extra });
    const roomName = new Map(ctx.rooms.map((r) => [r.id, r.name]));
    before.forEach((b, i) => {
      const a = after[i];
      if (!b || !a || !dates.includes(b.date)) return;
      for (const g of newGaps(b, a)) out.push({ ...g, siteId: locationId, roomName: g.roomId ? (roomName.get(g.roomId) ?? null) : null });
    });
  }
  return out;
}

/** Credential-expiry alerts: expiring within `days` (30/14/7 thresholds) or already expired. */
export function expiryBand(expiresOn: string | null, today: string): 'expired' | '7' | '14' | '30' | null {
  if (!expiresOn) return null;
  if (expiresOn <= today) return 'expired';
  const d = (Date.parse(expiresOn) - Date.parse(today)) / 86_400_000;
  if (d <= 7) return '7';
  if (d <= 14) return '14';
  if (d <= 30) return '30';
  return null;
}
