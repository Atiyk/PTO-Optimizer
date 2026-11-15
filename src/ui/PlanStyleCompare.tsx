import { useEffect, useState } from 'react';
import type { SolveInput } from '@daysoff/engine/solver/types';
import type { PlanningStyle } from '../planning/optimizer';
import type { PlanComparisonEntry } from '../planning/planComparison';
import type { PlanStyleOptions, Season } from '../planning/yearPlan';
import { YearLine } from './YearLine';

const SEASON_LABEL: Record<Season, string> = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
/** Days the style kept back on purpose are a reserve, not days someone forgot to plan. */
const remainingLabel = (entry: Pick<PlanComparisonEntry, 'reserveKept' | 'remainingPto'>) =>
  entry.reserveKept > 0 && entry.remainingPto <= entry.reserveKept ? 'Kept in reserve' : 'Left unplanned';

/**
 * comparePlanStyles() for the current inputs, worked out just after the plan itself so it
 * never delays the result. A few full solves, so it waits for typing to settle; the last
 * comparison stays on screen while the next one is worked out.
 */
export function usePlanStyleComparison(input: SolveInput | undefined, minimumBreakDays: number, plan: PlanStyleOptions, heldReserveDays: number, enabled: boolean) {
  const planKey = JSON.stringify(plan);
  const [entries, setEntries] = useState<PlanComparisonEntry[] | null>(null);
  useEffect(() => {
    if (!enabled || !input) return;
    // The comparison code loads with the first comparison, not with the planner.
    let cancelled = false;
    const timer = window.setTimeout(() => {
      import('../planning/planComparison').then(({ comparePlanStyles }) => {
        if (cancelled) return;
        try {
          setEntries(comparePlanStyles({ input, minimumBreakDays, plan: JSON.parse(planKey) as PlanStyleOptions, heldReserveDays }));
        } catch {
          setEntries([]);
        }
      }, () => { if (!cancelled) setEntries([]); });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [input, minimumBreakDays, planKey, heldReserveDays, enabled]);
  return enabled ? entries : null;
}

interface PlanStyleCompareProps {
  entries: readonly PlanComparisonEntry[];
  style: PlanningStyle;
  onChangeStyle: (style: PlanningStyle) => void;
  /** "wide" puts the cards side by side (desktop main column); "narrow" is a swipe strip. */
  layout: 'narrow' | 'wide';
  /** With the planning dates, each option draws its breaks on the year line, so the
   * difference between two plans is something you see before you read the figures. */
  range?: { start: string; end: string };
}

/**
 * Two or three genuinely different plans for the same PTO, side by side. Choosing a card sets
 * the goal (the same `ps` value the goal picker sets) and the plan updates at once: a live
 * choice, never a submit. Each card is one radio, labelled by the whole card.
 */
export function PlanStyleCompare({ entries, style, onChangeStyle, layout, range }: PlanStyleCompareProps) {
  if (entries.length < 2) return null;
  const strip = layout === 'narrow';
  return (
    <section aria-labelledby="compare-styles-heading" className="flex min-w-0 flex-col gap-2">
      <div>
        <h3 id="compare-styles-heading" className="text-base font-bold text-ink">Compare plan styles</h3>
        <p className="text-sm text-muted">The same PTO, planned {entries.length} ways. Choose one and the plan updates.{strip && <span className="md:hidden"> Swipe to see each.</span>}</p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="compare-styles-heading"
        className={strip
          ? 'relative -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 motion-safe:scroll-smooth'
          : 'grid grid-cols-1 gap-3 sm:grid-cols-3'}
      >
        {entries.map((entry) => {
          const chosen = entry.style === style;
          const id = `compare-style-${entry.style}`;
          return (
            <label
              key={entry.style}
              htmlFor={id}
              data-compare-style={entry.style}
              className={`flex min-w-0 cursor-pointer snap-start flex-col gap-2 rounded-[14px] border bg-surface p-4 text-sm text-ink transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)] ${chosen ? 'border-ink' : 'border-line hover:border-line-strong'} ${strip ? 'w-[82%] shrink-0 sm:w-[46%]' : ''}`}
            >
              <span className="flex items-start gap-2">
                <input
                  id={id}
                  type="radio"
                  name="plan-style-compare"
                  value={entry.style}
                  checked={chosen}
                  onChange={() => onChangeStyle(entry.style)}
                  aria-describedby={`${id}-tradeoff`}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0 flex-1 font-semibold leading-5">{entry.label}</span>
                {chosen && <span className="shrink-0 rounded-[6px] bg-surface-alt px-1.5 text-xs font-semibold">Your plan</span>}
              </span>
              <span className="text-xl font-bold tabular-nums"><span className="mark">{entry.totalDaysOff} days off</span></span>
              {range && <span aria-hidden="true" className="block"><YearLine rangeStart={range.start} rangeEnd={range.end} breaks={entry.breaks.slice().sort((a, b) => a.start.localeCompare(b.start))} compact /></span>}
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 tabular-nums">
                <dt className="text-muted">PTO used</dt><dd className="m-0 text-right">{days(entry.ptoUsed)}</dd>
                <dt className="text-muted">Longest break</dt><dd className="m-0 text-right">{days(entry.longestBreak)}</dd>
                <dt className="text-muted">Breaks</dt><dd className="m-0 text-right">{entry.breakCount}</dd>
                <dt className="text-muted">Seasons</dt><dd className="m-0 text-right">{entry.seasonsTouched.map((s) => SEASON_LABEL[s]).join(', ') || 'None'}</dd>
                <dt className="text-muted">{remainingLabel(entry)}</dt><dd className="m-0 text-right">{days(entry.remainingPto)}</dd>
              </dl>
              <span id={`${id}-tradeoff`} className="text-muted">{entry.tradeOff}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
