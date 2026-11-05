import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Scores } from '@daysoff/engine/solver/types';
import { ordinal, travelLine } from './scoreFormat';

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

function gloss(line: string): string {
  return line.split(' · ')[1] ?? '';
}

function trimDecimal(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * The plan's quality in words, not opaque pills: what each PTO day buys, and where the two
 * percentile scores sit, each with the plain-language reading the scoreFormat bands derive
 * ("quieter than most weeks in your dates"). Same engine numbers as before; the counts
 * (PTO used, days off, breaks) are stated once, in the result line above.
 */
export function SummaryMetrics({ budgetSpent, totalDaysOff, breakCountActual, scores, travelBasis = 'estimate' }: SummaryMetricsProps) {
  const ratio = budgetSpent > 0 ? trimDecimal(totalDaysOff / budgetSpent) : null;
  const offWord = totalDaysOff === 1 ? 'day' : 'days';
  const ptoWord = budgetSpent === 1 ? 'day' : 'days';
  const breakWord = breakCountActual === 1 ? 'break' : 'breaks';
  return (
    // Two facts, not three: the efficiency percentile only compares this plan with itself
    // re-solved at other travel settings, so it lives in "Why this plan?" wording, not as a
    // headline figure that reads like a ranking against every possible plan.
    <dl className="m-0 grid grid-cols-2 gap-x-4 border-t border-line pt-4 sm:gap-x-8">
      <Fact figure={ratio ? `${ratio}×` : '—'} label="Days off per PTO day" short="days off per PTO day">
        {ratio
          ? <>{totalDaysOff} {offWord} off for {budgetSpent} PTO {ptoWord} in {breakCountActual} {breakWord}. Each PTO day buys {ratio} days off, weekends and holidays included.</>
          : <>No PTO placed yet, so there is no return to show.</>}
      </Fact>
      <Fact figure={scores ? ordinal(scores.travel.percentile) : '—'} label={travelBasis === 'us' ? 'Travel quietness' : 'Travel quietness (est.)'} short={travelBasis === 'us' ? 'travel quietness' : 'travel quietness (est.)'}>
        {scores
          ? <>Higher is quieter: {gloss(travelLine(scores))}. {travelBasis === 'us' ? 'Based on 2025 US airport checkpoint counts.' : 'A seasonal estimate; there is no travel data for this country.'}</>
          : <>Appears once the plan is solved.</>}
      </Fact>
    </dl>
  );
}
