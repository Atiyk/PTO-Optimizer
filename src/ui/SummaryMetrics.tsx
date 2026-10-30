import { useEffect, useRef, useState } from 'react';
import type { Scores } from '@daysoff/engine/solver/types';
import { ordinal } from './scoreFormat';

interface SummaryMetricsProps {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  scores: Scores | null;
}

interface Metric {
  label: string;
  value: string;
}

/**
 * Motion pass: "metrics count or crossfade between values rather than snapping." A full
 * numeric count-up is more motion than this warrants (and these jump discontinuously - 12
 * to 14 PTO days isn't a smooth quantity to animate through); a brief neutral background
 * pulse on the one tile whose own value actually changed is enough to carry "something just
 * updated here" without adding a colour (the accent stays reserved for suggested PTO, the
 * primary action, and focus rings) and without exceeding the 200ms ceiling. The global
 * prefers-reduced-motion rule in index.css already collapses this to instant.
 */
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

function MetricTile({ label, value }: Metric) {
  const flashing = useChangeFlash(value);
  return (
    <div className="flex flex-col">
      <span
        className={`-mx-1 w-fit rounded px-1 text-lg font-semibold tabular-nums leading-tight text-slate-900 transition-colors duration-150 ${
          flashing ? 'bg-slate-200' : 'bg-transparent'
        }`}
      >
        {value}
      </span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

/**
 * Phase 2: "a considered set... present but not dominating" - a Copilot-Money-style row of
 * labelled stat tiles, separate from Headline's plain-language sentence (which stays the
 * "answer, put first" hero per Phase 3's journey). Tabular numerals so the figures align in
 * a column when they wrap to two rows on narrow widths.
 */
export function SummaryMetrics({ budgetSpent, totalDaysOff, breakCountActual, scores }: SummaryMetricsProps) {
  const metrics: Metric[] = [
    { label: 'PTO days used', value: String(budgetSpent) },
    { label: 'Days off', value: String(totalDaysOff) },
    { label: 'Breaks', value: String(breakCountActual) },
    { label: 'Travel', value: scores ? ordinal(scores.travel.percentile) : '—' },
    { label: 'Efficiency', value: scores ? ordinal(scores.efficiency.percentile) : '—' },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-2">
      {metrics.map((m) => (
        <MetricTile key={m.label} label={m.label} value={m.value} />
      ))}
    </div>
  );
}
