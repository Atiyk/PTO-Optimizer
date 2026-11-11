import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Scores } from '@daysoff/engine/solver/types';
import { intensityBand } from './scoreFormat';

interface SummaryMetricsProps {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  scores: Scores | null;
  /** 'us': scored on 2025 US airport checkpoint counts. 'estimate': a seasonal rule of thumb. */
  travelBasis?: 'us' | 'estimate';
}

/** A changed figure gets one brief pale-marker pass (150ms), never a loop, never on load;
 * prefers-reduced-motion collapses it (index.css). */
function useChangeFlash(value: string): boolean {
  const prev = useRef(value);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), 150);
    return () => clearTimeout(timer);
  }, [value]);
  return flashing;
}

function Fact({ figure, label, short, children }: { figure: string; label: string; short: string; children: ReactNode }) {
  const flashing = useChangeFlash(figure);
  return (
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className="m-0">
        <span
          data-figure
          className={`-mx-1 inline-block w-fit rounded-[6px] px-1 text-2xl leading-7 sm:text-[1.75rem] sm:leading-8 tabular-nums text-ink type-display transition-colors duration-150 ${
            flashing ? 'bg-accent-soft' : 'bg-transparent'
          }`}
        >
          {figure}
        </span>
        {/* Phones: the three figures share one row with a short label each; the full
            plain-language reading appears from sm up. */}
        <span aria-hidden="true" className="block text-xs leading-4 text-muted sm:hidden">{short}</span>
        <span className="sr-only sm:not-sr-only sm:mt-1 sm:block sm:text-sm sm:leading-5 sm:text-muted">{children}</span>
      </dd>
    </div>
  );
}

function trimDecimal(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Keep the exact PTO arithmetic separate from broad travel model context.
 * The internal travel percentile only selects an ordinal band for US history.
 */
export function SummaryMetrics({ budgetSpent, totalDaysOff, breakCountActual, scores, travelBasis = 'estimate' }: SummaryMetricsProps) {
  const ratio = budgetSpent > 0 ? trimDecimal(totalDaysOff / budgetSpent) : null;
  const offWord = totalDaysOff === 1 ? 'day' : 'days';
  const ptoWord = budgetSpent === 1 ? 'day' : 'days';
  const breakWord = breakCountActual === 1 ? 'break' : 'breaks';
  const travelFigure = scores
    ? travelBasis === 'us' ? ['Busier', 'Typical', 'Quieter'][intensityBand(scores.travel.percentile)] : 'Seasonal'
    : '—';
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 border-t border-line pt-4 sm:gap-x-8">
      <Fact figure={ratio ? `${ratio}×` : '—'} label="Days off per PTO day" short="days off per PTO day">
        {ratio
          ? <>{totalDaysOff} {offWord} off for {budgetSpent} PTO {ptoWord} in {breakCountActual} {breakWord}. Each PTO day buys {ratio} days off, weekends and holidays included.</>
          : <>No PTO placed yet, so there is no return to show.</>}
      </Fact>
      <Fact figure={travelFigure} label="Travel estimate" short="travel estimate">
        {scores
          ? travelBasis === 'us'
            ? <>Relative comparison using a 7-day seasonal average of 2025 US airport checkpoint counts. Not a forecast or a fare price.</>
            : <>Generic seasonal estimate without country-specific travel observations.</>
          : <>Appears once the plan is solved.</>}
      </Fact>
    </dl>
  );
}
