import { and, eq, inArray } from 'drizzle-orm';
import { addDays, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { leaveInterval, type Absence, type CoverageDay, type MemberCredentialFact } from '@daysoff/engine/coverage/index';
import type { Db } from '@/db/client';
import { credentials, leaveRequests, memberCredentials } from '@/db/schema';
import { coverageDays, newGaps, siteContext, type GapWindow, type SiteContext } from './coverage';

/*
 * Coverage forecast for one regulated site over the coming weeks, from the same block-level
 * engine as getCoverage. Shortfalls are attributed to a cause by running the engine on
 * stacked variants of the same inputs:
 *   schedule  — no leave, every credential treated as current: the rota itself is short;
 *   credential — real credential dates, still no leave: minus the above;
 *   approved  — plus approved leave: minus the above;
 *   pending   — plus pending leave: minus the above.
 * Each step can only remove staff, so every difference is >= 0. Hours are staff-hours short
 * (one person missing for 30 minutes = 0.5). Stagger suggestions shift a pending request by
 * whole days to the nearest dates where it adds no gap at this site; the request is still
 * re-checked in full (team minimums, balance) when someone changes it.
 */

export type GapCause = 'schedule' | 'credential' | 'approved' | 'pending';

export interface ForecastWeek {
  weekStart: string;
  weekEnd: string;
  hoursShort: Record<GapCause, number>;
  /** Dates with any shortfall once pending leave is counted. */
  gapDates: string[];
  /** Days the site follows a rule pack in this week. */
  regulatedDays: number;
}

export interface CredentialAlert {
  memberId: string;
  memberName: string;
  credential: string;
  credentialName: string;
  expiresOn: string;
  /** First date it leaves a room short while the person is scheduled; null if it never does in range. */
  firstGapDate: string | null;
  gapDays: number;
}

export interface StaggerSuggestion {
  requestId: string;
  memberId: string;
  memberName: string;
  start: string;
  end: string;
  /** New staff-hours short this request adds at the site (pending on top of approved). */
  hoursAdded: number;
  /** First gap it causes, for the "why". */
  firstGap: Pick<GapWindow, 'date' | 'start' | 'end' | 'label' | 'short'> & { roomName: string | null };
  /** Same length, moved by `shiftDays`; null when no move within two weeks avoids every gap. */
  suggestion: { start: string; end: string; shiftDays: number } | null;
}

export interface SiteForecast {
  weeks: ForecastWeek[];
  totals: Record<GapCause, number>;
  credentialAlerts: CredentialAlert[];
  staggers: StaggerSuggestion[];
  stats: { days: number; engineRuns: number; ms: number };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Staff-hours short on a day: each block's gap times its length (rooms plus site-wide rules). */
export function hoursShort(day: CoverageDay | null): number {
  if (!day) return 0;
  let h = 0;
  for (const r of day.rooms) if (r.gap > 0) h += (r.gap * (r.block.utcEnd - r.block.utcStart)) / 3_600_000;
  for (const s of day.site) if (s.gap > 0) h += (s.gap * (s.block.utcEnd - s.block.utcStart)) / 3_600_000;
  return h;
}

const renewed = (m: ReadonlyMap<string, readonly MemberCredentialFact[]>, only?: { memberId: string; key: string }) =>
  new Map(
    [...m].map(([id, list]) => [id, list.map((c) => (!only || (only.memberId === id && only.key === c.key) ? { ...c, expiresOn: null } : c))]),
  );

export const STAGGER_LIMIT = 10;
export const STAGGER_MAX_SHIFT = 14;
export const ALERT_LIMIT = 20;

export async function siteForecast(db: Db, orgId: string, locationId: string, start: string, weeks: number, clock: () => number = () => performance.now()): Promise<SiteForecast> {
  const t0 = clock();
  const end = addDays(start, weeks * 7 - 1);
  // Two extra weeks so a pending request near the end can move later.
  const ctx = await siteContext(db, orgId, locationId, start, addDays(end, STAGGER_MAX_SHIFT));
  let engineRuns = 0;
  const run = (c: SiteContext, from: string, to: string, includePending: boolean, extra?: Absence[]) => {
    engineRuns += rangeISO(from, to).length;
    return coverageDays(c, from, to, { includePending, extraAbsences: extra });
  };

  const noLeave: SiteContext = { ...ctx, absences: [] };
  const v0 = run({ ...noLeave, credentials: renewed(ctx.credentials) }, start, end, false);
  const v1 = run(noLeave, start, end, false);
  const v2 = run(ctx, start, end, false);
  const v3 = run(ctx, start, end, true);

  const totals: Record<GapCause, number> = { schedule: 0, credential: 0, approved: 0, pending: 0 };
  const out: ForecastWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const week: ForecastWeek = { weekStart: addDays(start, w * 7), weekEnd: addDays(start, w * 7 + 6), hoursShort: { schedule: 0, credential: 0, approved: 0, pending: 0 }, gapDates: [], regulatedDays: 0 };
    for (let i = w * 7; i < w * 7 + 7; i++) {
      if (!v3[i]) continue;
      week.regulatedDays++;
      const [h0, h1, h2, h3] = [v0, v1, v2, v3].map((v) => hoursShort(v[i] ?? null));
      week.hoursShort.schedule += h0;
      week.hoursShort.credential += Math.max(0, h1 - h0);
      week.hoursShort.approved += Math.max(0, h2 - h1);
      week.hoursShort.pending += Math.max(0, h3 - h2);
      if (h3 > 0) week.gapDates.push(v3[i]!.date);
    }
    for (const k of Object.keys(totals) as GapCause[]) {
      week.hoursShort[k] = round(week.hoursShort[k]);
      totals[k] = round(totals[k] + week.hoursShort[k]);
    }
    out.push(week);
  }

  const roomName = new Map(ctx.rooms.map((r) => [r.id, r.name]));
  const name = (id: string) => ctx.memberNames.get(id) ?? '';

  // Credential alerts: anything expiring before the end of the range (or already expired)
  // held by someone on this site's rota.
  const credNames = await credentialNames(db, orgId, [...ctx.credentials.keys()]);
  const expiring: { memberId: string; key: string; expiresOn: string }[] = [];
  for (const [memberId, list] of ctx.credentials) for (const c of list) if (c.expiresOn && c.expiresOn <= end) expiring.push({ memberId, key: c.key, expiresOn: c.expiresOn });
  expiring.sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : a.expiresOn > b.expiresOn ? 1 : a.memberId < b.memberId ? -1 : 1));
  const credentialAlerts: CredentialAlert[] = [];
  for (const e of expiring.slice(0, ALERT_LIMIT)) {
    const from = e.expiresOn > start ? e.expiresOn : start;
    const onRota = [...new Set(ctx.shifts.filter((s) => s.memberId === e.memberId && s.date >= from && s.date <= end).map((s) => s.date))].sort();
    let firstGapDate: string | null = null;
    let gapDays = 0;
    if (onRota.length) {
      // Only this credential renewed vs real: the difference is what this one expiry costs.
      const fixed = { ...noLeave, credentials: renewed(ctx.credentials, e) };
      for (const d of onRota) {
        const i = rangeISO(start, d).length - 1;
        const [withIt] = run(fixed, d, d, false);
        if (hoursShort(v1[i] ?? null) > hoursShort(withIt ?? null) + 1e-9) {
          gapDays++;
          firstGapDate ??= d;
        }
      }
    }
    credentialAlerts.push({ memberId: e.memberId, memberName: name(e.memberId), credential: e.key, credentialName: credNames.get(e.key) ?? e.key, expiresOn: e.expiresOn, firstGapDate, gapDays });
  }

  // Stagger suggestions for pending requests that add gaps in range.
  const pendingIds = [...new Set(ctx.absences.filter((a) => a.status === 'pending' && a.date >= start && a.date <= end).map((a) => a.requestId))];
  const reqs = pendingIds.length
    ? await db.select().from(leaveRequests).where(and(eq(leaveRequests.orgId, orgId), inArray(leaveRequests.id, pendingIds)))
    : [];
  reqs.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id < b.id ? -1 : 1));
  const approvedOnly: SiteContext = { ...ctx, absences: ctx.absences.filter((a) => a.status === 'approved') };
  const tz = ctx.location.timezone;
  const window = (r: (typeof reqs)[number]) => (r.part === 'hours' && r.startMinute != null && r.endMinute != null ? { startMinute: r.startMinute, endMinute: r.endMinute } : null);
  const absencesFor = (r: (typeof reqs)[number], dates: string[]): Absence[] => dates.map((d) => ({ memberId: r.memberId, status: 'approved', interval: leaveInterval(d, r.part, tz, window(r)) }));
  const workDays = (memberId: string, dates: string[]) => dates.filter((d) => ctx.shifts.some((s) => s.memberId === memberId && s.date === d)).length;
  const ownOther = (r: (typeof reqs)[number]) => new Set(ctx.absences.filter((a) => a.memberId === r.memberId && a.requestId !== r.id).map((a) => a.date));
  const lastDate = addDays(end, STAGGER_MAX_SHIFT);
  const added = (r: (typeof reqs)[number], dates: string[]) => {
    const from = dates[0]!;
    const to = dates.at(-1)!;
    const before = run(approvedOnly, from, to, false);
    const after = run(approvedOnly, from, to, false, absencesFor(r, dates));
    const gaps: GapWindow[] = [];
    let hours = 0;
    before.forEach((b, i) => {
      const a = after[i];
      if (!b || !a) return;
      hours += Math.max(0, hoursShort(a) - hoursShort(b));
      gaps.push(...newGaps(b, a));
    });
    return { hours, gaps };
  };

  const staggers: StaggerSuggestion[] = [];
  for (const r of reqs) {
    if (staggers.length >= STAGGER_LIMIT) break;
    const dates = rangeISO(r.startDate, r.endDate);
    const now = added(r, dates);
    if (now.gaps.length === 0) continue;
    const need = workDays(r.memberId, dates);
    const taken = ownOther(r);
    let suggestion: StaggerSuggestion['suggestion'] = null;
    for (let k = 1; k <= STAGGER_MAX_SHIFT && !suggestion; k++) {
      for (const shift of [k, -k]) {
        const moved = dates.map((d) => addDays(d, shift));
        if (moved[0]! < start || moved.at(-1)! > lastDate) continue;
        if (moved.some((d) => taken.has(d)) || workDays(r.memberId, moved) !== need) continue;
        if (added(r, moved).gaps.length === 0) {
          suggestion = { start: moved[0]!, end: moved.at(-1)!, shiftDays: shift };
          break;
        }
      }
    }
    const g = now.gaps[0]!;
    staggers.push({
      requestId: r.id,
      memberId: r.memberId,
      memberName: name(r.memberId),
      start: r.startDate,
      end: r.endDate,
      hoursAdded: round(now.hours),
      firstGap: { date: g.date, start: g.start, end: g.end, label: g.label, short: g.short, roomName: g.roomId ? (roomName.get(g.roomId) ?? null) : null },
      suggestion,
    });
  }

  return { weeks: out, totals, credentialAlerts, staggers, stats: { days: weeks * 7, engineRuns, ms: Math.round(clock() - t0) } };
}

async function credentialNames(db: Db, orgId: string, memberIds: string[]): Promise<Map<string, string>> {
  if (memberIds.length === 0) return new Map();
  const rows = await db
    .selectDistinct({ key: credentials.key, name: credentials.name })
    .from(credentials)
    .innerJoin(memberCredentials, and(eq(memberCredentials.credentialId, credentials.id), eq(memberCredentials.orgId, orgId)))
    .where(and(eq(credentials.orgId, orgId), inArray(memberCredentials.memberId, memberIds)));
  return new Map(rows.map((r) => [r.key, r.name]));
}

/**
 * Block-level check for planned leave (the planner's second pass). For each regulated site the
 * planned members work at, adds planned days date by date in a fixed order (by member id) on
 * top of booked leave, approved and pending, and rejects any day that adds a gap. Returns the
 * rejected (member, date) pairs with the first gap each would cause.
 */
export async function plannedDayConflicts(
  db: Db,
  orgId: string,
  plan: ReadonlyMap<string, readonly string[]>,
  siteIds: readonly string[],
): Promise<{ memberId: string; date: string; gap: GapWindow; site: string }[]> {
  const all = [...plan.values()].flat().sort();
  if (all.length === 0) return [];
  const start = all[0]!;
  const end = all.at(-1)!;
  const out: { memberId: string; date: string; gap: GapWindow; site: string }[] = [];
  for (const siteId of siteIds) {
    const ctx = await siteContext(db, orgId, siteId, start, end);
    if (ctx.packs.length === 0) continue;
    const tz = ctx.location.timezone;
    const byDate = new Map<string, string[]>();
    for (const [memberId, days] of [...plan].sort(([a], [b]) => (a < b ? -1 : 1))) {
      for (const d of days) if (ctx.shifts.some((s) => s.memberId === memberId && s.date === d)) byDate.set(d, [...(byDate.get(d) ?? []), memberId]);
    }
    for (const [date, ids] of [...byDate].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const [base] = coverageDays(ctx, date, date, { includePending: true });
      if (!base) continue;
      const full = (memberId: string): Absence => ({ memberId, status: 'approved', interval: leaveInterval(date, 'full', tz, null) });
      // Usually everyone fits: one run for the whole day, member by member only if not.
      const [together] = coverageDays(ctx, date, date, { includePending: true, extraAbsences: ids.map(full) });
      if (together && newGaps(base, together).length === 0) continue;
      const kept: Absence[] = [];
      let current = base;
      for (const memberId of ids) {
        const extra = [...kept, full(memberId)];
        const [next] = coverageDays(ctx, date, date, { includePending: true, extraAbsences: extra });
        const gaps = next ? newGaps(current, next) : [];
        if (gaps.length) out.push({ memberId, date, gap: gaps[0]!, site: ctx.location.name });
        else if (next) {
          kept.push(extra.at(-1)!);
          current = next;
        }
      }
    }
  }
  return out;
}
