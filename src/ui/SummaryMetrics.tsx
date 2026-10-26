import type { Scores } from '../solver/types';
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
        <div key={m.label} className="flex flex-col">
          <span className="text-lg font-semibold tabular-nums leading-tight text-slate-900">{m.value}</span>
          <span className="text-xs text-slate-500">{m.label}</span>
        </div>
      ))}
    </div>
  );
}
