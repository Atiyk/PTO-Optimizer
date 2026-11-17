import type { PlanSnapshot } from './useAppState';

/** Source inputs, not derived summary figures; identical breaks can hide changed policies. */
const INPUT_KEYS = [
  'subdivision', 'planningVersion', 'planningStyle', 'season', 'minimumBreakDays',
  'employerCalendar', 'budget', 'w', 'letSolverDecide', 'manualBreakCount',
  'weekStartOverride', 'accrualEnabled', 'accrualPerMonth', 'expiryEnabled',
  'expiryDate', 'carryoverCap', 'overlapDays', 'blackouts', 'workWeek', 'forced',
  'altFridayEnabled', 'altFridayStart', 'reserveDays', 'applyTrackedRequests',
  'reserveApprovedPto', 'unlimitedPto', 'noticePeriodDays', 'noticeUnit',
  'peakCapEnabled', 'peakCapStart', 'peakCapEnd', 'peakCapMaxDays',
] as const satisfies readonly (keyof PlanSnapshot)[];

type PlanInputKey = typeof INPUT_KEYS[number];
export interface SavedBreakLike { start: string; end: string; ptoDates?: readonly string[] }
export type SavedPlanLike = Pick<PlanSnapshot, 'country' | 'rangeStart' | 'rangeEnd'>
  & Partial<Pick<PlanSnapshot, PlanInputKey>> & { breaks?: readonly SavedBreakLike[] };
export type CurrentPlanLike = SavedPlanLike;

/** Legacy saved breaks without charged PTO dates cannot prove the exact plan is saved. */
export function isPlanKept(saved: readonly SavedPlanLike[], current: CurrentPlanLike): boolean {
  const breaks = current.breaks;
  if (!breaks?.length) return false;
  return saved.some((plan) => plan.country === current.country
    && plan.rangeStart === current.rangeStart && plan.rangeEnd === current.rangeEnd
    && INPUT_KEYS.every(key => JSON.stringify(plan[key]) === JSON.stringify(current[key]))
    && plan.breaks !== undefined && plan.breaks.length === breaks.length
    && plan.breaks.every((brk, i) => {
      const now = breaks[i];
      return brk.start === now.start && brk.end === now.end
        && brk.ptoDates !== undefined && now.ptoDates !== undefined
        && brk.ptoDates.length === now.ptoDates.length
        && brk.ptoDates.every((d, j) => d === now.ptoDates?.[j]);
    }));
}

export type PrimaryActionKind = 'keep' | 'calendar' | 'copy-request' | 'manage';

export function choosePrimaryAction(state: {
  kept: boolean; roomToKeep: boolean; trackedRequests: number; hasUnrequestedBreak: boolean;
}): PrimaryActionKind {
  if (state.trackedRequests > 0 && state.hasUnrequestedBreak) return 'copy-request';
  if (state.kept) return 'calendar';
  if (!state.roomToKeep) return 'manage';
  return 'keep';
}

export const PRIMARY_ACTION_LABEL: Record<PrimaryActionKind, string> = {
  keep: 'Keep this plan',
  calendar: 'Add to calendar',
  'copy-request': 'Copy request',
  manage: 'Manage saved plans',
};
