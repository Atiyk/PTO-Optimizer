import { DEFAULT_WORK_WEEK, type ISODate, type WorkWeek } from '@daysoff/engine/solver/types';
import type { NoticeUnit } from '@daysoff/engine/calendar/requestDeadline';
import { DEFAULT_NOTICE_PERIOD_DAYS, submitByDate } from '../personal/outOfOffice';
import { validRequestRange, type PtoRequest, type RequestStatus } from '../personal/requestLedger';
import type { PlanSnapshot } from './useAppState';
import { partitionPlanParams } from './shareFormat';
import { writeFullStateToURL } from './urlState';

/**
 * Research rec 10: a returning visitor sees the next thing they saved in this browser.
 * Reads only what the planner and My PTO already stored; adds no storage and sends nothing.
 */
export type ReturnItem =
  | { kind: 'request'; request: PtoRequest; submitBy?: SubmitBy; status: string }
  | { kind: 'plan'; plan: PlanSnapshot; href: string; privateSearch: string };

const OPEN_STATUSES: Partial<Record<RequestStatus, string>> = {
  considering: 'Considering', planned: 'Planned', requested: 'Requested', approved: 'Approved',
};
export interface SubmitBy {
  /** null when this work schedule has no working day to count back from. */
  date: ISODate | null;
  noticePeriodDays: number;
  noticeUnit: NoticeUnit;
}

/**
 * N-P1-2: the one "Submit by" rule shared by the My PTO tracker and the homepage welcome
 * row. Only a Planned request that has not started gets a date. The notice period is, in
 * order: the page's own setting when it has one (the planner on /pto), the notice period
 * the request was planned with, then the 14-day default.
 */
export function requestSubmitBy(
  request: PtoRequest, today: ISODate, calendar: { workWeek: WorkWeek; offDays: readonly ISODate[] },
  pageNotice?: { noticePeriodDays: number; noticeUnit?: NoticeUnit },
): SubmitBy | null {
  if (request.status !== 'planned' || request.start < today || !validRequestRange(request.start, request.end)) return null;
  const noticePeriodDays = pageNotice?.noticePeriodDays ?? request.noticePeriodDays ?? DEFAULT_NOTICE_PERIOD_DAYS;
  const noticeUnit = (pageNotice ? pageNotice.noticeUnit : request.noticeUnit) ?? 'calendar';
  return { date: submitByDate(request.start, noticePeriodDays, calendar.workWeek, calendar.offDays, noticeUnit), noticePeriodDays, noticeUnit };
}

/** The saved plan's own planner link: public keys in the address, private ones handed over on this device. */
export function savedPlanLink(plan: PlanSnapshot): { href: string; privateSearch: string } {
  const full = new URLSearchParams();
  writeFullStateToURL(full, { ...plan, breakCount: plan.letSolverDecide ? 0 : plan.manualBreakCount });
  const { address, draft } = partitionPlanParams(full);
  return { href: `/pto?${address}`, privateSearch: draft.toString() };
}

export function nextReturnItem(
  requests: readonly PtoRequest[], plans: readonly PlanSnapshot[], today: string, offDays: readonly string[] = [],
): ReturnItem | null {
  const request = requests
    .filter((entry) => entry.end >= today && OPEN_STATUSES[entry.status] !== undefined)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))[0];
  if (request) {
    const submitBy = requestSubmitBy(request, today, { workWeek: DEFAULT_WORK_WEEK, offDays }) ?? undefined;
    return { kind: 'request', request, status: OPEN_STATUSES[request.status]!, submitBy };
  }
  const plan = plans.filter((entry) => entry.rangeEnd >= today && entry.summary.totalDaysOff > 0)
    .sort((a, b) => a.rangeStart.localeCompare(b.rangeStart))[0];
  return plan ? { kind: 'plan', plan, ...savedPlanLink(plan) } : null;
}
