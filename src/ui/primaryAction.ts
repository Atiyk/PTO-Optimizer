/**
 * The one primary action under a plan, chosen by where the person is:
 * - nothing kept yet: "Keep this plan" (saves in this browser; the save confirmation then
 *   offers Add to calendar and Back up),
 * - this plan already kept (or no room to keep another): "Add to calendar",
 * - a request already tracked and a break still to ask for: "Copy request".
 * Pure, so the choice is tested without rendering the page.
 */
export type PrimaryActionKind = 'keep' | 'calendar' | 'copy-request';

export interface SavedBreakLike { start: string; end: string; ptoDates?: readonly string[] }
export interface SavedPlanLike { country: string; rangeStart: string; rangeEnd: string; breaks?: readonly SavedBreakLike[] }

export interface CurrentPlanLike {
  country: string;
  rangeStart: string;
  rangeEnd: string;
  breaks: readonly { start: string; end: string; ptoDates: readonly string[] }[];
}

/** Whether a kept plan has exactly the current plan's breaks and PTO dates. */
export function isPlanKept(saved: readonly SavedPlanLike[], current: CurrentPlanLike): boolean {
  if (current.breaks.length === 0) return false;
  return saved.some((plan) => plan.country === current.country
    && plan.rangeStart === current.rangeStart && plan.rangeEnd === current.rangeEnd
    && plan.breaks !== undefined && plan.breaks.length === current.breaks.length
    && plan.breaks.every((brk, i) => {
      const now = current.breaks[i];
      return brk.start === now.start && brk.end === now.end
        && (brk.ptoDates === undefined || (brk.ptoDates.length === now.ptoDates.length && brk.ptoDates.every((d, j) => d === now.ptoDates[j])));
    }));
}

export function choosePrimaryAction(state: {
  kept: boolean;
  /** Room for one more kept plan in this browser. */
  roomToKeep: boolean;
  trackedRequests: number;
  /** A suggested break that has no saved or tracked request yet. */
  hasUnrequestedBreak: boolean;
}): PrimaryActionKind {
  if (state.trackedRequests > 0 && state.hasUnrequestedBreak) return 'copy-request';
  if (state.kept || !state.roomToKeep) return 'calendar';
  return 'keep';
}

export const PRIMARY_ACTION_LABEL: Record<PrimaryActionKind, string> = {
  keep: 'Keep this plan',
  calendar: 'Add to calendar',
  'copy-request': 'Copy request',
};
