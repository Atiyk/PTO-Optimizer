import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { zonedToUtc, type WorkedShift } from '@daysoff/engine/coverage/index';
import { foldPunches, timesheetWeek, workRulesOf, workweekStart, type Punch, type TimesheetWeek, type WorkRules } from '@daysoff/engine/timeclock/index';
import { LABOR_US_FEDERAL, seedPack } from '@daysoff/engine/rulepacks';
import type { Db } from '@/db/client';
import { hoursWorked, locations, members, timePunches, timesheetApprovals } from '@/db/schema';
import { packsOn, sitePacks } from './coverage';
import { localDate } from './cover';

/*
 * Time clock domain (time-clock prompt, Part 2): load punches and the site's work rules, let
 * the engine fold them, and keep hours_worked in step. Nothing here computes a number itself.
 */

export type RulesSource = { kind: 'linked' | 'site' | 'federal' | 'none'; packKey: string | null; packName: string | null; notes: readonly string[] };

export interface SiteRules {
  rules: WorkRules;
  source: RulesSource;
}

/**
 * Work rules for a site on a date: the site's linked packs (regulated sites) if they carry
 * overtime/break rules, else the site's chosen labour pack, else the FLSA baseline for US
 * sites, else none. The org's overtime policy is applied by the caller.
 */
export async function siteWorkRules(db: Db, orgId: string, locationId: string | null, date: string): Promise<SiteRules> {
  if (!locationId) return { rules: workRulesOf(null), source: { kind: 'none', packKey: null, packName: null, notes: [] } };
  const [loc] = await db.select().from(locations).where(and(eq(locations.orgId, orgId), eq(locations.id, locationId)));
  if (!loc) return { rules: workRulesOf(null), source: { kind: 'none', packKey: null, packName: null, notes: [] } };
  const linkedPacks = await sitePacks(db, orgId, locationId);
  const linked = packsOn(linkedPacks, date);
  const linkedRules = workRulesOf(linked);
  if (linked && (linkedRules.overtime || linkedRules.meals.length || linkedRules.rest.length)) {
    const names = linkedPacks.map((p) => p.pack.name).join(' + ');
    return { rules: linkedRules, source: { kind: 'linked', packKey: linkedPacks[0]?.key ?? null, packName: names, notes: linkedPacks.flatMap((p) => p.pack.notes ?? []) } };
  }
  const chosen = loc.laborPackKey ? seedPack(loc.laborPackKey) : undefined;
  if (chosen) return { rules: workRulesOf(chosen), source: { kind: 'site', packKey: chosen.key, packName: chosen.name, notes: chosen.notes ?? [] } };
  if (loc.countryCode === 'US') return { rules: workRulesOf(LABOR_US_FEDERAL), source: { kind: 'federal', packKey: LABOR_US_FEDERAL.key, packName: LABOR_US_FEDERAL.name, notes: LABOR_US_FEDERAL.notes ?? [] } };
  return { rules: workRulesOf(null), source: { kind: 'none', packKey: null, packName: null, notes: [] } };
}

export interface MemberClockContext {
  memberId: string;
  name: string;
  locationId: string | null;
  tz: string;
  employmentType: 'salaried' | 'hourly';
}

export async function memberClockContext(db: Db, orgId: string, memberIds?: readonly string[]): Promise<MemberClockContext[]> {
  const rows = await db
    .select({ id: members.id, name: members.name, locationId: members.locationId, tz: locations.timezone, employmentType: members.employmentType })
    .from(members)
    .leftJoin(locations, eq(locations.id, members.locationId))
    .where(and(eq(members.orgId, orgId), isNull(members.deletedAt), memberIds ? inArray(members.id, [...memberIds]) : undefined))
    .orderBy(members.name);
  return rows.map((r) => ({ memberId: r.id, name: r.name, locationId: r.locationId, tz: r.tz ?? 'UTC', employmentType: r.employmentType }));
}

/** Live punches (not voided) for members in [from, to). */
export async function punchesFor(db: Db, orgId: string, memberIds: readonly string[], from: Date, to: Date): Promise<Map<string, (Punch & { id: string })[]>> {
  const out = new Map<string, (Punch & { id: string })[]>();
  if (!memberIds.length) return out;
  const rows = await db
    .select()
    .from(timePunches)
    .where(and(eq(timePunches.orgId, orgId), inArray(timePunches.memberId, [...memberIds]), isNull(timePunches.voidedAt), gte(timePunches.at, from), lt(timePunches.at, to)))
    .orderBy(timePunches.at);
  for (const r of rows) {
    const list = out.get(r.memberId) ?? [];
    list.push({ id: r.id, at: r.at.getTime(), kind: r.kind, breakKind: r.breakKind, siteId: r.locationId, restBreaksTaken: r.restBreaksTaken });
    out.set(r.memberId, list);
  }
  return out;
}

export interface MemberWeek {
  member: MemberClockContext;
  week: TimesheetWeek;
  rules: SiteRules;
  punches: (Punch & { id: string })[];
}

/** One timesheet per member for a workweek (engine-computed). */
export async function teamWeek(db: Db, orgId: string, weekStart: string, now: Date, memberIds?: readonly string[]): Promise<MemberWeek[]> {
  const people = await memberClockContext(db, orgId, memberIds);
  if (!people.length) return [];
  // One load for everyone, padded wide enough for every time zone.
  const all = await punchesFor(db, orgId, people.map((p) => p.memberId), new Date(zonedToUtc(addDays(weekStart, -2), 0, 'UTC')), new Date(zonedToUtc(addDays(weekStart, 9), 0, 'UTC')));
  const rulesBySite = new Map<string, SiteRules>();
  const out: MemberWeek[] = [];
  for (const p of people) {
    const key = p.locationId ?? '';
    let rules = rulesBySite.get(key);
    if (!rules) {
      rules = await siteWorkRules(db, orgId, p.locationId, weekStart);
      rulesBySite.set(key, rules);
    }
    const punches = all.get(p.memberId) ?? [];
    const week = timesheetWeek(punches, { tz: p.tz, now: now.getTime(), weekStart, rules: rules.rules });
    out.push({ member: p, week, rules, punches });
  }
  return out;
}

/**
 * Hours sync: replace this member's `time_clock` row in hours_worked for the workweek with
 * the engine's total (void the old row, insert the new). Supersedes an approval whose
 * totals no longer match. Runs on every clock-out and correction.
 */
export async function syncWeekHours(db: Db, orgId: string, memberId: string, weekStart: string, now: Date): Promise<number> {
  const [mw] = await teamWeek(db, orgId, weekStart, now, [memberId]);
  const total = mw?.week.bands.total ?? 0;
  const weekEnd = addDays(weekStart, 6);
  await db
    .update(hoursWorked)
    .set({ voidedAt: now })
    .where(and(eq(hoursWorked.orgId, orgId), eq(hoursWorked.memberId, memberId), eq(hoursWorked.source, 'time_clock'), eq(hoursWorked.periodStart, weekStart), isNull(hoursWorked.voidedAt)));
  if (total > 0) await db.insert(hoursWorked).values({ orgId, memberId, periodStart: weekStart, periodEnd: weekEnd, hours: String(total), source: 'time_clock' });
  const approvals = await db
    .select()
    .from(timesheetApprovals)
    .where(and(eq(timesheetApprovals.orgId, orgId), eq(timesheetApprovals.memberId, memberId), eq(timesheetApprovals.weekStart, weekStart), isNull(timesheetApprovals.supersededAt)));
  for (const a of approvals) {
    if (Number(a.totalHours) !== total || Number(a.overtimeHours) !== (mw?.week.bands.overtime ?? 0)) {
      await db.update(timesheetApprovals).set({ supersededAt: now }).where(eq(timesheetApprovals.id, a.id));
    }
  }
  return total;
}

/** The workweek a punch time falls in at the member's site. */
export function weekOf(at: Date, tz: string): string {
  return workweekStart(localDate(at, tz));
}

/**
 * Worked shifts from the clock, for cover ranking: on days already worked (before today at
 * the site), the clocked sessions replace the schedule, so overtime projections use real
 * hours. Returns the dates it covers so callers drop scheduled shifts on those dates.
 */
export async function clockedShifts(db: Db, orgId: string, memberIds: readonly string[], start: string, end: string, now: Date): Promise<Map<string, { shifts: WorkedShift[]; dates: Set<string> }>> {
  const out = new Map<string, { shifts: WorkedShift[]; dates: Set<string> }>();
  if (!memberIds.length) return out;
  const people = await memberClockContext(db, orgId, memberIds);
  const all = await punchesFor(db, orgId, memberIds, new Date(zonedToUtc(addDays(start, -1), 0, 'UTC')), new Date(zonedToUtc(addDays(end, 2), 0, 'UTC')));
  for (const p of people) {
    const punches = all.get(p.memberId);
    if (!punches?.length) continue;
    const today = localDate(now, p.tz);
    const fold = foldPunches(punches, { tz: p.tz, now: now.getTime() });
    const shifts: WorkedShift[] = [];
    const dates = new Set<string>();
    for (const s of fold.sessions) {
      if (s.date < start || s.date > end || s.date >= today || s.missingOut) continue;
      dates.add(s.date);
      // An interval whose length is the worked time (meal breaks deducted), starting at clock-in.
      shifts.push({ date: s.date, interval: { start: s.start, end: s.end ?? s.start + s.workedMinutes * 60_000 }, siteId: s.siteId ?? undefined, paidHours: Math.round((s.workedMinutes / 60) * 100) / 100 });
    }
    if (dates.size) out.set(p.memberId, { shifts, dates });
  }
  return out;
}
