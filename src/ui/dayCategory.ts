import type { DayCategory, ForcedState } from './types';

export interface DayCategoryInputs {
  isBlackout: boolean;
  forcedState: ForcedState | undefined;
  isBaseOff: boolean;
  isWeekend: boolean;
  isChosen: boolean;
}

/**
 * Pulled out of useAppState.ts as a standalone pure function so the category logic -
 * especially "forced-include vs genuine public holiday," the exact distinction a recent
 * bug report was about - is directly unit-testable without mounting the whole hook.
 *
 * A day forced 'include' is categorized 'pinned' before anything else is checked,
 * regardless of whether it also happens to be a real holiday or weekend - the user's own
 * deliberate pin should always register, not get silently absorbed into whatever the day
 * already was. A day forced 'exclude' (blackoutSet already includes it via useAppState)
 * stays a plain 'working' day - there's no distinct visual for "ruled out," only for
 * "pinned in".
 */
export function classifyDay({ isBlackout, forcedState, isBaseOff, isWeekend, isChosen }: DayCategoryInputs): DayCategory {
  if (isBlackout) return 'working';
  if (forcedState === 'include') return 'pinned';
  const wasOff = isBaseOff || isWeekend;
  if (!wasOff && isChosen) return 'suggested-pto';
  if (isBaseOff) return 'public-holiday';
  if (isWeekend) return 'weekend';
  return 'working';
}
