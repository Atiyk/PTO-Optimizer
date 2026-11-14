import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { DEFAULT_NOTICE_PERIOD_DAYS, submitByDate } from '../personal/outOfOffice';
import type { PtoRequest, RequestStatus } from '../personal/requestLedger';
import type { PlanSnapshot } from './useAppState';
import { partitionPlanParams } from './shareFormat';
import { writeFullStateToURL } from './urlState';

/**
 * Research rec 10: a returning visitor sees the next thing they saved in this browser.
 * Reads only what the planner and My PTO already stored; adds no storage and sends nothing.
 */
export type ReturnItem =
  | { kind: 'request'; request: PtoRequest; requestBy?: string; status: string }
  | { kind: 'plan'; plan: PlanSnapshot; href: string; privateSearch: string };

const OPEN_STATUSES: Partial<Record<RequestStatus, string>> = {
  considering: 'Considering', planned: 'Planned', requested: 'Requested', approved: 'Approved',
};
/** Not asked for yet: a request-by date still helps. */
const NOT_YET_REQUESTED: readonly RequestStatus[] = ['considering', 'planned'];

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
    const firstPtoDay = request.ptoDates.find((date) => date >= today);
    // Same default notice as the My PTO tracker (14 calendar days before the first day away).
    const requestBy = NOT_YET_REQUESTED.includes(request.status) && firstPtoDay
      ? submitByDate(firstPtoDay, DEFAULT_NOTICE_PERIOD_DAYS, DEFAULT_WORK_WEEK, offDays) ?? undefined
      : undefined;
    return { kind: 'request', request, status: OPEN_STATUSES[request.status]!, requestBy };
  }
  const plan = plans.filter((entry) => entry.rangeEnd >= today && entry.summary.totalDaysOff > 0)
    .sort((a, b) => a.rangeStart.localeCompare(b.rangeStart))[0];
  return plan ? { kind: 'plan', plan, ...savedPlanLink(plan) } : null;
}
