import { isoToSerial } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';

/**
 * Absence report (pure). Every number a manager or the AI summary sees comes from here.
 * Health-related leave types are merged into one bucket, never broken out per type, and the
 * report holds no per-person sick totals (health-data minimisation).
 */

export const HEALTH_BUCKET = 'Sick or health';

export interface ReportAbsence {
  memberId: string;
  teamId: string | null;
  groupIds: string[];
  leaveTypeName: string;
  isHealthRelated: boolean;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  /** Working days charged (part days count as fractions in `days`). */
  chargedDates: ISODate[];
  days: number;
  /** Date the request was made and, when decided, the decision date. */
  requestedOn: ISODate;
  decidedOn: ISODate | null;
  start: ISODate;
}

export interface ReportInput {
  from: ISODate;
  to: ISODate;
  headcount: number;
  teams: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  absences: ReportAbsence[];
  /** Hours worked in the window per member (time clock), when the org uses it. */
  hoursWorked?: { memberId: string; hours: number }[];
  /** People who would lose leave at year-end (from the projection). Names are untrusted text. */
  forfeitRisk?: { memberId: string; name: string; amount: number; unit: 'days' | 'hours' }[];
}

export interface Bucket {
  key: string;
  label: string;
  days: number;
  requests: number;
}

export interface AbsenceReport {
  from: ISODate;
  to: ISODate;
  headcount: number;
  totals: { approvedDays: number; pendingDays: number; requests: number; peopleWithLeave: number; daysPerPerson: number };
  byType: Bucket[];
  byTeam: Bucket[];
  byGroup: Bucket[];
  byMonth: Bucket[];
  peakDays: { date: ISODate; away: number }[];
  approval: { decided: number; approved: number; declined: number; approvalRatePct: number | null; medianDaysToDecide: number | null };
  medianLeadDays: number | null;
  hoursWorked: { total: number; people: number } | null;
  forfeitRisk: { memberId: string; name: string; amount: number; unit: 'days' | 'hours' }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : r1((s[m - 1]! + s[m]!) / 2);
}

function add(map: Map<string, Bucket>, key: string, label: string, days: number) {
  const b = map.get(key) ?? { key, label, days: 0, requests: 0 };
  b.days += days;
  b.requests += 1;
  map.set(key, b);
}

const finish = (m: Map<string, Bucket>, sort: 'days' | 'key' = 'days') =>
  [...m.values()].map((b) => ({ ...b, days: r1(b.days) })).sort((a, b) => (sort === 'days' ? b.days - a.days || a.label.localeCompare(b.label) : a.key.localeCompare(b.key)));

export function absenceReport(input: ReportInput): AbsenceReport {
  const inWindow = (d: ISODate) => d >= input.from && d <= input.to;
  const teamName = new Map(input.teams.map((t) => [t.id, t.name]));
  const groupName = new Map(input.groups.map((g) => [g.id, g.name]));
  const byType = new Map<string, Bucket>();
  const byTeam = new Map<string, Bucket>();
  const byGroup = new Map<string, Bucket>();
  const byMonth = new Map<string, Bucket>();
  const perDay = new Map<ISODate, Set<string>>();
  const people = new Set<string>();
  let approvedDays = 0;
  let pendingDays = 0;
  let requests = 0;
  const leads: number[] = [];

  for (const a of input.absences) {
    if (a.status !== 'approved' && a.status !== 'pending') continue;
    const dates = a.chargedDates.filter(inWindow);
    if (!dates.length) continue;
    // Pro-rate the request's days to the part inside the window.
    const days = a.chargedDates.length ? (a.days * dates.length) / a.chargedDates.length : 0;
    requests += 1;
    if (a.status === 'pending') {
      pendingDays += days;
      continue;
    }
    approvedDays += days;
    people.add(a.memberId);
    const type = a.isHealthRelated ? HEALTH_BUCKET : a.leaveTypeName;
    add(byType, type, type, days);
    add(byTeam, a.teamId ?? 'none', a.teamId ? (teamName.get(a.teamId) ?? 'Unknown team') : 'No team', days);
    for (const g of a.groupIds) if (groupName.has(g)) add(byGroup, g, groupName.get(g)!, days);
    const perDate = days / dates.length;
    const months = new Map<string, number>();
    for (const d of dates) months.set(d.slice(0, 7), (months.get(d.slice(0, 7)) ?? 0) + perDate);
    for (const [m, v] of months) add(byMonth, m, m, v);
    for (const d of dates) (perDay.get(d) ?? perDay.set(d, new Set()).get(d)!).add(a.memberId);
    leads.push(Math.max(0, isoToSerial(a.start) - isoToSerial(a.requestedOn)));
  }

  const decided = input.absences.filter((a) => (a.status === 'approved' || a.status === 'declined') && a.decidedOn && inWindow(a.decidedOn));
  const approvedN = decided.filter((a) => a.status === 'approved').length;
  const toDecide = decided.map((a) => Math.max(0, isoToSerial(a.decidedOn!) - isoToSerial(a.requestedOn)));

  const peakDays = [...perDay.entries()]
    .map(([date, s]) => ({ date, away: s.size }))
    .sort((a, b) => b.away - a.away || (a.date < b.date ? -1 : 1))
    .slice(0, 5);

  const hw = input.hoursWorked?.filter((h) => h.hours > 0) ?? null;

  return {
    from: input.from,
    to: input.to,
    headcount: input.headcount,
    totals: {
      approvedDays: r1(approvedDays),
      pendingDays: r1(pendingDays),
      requests,
      peopleWithLeave: people.size,
      daysPerPerson: input.headcount ? r1(approvedDays / input.headcount) : 0,
    },
    byType: finish(byType),
    byTeam: finish(byTeam),
    byGroup: finish(byGroup),
    byMonth: finish(byMonth, 'key'),
    peakDays,
    approval: {
      decided: decided.length,
      approved: approvedN,
      declined: decided.length - approvedN,
      approvalRatePct: decided.length ? Math.round((approvedN / decided.length) * 100) : null,
      medianDaysToDecide: median(toDecide),
    },
    medianLeadDays: median(leads),
    hoursWorked: hw ? { total: r1(hw.reduce((s, h) => s + h.hours, 0)), people: hw.length } : null,
    forfeitRisk: (input.forfeitRisk ?? []).filter((f) => f.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 10),
  };
}
