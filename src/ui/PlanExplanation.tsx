import { Chevron } from './Chevron';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';

export interface PlanDayBreakdown {
  /** Unique dates across all recommended breaks. Never count overlapping dates twice. */
  calendarDays: number;
  /** Workdays converted to time off by spending PTO. */
  ptoDays: number;
  /** Days normally off according to the selected workweek. */
  regularDaysOff: number;
  /** Other workdays already off under the selected holiday/employer calendar. */
  calendarDaysOff: number;
  breakCount: number;
}

/**
 * A deterministic, local-only explanation of the existing solver's chosen dates.
 * This does not rerun the solver, infer legal rights, or interpret travel percentiles.
 *
 * Classification precedence matters: a public holiday on a normal weekend is counted
 * once as a regular day off. A custom workweek can move that same holiday into the
 * employer-calendar category. A pinned already-off day never becomes a paid PTO day.
 */
export function summarizePlanDays(
  breaks: readonly Break[],
  workWeek: WorkWeek,
  offDays: ReadonlySet<string>,
): PlanDayBreakdown | null {
  const dates = new Set(breaks.flatMap((brk) => brk.days));
  if (dates.size === 0) return null;

  let ptoDays = 0;
  let regularDaysOff = 0;
  let calendarDaysOff = 0;

  for (const date of dates) {
    if (!workWeek[mondayIndexedDow(date)]) regularDaysOff += 1;
    else if (offDays.has(date)) calendarDaysOff += 1;
    else ptoDays += 1;
  }

  return {
    calendarDays: dates.size,
    ptoDays,
    regularDaysOff,
    calendarDaysOff,
    breakCount: breaks.length,
  };
}

function days(value: number) {
  return `${value} ${value === 1 ? 'day' : 'days'}`;
}

/**
 * Optional, unobtrusive "Why this plan?" disclosure next to the result metrics.
 * Uses the exact recommended break dates and current calendar assumptions, not an LLM.
 */
export function PlanExplanation({
  breaks,
  workWeek,
  offDays,
  budgetSpent,
  totalDaysOff,
}: {
  breaks: readonly Break[];
  workWeek: WorkWeek;
  offDays: ReadonlySet<string>;
  budgetSpent: number;
  totalDaysOff: number;
}) {
  const breakdown = summarizePlanDays(breaks, workWeek, offDays);
  if (!breakdown) return null;

  // Do not display a seemingly authoritative arithmetic explanation if the solver's
  // totals and the currently loaded calendar are temporarily out of sync.
  const consistent = breakdown.ptoDays === budgetSpent && breakdown.calendarDays === totalDaysOff;

  return (
    <details className="group border-y border-line" data-testid="plan-explanation">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-flex w-3 transition-transform duration-150 group-open:rotate-90"><Chevron direction="right" /></span>
        <span>Why this plan? <span className="ml-1 font-normal text-muted">See how the days add up</span></span>
      </summary>
      <div className="border-t border-line pb-4 pt-3 text-sm text-muted">
        {consistent ? (
          <>
            <p>
              Your {breakdown.breakCount} recommended {breakdown.breakCount === 1 ? 'break combines' : 'breaks combine'}{' '}
              {days(breakdown.ptoDays)} of PTO, {days(breakdown.regularDaysOff)} already off under your workweek,
              and {days(breakdown.calendarDaysOff)} from your selected holiday or employer calendar.
              That makes {days(breakdown.calendarDays)} off across the recommended breaks.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><dt className="text-xs text-muted">PTO used</dt><dd className="text-lg font-bold tabular-nums text-ink type-condensed">{days(breakdown.ptoDays)}</dd></div>
              <div><dt className="text-xs text-muted">Regular days off</dt><dd className="text-lg font-bold tabular-nums text-ink type-condensed">{days(breakdown.regularDaysOff)}</dd></div>
              <div><dt className="text-xs text-muted">Calendar holidays / days off</dt><dd className="text-lg font-bold tabular-nums text-ink type-condensed">{days(breakdown.calendarDaysOff)}</dd></div>
              <div><dt className="text-xs text-muted">Total time off</dt><dd className="text-lg font-bold tabular-nums text-ink type-condensed">{days(breakdown.calendarDays)}</dd></div>
            </dl>
            <p className="mt-3 text-xs">
              A date off under both your workweek and holiday calendar is counted only once. Adjust your workweek,
              employer holidays, or the two planning sliders to see a different plan. This is a planning estimate,
              not an approved leave request.
            </p>
          </>
        ) : (
          <p role="status">
            Your plan is updating as the calendar settles. The breakdown will appear when the recommended dates,
            PTO cost, and loaded holiday assumptions agree.
          </p>
        )}
      </div>
    </details>
  );
}
