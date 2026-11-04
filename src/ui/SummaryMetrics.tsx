import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Scores } from '@daysoff/engine/solver/types';
import { efficiencyLine, ordinal, travelLine } from './scoreFormat';

interface SummaryMetricsProps {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  scores: Scores | null;
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

function Fact({ figure, label, children }: { figure: string; label: string; children: ReactNode }) {
  const flashing = useChangeFlash(figure);
  return (
    <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3 sm:block">
      <dt className="sr-only">{label}</dt>
      <dd className="m-0 contents sm:block">
        <span
          data-figure
          className={`-mx-1 inline-block w-fit rounded-[3px] px-1 text-[1.75rem] leading-8 tabular-nums text-ink type-display transition-colors duration-150 ${
            flashing ? 'bg-accent-soft' : 'bg-transparent'
          }`}
        >
          {figure}
        </span>
        <span className="block text-sm leading-5 text-muted sm:mt-1">{children}</span>
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
 * ("better than most plans at this budget"). Same engine numbers as before; the counts
 * (PTO used, days off, breaks) are stated once, in the result line above.
 */
export function SummaryMetrics({ budgetSpent, totalDaysOff, breakCountActual, scores }: SummaryMetricsProps) {
  const ratio = budgetSpent > 0 ? trimDecimal(totalDaysOff / budgetSpent) : null;
  const offWord = totalDaysOff === 1 ? 'day' : 'days';
  const ptoWord = budgetSpent === 1 ? 'day' : 'days';
  const breakWord = breakCountActual === 1 ? 'break' : 'breaks';
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
      <Fact figure={ratio ? `${ratio}×` : '—'} label="Days off per PTO day">
        {ratio
          ? <>{totalDaysOff} {offWord} off for {budgetSpent} PTO {ptoWord} in {breakCountActual} {breakWord}. Each PTO day buys {ratio} days off, weekends and holidays included.</>
          : <>No PTO placed yet, so there is no return to show.</>}
      </Fact>
      <Fact figure={scores ? ordinal(scores.efficiency.percentile) : '—'} label="Efficiency percentile">
        {scores ? <>Efficiency percentile (higher is better): {gloss(efficiencyLine(scores))}.</> : <>Efficiency percentile appears once the plan is solved.</>}
      </Fact>
      <Fact figure={scores ? ordinal(scores.travel.percentile) : '—'} label="Travel percentile">
        {scores ? <>Travel percentile (higher is quieter): {gloss(travelLine(scores))}.</> : <>Travel percentile appears once the plan is solved.</>}
      </Fact>
    </dl>
  );
}
