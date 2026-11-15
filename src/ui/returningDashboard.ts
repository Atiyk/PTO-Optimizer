import { DEFAULT_WORK_WEEK, type Break, type ISODate } from '@daysoff/engine/solver/types';
import { isoToSerial, rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { NoticeUnit } from '@daysoff/engine/calendar/requestDeadline';
import { submitByDate } from '../personal/outOfOffice';
import type { PtoRequest, RequestStatus } from '../personal/requestLedger';
import { requestSubmitBy, savedPlanLink, type SubmitBy } from './returnVisit';
import type { PlanSnapshot } from './useAppState';

/**
 * P3 returning-user dashboard: what the homepage shows a visitor who saved something in this
 * browser. Pure (tested in returningDashboard.test.ts); ReturningDashboard.tsx renders it.
 * It reads only what the planner and My PTO already stored, and states only figures the app
 * has: anything it does not know is left out rather than estimated.
 */
export type NextBreakStatus = 'in-plan' | Extract<RequestStatus, 'considering' | 'planned' | 'requested' | 'approved'>;

export interface NextBreak {
  start: ISODate;
  end: ISODate;
  /** Known for a break from a saved plan; a tracked request only knows its PTO days. */
  totalDaysOff?: number;
  ptoDays: number;
  ptoDates: ISODate[];
  status: NextBreakStatus;
  request?: PtoRequest;
  submitBy?: SubmitBy;
  /** The notice period and work week the request text and the "mark requested" entry use. */
  noticePeriodDays?: number;
  noticeUnit?: NoticeUnit;
}

export type NextAction = 'copy-request' | 'mark-requested' | 'mark-approved' | 'open-plan' | 'open-tracker';

export type DashboardReminder =
  | { kind: 'notice-passed'; date: ISODate; noticePeriodDays: number; noticeUnit: NoticeUnit }
  | { kind: 'request-by-soon'; date: ISODate; days: number }
  | { kind: 'expiry-soon'; date: ISODate; days: number };

export interface PtoLine {
  /** The plan's PTO days, when it has a fixed number (no accrual, not unlimited). */
  available?: number;
  /** PTO days the saved plan uses. */
  planned?: number;
  /** PTO days in breaks marked requested and still ahead. */
  requested?: number;
  /** PTO days in approved breaks within the plan's dates (or ahead, without a plan). */
  approved?: number;
  /** available − planned, when both are known. */
  unplanned?: number;
}

export interface DashboardModel {
  /** next-break: something is ahead. plan-only: a saved plan without stored breaks.
   * past-only: every saved break is behind us. */
  state: 'next-break' | 'plan-only' | 'past-only';
  next?: NextBreak;
  plan?: PlanSnapshot;
  planLink?: { href: string; privateSearch: string };
  pto?: PtoLine;
  action: NextAction;
  reminder?: DashboardReminder;
}

const OPEN: readonly RequestStatus[] = ['considering', 'planned', 'requested', 'approved'];
const daysBetween = (from: ISODate, to: ISODate) => isoToSerial(to) - isoToSerial(from);

function pickPlan(plans: readonly PlanSnapshot[], today: ISODate): { plan: PlanSnapshot; past: boolean } | undefined {
  const upcoming = plans.filter((plan) => plan.rangeEnd >= today && plan.summary.totalDaysOff > 0)
    .sort((a, b) => a.rangeStart.localeCompare(b.rangeStart))[0];
  if (upcoming) return { plan: upcoming, past: false };
  const past = plans.filter((plan) => plan.summary.totalDaysOff > 0).sort((a, b) => b.rangeEnd.localeCompare(a.rangeEnd))[0];
  return past ? { plan: past, past: true } : undefined;
}

function ptoLine(plan: PlanSnapshot | undefined, requests: readonly PtoRequest[], today: ISODate): PtoLine | undefined {
  const sum = (list: readonly PtoRequest[]) => list.reduce((total, request) => total + request.ptoDays, 0);
  const inScope = (request: PtoRequest) => plan ? request.end >= plan.rangeStart && request.start <= plan.rangeEnd : request.end >= today;
  const approvedList = requests.filter((request) => (request.status === 'approved' || request.status === 'completed') && inScope(request));
  const requestedList = requests.filter((request) => request.status === 'requested' && request.end >= today);
  const line: PtoLine = {};
  if (plan && !plan.unlimitedPto) {
    line.planned = plan.summary.budgetSpent;
    if (!plan.accrualEnabled) {
      line.available = plan.budget;
      line.unplanned = Math.max(0, plan.budget - plan.summary.budgetSpent);
    }
  }
  if (requestedList.length) line.requested = sum(requestedList);
  if (approvedList.length) line.approved = sum(approvedList);
  return Object.keys(line).length ? line : undefined;
}

export function buildDashboard(input: {
  requests: readonly PtoRequest[];
  plans: readonly PlanSnapshot[];
  today: ISODate;
  /** Public holidays the landing page knows, for request-by dates that skip them. */
  offDays?: readonly ISODate[];
  /** True once the request text for the current next break was copied this visit. */
  copied?: boolean;
}): DashboardModel | null {
  const { requests, plans, today, offDays = [], copied = false } = input;
  const picked = pickPlan(plans, today);
  const plan = picked?.plan;
  const openRequests = requests.filter((request) => request.end >= today && OPEN.includes(request.status));
  if (!plan && openRequests.length === 0) return null;

  const candidates: NextBreak[] = openRequests.map((request) => ({
    start: request.start, end: request.end, ptoDays: request.ptoDays, ptoDates: request.ptoDates,
    status: request.status as NextBreakStatus, request,
    submitBy: requestSubmitBy(request, today, { workWeek: DEFAULT_WORK_WEEK, offDays }) ?? undefined,
    noticePeriodDays: request.noticePeriodDays, noticeUnit: request.noticeUnit,
  }));
  if (plan && !picked.past && plan.breaks) {
    for (const brk of plan.breaks) {
      // A break already tracked in My PTO shows as its request (or not at all once it was
      // rejected, canceled or completed).
      if (brk.end < today || requests.some((request) => request.start === brk.start && request.end === brk.end)) continue;
      const noticeUnit = plan.noticeUnit ?? 'calendar';
      const date = brk.start >= today ? submitByDate(brk.start, plan.noticePeriodDays, plan.workWeek, offDays, noticeUnit) : null;
      candidates.push({
        start: brk.start, end: brk.end, totalDaysOff: brk.totalDaysOff, ptoDays: brk.ptoCost, ptoDates: brk.ptoDates,
        status: 'in-plan', noticePeriodDays: plan.noticePeriodDays, noticeUnit,
        ...(date ? { submitBy: { date, noticePeriodDays: plan.noticePeriodDays, noticeUnit } } : {}),
      });
    }
  }
  const next = candidates.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))[0];
  const planLink = plan ? savedPlanLink(plan) : undefined;
  const state: DashboardModel['state'] = next ? 'next-break' : picked?.past ? 'past-only' : 'plan-only';

  let action: NextAction = plan ? 'open-plan' : 'open-tracker';
  if (next) {
    if (next.status === 'requested') action = 'mark-approved';
    else if (next.status !== 'approved') action = copied ? 'mark-requested' : 'copy-request';
  }

  let reminder: DashboardReminder | undefined;
  const asking = next && (next.status === 'in-plan' || next.status === 'planned');
  const submitDate = next?.submitBy?.date;
  if (asking && submitDate && next.start >= today && submitDate < today) {
    reminder = { kind: 'notice-passed', date: submitDate, noticePeriodDays: next.submitBy!.noticePeriodDays, noticeUnit: next.submitBy!.noticeUnit };
  } else if (asking && submitDate && submitDate >= today && daysBetween(today, submitDate) <= 14) {
    reminder = { kind: 'request-by-soon', date: submitDate, days: daysBetween(today, submitDate) };
  } else if (plan && plan.expiryEnabled && plan.expiryDate && plan.expiryDate >= today && daysBetween(today, plan.expiryDate) <= 60) {
    reminder = { kind: 'expiry-soon', date: plan.expiryDate, days: daysBetween(today, plan.expiryDate) };
  }

  return {
    state, ...(next ? { next } : {}), ...(plan ? { plan, planLink } : {}),
    ...(() => { const pto = ptoLine(plan, requests, today); return pto ? { pto } : {}; })(),
    action, ...(reminder ? { reminder } : {}),
  };
}

/** A Break shape for the existing request-text writers (src/ui/requestText.ts). Demand is
 * unknown here, so it is set to average: the text never claims a "quieter period". */
export function breakForRequestText(next: NextBreak): Break {
  const days = rangeISO(next.start, next.end);
  return {
    id: `${next.start}|${next.end}`, start: next.start, end: next.end, days,
    totalDaysOff: next.totalDaysOff ?? days.length, ptoCost: next.ptoDays, multiplier: 0, tags: [], meanDemand: 1,
  };
}
