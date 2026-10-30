import { addDays, mondayIndexedDow, rangeISO } from '../solver/dateUtils';
import type { ISODate, WorkWeek } from '../solver/types';
import { fromUnits, toUnits } from '../ledger/fixedPoint';
import {
  addMonths,
  daysBetweenInclusive,
  nextPlanYear,
  planYearContaining,
  carryoverDeadline,
  type DateRange,
} from './calendar';
import { PERIODS_PER_YEAR, type LeavePolicy, type LeaveUnit, type PayPeriod, type PolicyVersion } from './policy';

/*
 * Balance projection. Balances are DERIVED: posted ledger rows plus the policy's scheduled
 * events (accruals, year-end carryover/forfeiture, use-by expiry), replayed in date order.
 * All arithmetic is in integer 1/10000 units (ledger/fixedPoint.ts).
 *
 * Scheduled events have deterministic keys ("accrual:2026-01-14"). Once a posting job has
 * written one to the ledger with that event_key, the posted row is used instead of
 * regenerating it, so history never changes when a policy does.
 */

export type LedgerKind = 'accrual' | 'usage' | 'adjustment' | 'carryover' | 'forfeiture' | 'import';

export interface LedgerEntryInput {
  id?: string;
  kind: LedgerKind;
  amount: number | string;
  effectiveDate: ISODate;
  eventKey?: string | null;
  reason?: string | null;
}

export interface MemberFacts {
  /** Employment start; required for anniversary plan years and waiting periods. */
  startDate: ISODate | null;
  workWeek: WorkWeek;
  hoursPerDay: number;
  /** Holidays for the member's location(s): excluded from hours worked for per-hour accrual. */
  holidays?: ReadonlyMap<ISODate, string>;
  /** Hours actually worked (imported), for `per_hour_worked` with `hoursSource: 'imported'`. */
  hoursWorked?: readonly HoursWorkedRow[];
}

export interface HoursWorkedRow {
  periodStart: ISODate;
  periodEnd: ISODate;
  hours: number;
}

export interface ProjectionInput {
  policies: readonly PolicyVersion[];
  member: MemberFacts;
  /** Posted ledger rows, plus future booked leave as `usage` rows with future dates. */
  ledger: readonly LedgerEntryInput[];
  /** Report balances as of this date. */
  asOf: ISODate;
  /** Simulate up to here (default: end of the plan year containing asOf). */
  horizon?: ISODate;
}

export type TimelineSource = 'posted' | 'scheduled';

export interface TimelineEntry {
  key: string;
  date: ISODate;
  kind: LedgerKind;
  amount: number;
  source: TimelineSource;
  /** Plain facts for explanations; never free text from users. */
  note: string;
  balanceAfter: number;
  carriedAfter: number;
}

export interface BalanceSnapshot {
  date: ISODate;
  balance: number;
  /** Portion of the balance that was carried over and is still subject to a use-by date. */
  carried: number;
  carriedExpiresOn: ISODate | null;
  /** Balance that can be booked now (0 while a `locked` waiting period runs). */
  usable: number;
  lockedUntil: ISODate | null;
}

export interface YearEndOutlook {
  yearEnd: ISODate;
  balance: number;
  wouldCarry: number;
  wouldForfeit: number;
}

export interface Projection {
  unit: LeaveUnit;
  unlimited: boolean;
  asOf: BalanceSnapshot;
  atHorizon: BalanceSnapshot;
  yearEnd: YearEndOutlook | null;
  /** Usage this plan year (positive number), for unlimited policies and reports. */
  usedThisPlanYear: number;
  timeline: TimelineEntry[];
  /** Scheduled events dated ≤ asOf that have no posted row yet: the posting job writes these. */
  duePostings: TimelineEntry[];
  negativeAllowance: number;
}

// Same-day ordering: year boundary first, then expiries, grants/accruals, then manual rows.
const ORDER: Record<string, number> = {
  forfeiture_reset: 0,
  carryover: 1,
  forfeiture_expiry: 2,
  accrual: 3,
  import: 4,
  adjustment: 5,
  usage: 6,
  forfeiture: 7,
};

interface PendingEvent {
  key: string;
  date: ISODate;
  kind: LedgerKind;
  order: number;
  source: TimelineSource;
  /** Posted rows carry a fixed amount; scheduled ones compute it from the running state. */
  fixedUnits?: number;
  compute?: (s: SimState) => { units: number; note: string; carried?: number };
  note?: string;
}

interface SimState {
  balance: number;
  carried: number;
  carriedExpiresOn: ISODate | null;
}

export function policyAt(policies: readonly PolicyVersion[], date: ISODate): PolicyVersion | null {
  let found: PolicyVersion | null = null;
  for (const p of policies) if (p.effectiveFrom <= date && (!found || p.effectiveFrom >= found.effectiveFrom)) found = p;
  return found;
}

/** Pay-period end dates (and starts) inside a plan year. */
export function payPeriodsInYear(year: DateRange, period: PayPeriod): DateRange[] {
  const out: DateRange[] = [];
  const n = PERIODS_PER_YEAR[period];
  for (let k = 0; k < n; k++) {
    let start: ISODate;
    let end: ISODate;
    if (period === 'weekly' || period === 'biweekly') {
      const len = period === 'weekly' ? 7 : 14;
      start = addDays(year.start, k * len);
      end = addDays(start, len - 1);
    } else if (period === 'monthly') {
      start = addMonths(year.start, k);
      end = addDays(addMonths(year.start, k + 1), -1);
    } else {
      const month = Math.floor(k / 2);
      const mStart = addMonths(year.start, month);
      const mid = addDays(mStart, 14);
      if (k % 2 === 0) {
        start = mStart;
        end = mid;
      } else {
        start = addDays(mid, 1);
        end = addDays(addMonths(year.start, month + 1), -1);
      }
    }
    out.push({ start, end });
  }
  return out;
}

function workingHoursIn(range: DateRange, m: MemberFacts): number {
  let days = 0;
  for (const d of rangeISO(range.start, range.end)) {
    if (m.workWeek[mondayIndexedDow(d)] && !m.holidays?.has(d)) days++;
  }
  return days * m.hoursPerDay;
}

function capped(units: number, s: SimState, policy: LeavePolicy): { units: number; capNote: string } {
  if (policy.accrualCap == null) return { units, capNote: '' };
  const room = Math.max(0, toUnits(policy.accrualCap) - s.balance);
  if (units <= room) return { units, capNote: '' };
  return { units: room, capNote: room === 0 ? ' (at cap: accrual paused)' : ' (reduced to reach cap)' };
}

export function projectBalance(input: ProjectionInput): Projection {
  const { member, asOf } = input;
  const policies = [...input.policies].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const current = policyAt(policies, asOf) ?? policies[0];
  if (!current) throw new Error('projectBalance needs at least one policy version');
  const pol = current.policy;
  const unit = pol.unit;
  const thisYear = planYearContaining(pol.planYear, member.startDate, asOf);
  const horizon = input.horizon ?? thisYear.end;

  // Everything starts at the later of employment start and the first policy.
  const firstPolicyDate = policies[0]!.effectiveFrom;
  const earliestLedger = input.ledger.reduce<ISODate | null>((min, e) => (!min || e.effectiveDate < min ? e.effectiveDate : min), null);
  const simStart = [member.startDate, firstPolicyDate].filter((d): d is ISODate => !!d).sort().at(-1)!;

  const posted = new Map<string, LedgerEntryInput>();
  const events: PendingEvent[] = [];
  for (const [i, e] of input.ledger.entries()) {
    if (e.eventKey) posted.set(e.eventKey, e);
    events.push({
      key: e.eventKey ?? e.id ?? `posted:${i}`,
      date: e.effectiveDate,
      kind: e.kind,
      order: e.eventKey?.startsWith('forfeiture:reset:')
        ? ORDER.forfeiture_reset!
        : e.eventKey?.startsWith('forfeiture:useby:')
          ? ORDER.forfeiture_expiry!
          : (ORDER[e.kind] ?? 9),
      source: 'posted',
      fixedUnits: toUnits(e.amount),
      note: e.reason ?? '',
    });
  }

  const schedule = (ev: PendingEvent) => {
    if (posted.has(ev.key)) return; // posted row already in `events`
    events.push(ev);
  };

  /** Plan-year start → use-by date of the leave carried into that year. */
  const useByByReset = new Map<ISODate, ISODate>();
  const waiting = (p: LeavePolicy) => (p.waitingPeriod && member.startDate ? addDays(member.startDate, p.waitingPeriod.days) : null);

  // Walk plan years from the one containing simStart (or the first ledger row) to the horizon.
  const walkFrom = earliestLedger && earliestLedger < simStart ? earliestLedger : simStart;
  let year = planYearContaining(pol.planYear, member.startDate, walkFrom);
  let first = true;
  while (year.start <= horizon) {
    const yearPolicyV = policyAt(policies, year.start) ?? policyAt(policies, simStart);
    const yp = yearPolicyV?.policy;
    // Year-boundary carryover/forfeiture for the year that just ended (not before simStart).
    if (!first && yp && year.start > simStart) emitReset(year, yp);
    if (yp) emitAccruals(year);
    first = false;
    year = nextPlanYear(pol.planYear, member.startDate, year);
  }

  function emitReset(newYear: DateRange, p: LeavePolicy) {
    const date = newYear.start;
    const co = p.carryover;
    schedule({
      key: `forfeiture:reset:${date}`,
      date,
      kind: 'forfeiture',
      order: ORDER.forfeiture_reset!,
      source: 'scheduled',
      compute: (s) => {
        if (p.accrual.method === 'unlimited') return { units: 0, note: 'unlimited: nothing to carry' };
        const bal = s.balance;
        if (bal <= 0) return { units: 0, note: 'nothing to forfeit at year end', carried: 0 };
        const keep = co.type === 'none' ? 0 : co.type === 'all' ? bal : Math.min(bal, toUnits(co.max));
        return {
          units: -(bal - keep),
          note: `plan year ended with ${fromUnits(bal)}; ${fromUnits(keep)} carried over, ${fromUnits(bal - keep)} forfeited`,
          carried: keep,
        };
      },
    });
    if (co.type !== 'none' && co.useBy) {
      const useBy = carryoverDeadline(date, co.useBy);
      const expiry = addDays(useBy, 1);
      schedule({
        key: `forfeiture:useby:${expiry}`,
        date: expiry,
        kind: 'forfeiture',
        order: ORDER.forfeiture_expiry!,
        source: 'scheduled',
        compute: (s) => {
          const lose = Math.max(0, Math.min(s.carried, s.balance));
          return { units: -lose, note: `carried-over leave not used by ${useBy} expired`, carried: 0 };
        },
      });
      // Remember the use-by on the state when the reset runs (see carried handling below).
      useByByReset.set(date, useBy);
    }
  }

  function emitAccruals(year: DateRange) {
    const vAtStart = policyAt(policies, year.start);
    // Front-loaded: one grant at the year start, or pro-rated at simStart in the first year.
    const grantDate = year.start < simStart ? simStart : year.start;
    if (grantDate <= year.end) {
      const v = policyAt(policies, grantDate) ?? vAtStart;
      const a = v?.policy.accrual;
      if (a && a.method === 'front_loaded' && !blockedByWaiting(v!.policy, grantDate)) {
        const full = toUnits(a.annualAllowance);
        const prorate = grantDate > year.start && a.proRateFirstYear !== false;
        const units = prorate
          ? Math.round((full * daysBetweenInclusive(grantDate, year.end)) / daysBetweenInclusive(year.start, year.end))
          : full;
        const note = prorate
          ? `${a.annualAllowance} a year, pro-rated for ${daysBetweenInclusive(grantDate, year.end)} of ${daysBetweenInclusive(year.start, year.end)} days`
          : `annual allowance of ${a.annualAllowance}`;
        const pol = v!.policy;
        schedule({
          key: `accrual:${grantDate}`,
          date: grantDate,
          kind: 'accrual',
          order: ORDER.accrual!,
          source: 'scheduled',
          compute: (s) => {
            const c = capped(units, s, pol);
            return { units: c.units, note: note + c.capNote };
          },
        });
      }
    }
    // Per-period methods: period list from the policy in force at the year start.
    const a0 = vAtStart?.policy.accrual ?? policyAt(policies, simStart)?.policy.accrual;
    if (!a0 || (a0.method !== 'per_pay_period' && a0.method !== 'per_hour_worked')) return;
    if (a0.method === 'per_hour_worked' && a0.hoursSource === 'imported') {
      emitImportedHours(year);
      return;
    }
    const periods = payPeriodsInYear(year, a0.payPeriod);
    const n = periods.length;
    periods.forEach((period, idx) => {
      const k = idx + 1;
      if (period.end < simStart) return;
      const v = policyAt(policies, period.end);
      if (!v) return;
      const p = v.policy;
      const acc = p.accrual;
      if (blockedByWaiting(p, period.end)) return;
      let units: number;
      let note: string;
      if (acc.method === 'per_pay_period') {
        // Cumulative rounding: period k credits round(A·k/n) − round(A·(k−1)/n), so the
        // year's periods sum to exactly A even when A/n has no finite decimal form.
        const A = toUnits(acc.annualAllowance);
        units = Math.round((A * k) / n) - Math.round((A * (k - 1)) / n);
        note = `${acc.annualAllowance} a year over ${n} pay periods (period ${k} of ${n})`;
        if (period.start < simStart) {
          const part = daysBetweenInclusive(simStart, period.end) / daysBetweenInclusive(period.start, period.end);
          units = Math.round(units * part);
          note += `, pro-rated for a start on ${simStart}`;
        }
      } else if (acc.method === 'per_hour_worked') {
        const worked = workingHoursIn({ start: period.start < simStart ? simStart : period.start, end: period.end }, member);
        units = Math.round(toUnits(worked) * acc.ratePerHour);
        note = `${acc.ratePerHour} per hour × ${worked} scheduled hours`;
      } else {
        return;
      }
      schedule({
        key: `accrual:${period.end}`,
        date: period.end,
        kind: 'accrual',
        order: ORDER.accrual!,
        source: 'scheduled',
        compute: (s) => {
          const c = capped(units, s, p);
          return { units: c.units, note: note + c.capNote };
        },
      });
    });
  }

  /**
   * Hours actually worked: one accrual per imported period, on its end date. Cumulative
   * rounding inside the plan year (round(H_k/N) − round(H_{k−1}/N)) keeps the year exact,
   * and the annual accrual cap applies to what is earned.
   */
  function emitImportedHours(year: DateRange) {
    const rows = [...(member.hoursWorked ?? [])]
      .filter((r) => r.periodEnd >= year.start && r.periodEnd <= year.end && r.periodEnd >= simStart)
      .sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : a.periodStart < b.periodStart ? -1 : 1));
    let cumHours = 0;
    let cumUnits = 0;
    for (const row of rows) {
      const v = policyAt(policies, row.periodEnd);
      if (!v) continue;
      const p = v.policy;
      const acc = p.accrual;
      if (acc.method !== 'per_hour_worked') continue;
      if (blockedByWaiting(p, row.periodEnd)) continue;
      cumHours += row.hours;
      const earnedTotal = acc.hoursPerUnit ? Math.round(toUnits(cumHours) / acc.hoursPerUnit) : Math.round(toUnits(cumHours) * acc.ratePerHour);
      const capUnits = acc.annualAccrualCap != null ? toUnits(acc.annualAccrualCap) : Infinity;
      const nextCum = Math.min(earnedTotal, capUnits);
      const units = nextCum - cumUnits;
      cumUnits = nextCum;
      const rate = acc.hoursPerUnit ? `1 per ${acc.hoursPerUnit} hours worked` : `${acc.ratePerHour} per hour worked`;
      const capNote = nextCum === capUnits && earnedTotal > capUnits ? ` (annual accrual cap of ${acc.annualAccrualCap} reached: accrual paused)` : '';
      schedule({
        key: `accrual:hours:${row.periodStart}:${row.periodEnd}`,
        date: row.periodEnd,
        kind: 'accrual',
        order: ORDER.accrual!,
        source: 'scheduled',
        compute: (s) => {
          const c = capped(units, s, p);
          return { units: c.units, note: `${rate} × ${row.hours} hours (${row.periodStart} to ${row.periodEnd})${capNote}${c.capNote}` };
        },
      });
    }
  }

  function blockedByWaiting(p: LeavePolicy, date: ISODate): boolean {
    const until = waiting(p);
    return !!(until && p.waitingPeriod!.mode === 'no_accrual' && date < until);
  }

  events.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.order - b.order || (a.key < b.key ? -1 : 1)));

  // Replay.
  const s: SimState = { balance: 0, carried: 0, carriedExpiresOn: null };
  const timeline: TimelineEntry[] = [];
  const duePostings: TimelineEntry[] = [];
  let snapAsOf: BalanceSnapshot | null = null;
  const snapshot = (date: ISODate): BalanceSnapshot => {
    const v = policyAt(policies, date) ?? current;
    const lockUntil = v.policy.waitingPeriod?.mode === 'locked' ? waiting(v.policy) : null;
    const locked = !!(lockUntil && date < lockUntil);
    return {
      date,
      balance: fromUnits(s.balance),
      carried: fromUnits(s.carried),
      carriedExpiresOn: s.carried > 0 ? s.carriedExpiresOn : null,
      usable: locked ? 0 : fromUnits(s.balance),
      lockedUntil: locked ? lockUntil : null,
    };
  };

  for (const ev of events) {
    if (ev.date > horizon) break;
    if (!snapAsOf && ev.date > asOf) snapAsOf = snapshot(asOf);
    let units: number;
    let note = ev.note ?? '';
    if (ev.fixedUnits !== undefined) {
      units = ev.fixedUnits;
      // Usage spends carried-over leave first.
      if (ev.kind === 'usage' && units < 0) s.carried = Math.max(0, s.carried + units);
      // Posted year-boundary rows (written by the posting job) re-establish the carried bucket:
      // after the reset forfeiture, whatever positive balance remains is the carried amount.
      if (ev.key.startsWith('forfeiture:reset:')) {
        s.carried = Math.max(0, s.balance + units);
        s.carriedExpiresOn = useByByReset.get(ev.date) ?? null;
      } else if (ev.key.startsWith('forfeiture:useby:')) {
        s.carried = 0;
      }
    } else {
      const r = ev.compute!(s);
      units = r.units;
      note = r.note;
      if (r.carried !== undefined) {
        s.carried = r.carried;
        s.carriedExpiresOn = r.carried > 0 ? (useByByReset.get(ev.date) ?? null) : null;
      }
    }
    s.balance += units;
    if (s.carried > Math.max(0, s.balance)) s.carried = Math.max(0, s.balance);
    // Zero-amount scheduled events are noise, except a paused accrual, which explains why
    // the balance stopped growing.
    if (units === 0 && ev.source === 'scheduled' && !note.includes('accrual paused')) continue;
    const entry: TimelineEntry = {
      key: ev.key,
      date: ev.date,
      kind: ev.kind,
      amount: fromUnits(units),
      source: ev.source,
      note,
      balanceAfter: fromUnits(s.balance),
      carriedAfter: fromUnits(s.carried),
    };
    timeline.push(entry);
    if (ev.source === 'scheduled' && ev.date <= asOf) duePostings.push(entry);
  }
  snapAsOf ??= snapshot(asOf);
  const atHorizon = snapshot(horizon);

  const unlimited = pol.accrual.method === 'unlimited';
  let usedUnits = 0;
  for (const e of input.ledger) {
    if (e.kind === 'usage' && e.effectiveDate >= thisYear.start && e.effectiveDate <= thisYear.end) usedUnits -= toUnits(e.amount);
  }

  let yearEnd: YearEndOutlook | null = null;
  if (!unlimited && horizon >= thisYear.end) {
    const balAtEnd = toUnits(balanceOn(timeline, thisYear.end));
    const co = (policyAt(policies, addDays(thisYear.end, 1)) ?? current).policy.carryover;
    const keep = balAtEnd <= 0 ? balAtEnd : co.type === 'none' ? 0 : co.type === 'all' ? balAtEnd : Math.min(balAtEnd, toUnits(co.max));
    yearEnd = {
      yearEnd: thisYear.end,
      balance: fromUnits(balAtEnd),
      wouldCarry: fromUnits(keep),
      wouldForfeit: fromUnits(Math.max(0, balAtEnd - keep)),
    };
  }

  return {
    unit,
    unlimited,
    asOf: unlimited ? { ...snapAsOf, balance: 0, usable: Infinity } : snapAsOf,
    atHorizon,
    yearEnd,
    usedThisPlanYear: fromUnits(usedUnits),
    timeline,
    duePostings,
    negativeAllowance: pol.negativeAllowance ?? 0,
  };
}

/** Balance after the last timeline entry dated ≤ date. */
export function balanceOn(timeline: readonly TimelineEntry[], date: ISODate): number {
  let bal = 0;
  for (const t of timeline) {
    if (t.date > date) break;
    bal = t.balanceAfter;
  }
  return bal;
}
