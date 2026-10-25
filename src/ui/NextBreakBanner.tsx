import type { Break } from '../solver/types';
import { isoToSerial } from '../solver/dateUtils';
import { formatCardDateRange } from './dateFormat';

export interface OrderedBreak {
  index: number;
  brk: Break;
}

/**
 * Phase 3 item 6: a reason to reopen the tool after the plan is made. `orderedBreaks` is
 * already chronological by start date (see useAppState), so the next break is simply the
 * first one that isn't fully in the past - a break already in progress (start <= today <=
 * end) still counts as "next" rather than being skipped, it just renders as happening now
 * instead of "N days away" below.
 */
export function findNextBreak(orderedBreaks: OrderedBreak[], today: string): OrderedBreak | undefined {
  return orderedBreaks.find(({ brk }) => brk.end >= today);
}

export function daysUntil(today: string, start: string): number {
  return isoToSerial(start) - isoToSerial(today);
}

interface NextBreakBannerProps {
  orderedBreaks: OrderedBreak[];
  today: string;
  onPlanNextYear: () => void;
}

/** One line at the very top of the page - costs almost nothing, gives a reason to come
 * back after the plan is already made and shared. */
export function NextBreakBanner({ orderedBreaks, today, onPlanNextYear }: NextBreakBannerProps) {
  const next = findNextBreak(orderedBreaks, today);

  if (!next) {
    return (
      <div
        className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
        role="status"
      >
        No more breaks planned in this range.{' '}
        <button
          type="button"
          onClick={onPlanNextYear}
          className="font-medium text-slate-800 dark:text-slate-100 underline underline-offset-2 hover:no-underline"
        >
          Plan next year &rarr;
        </button>
      </div>
    );
  }

  const { brk } = next;
  const inProgress = brk.start <= today;
  const away = daysUntil(today, brk.start);
  const dayWord = away === 1 ? 'day' : 'days';

  return (
    <div
      className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-sm text-slate-600 dark:text-slate-300"
      role="status"
    >
      Your next break: <span className="font-medium text-slate-800 dark:text-slate-100">{formatCardDateRange(brk.start, brk.end)}</span>
      {inProgress ? ' — happening now.' : `, ${away} ${dayWord} away.`}
    </div>
  );
}
