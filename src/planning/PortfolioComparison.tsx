import { useEffect, useMemo, useState } from 'react';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import type { SolveInput } from '@daysoff/engine/solver/types';
import type { CanonicalPortfolioReport, PortfolioObjective } from './canonicalPortfolio';
import type { PortfolioComparisonJob } from './portfolioComparison.worker';

const LABELS: Record<PortfolioObjective, string> = {
  'most-getaways': 'More getaways',
  'longest-break': 'Longest break',
  balanced: 'Balanced',
  'constraint-fit': 'Fewer dates to review',
};

interface PortfolioComparisonProps {
  input: SolveInput;
  minimumBreakDays: number;
  calendarIncomplete: boolean;
}

export function PortfolioComparison({ input, minimumBreakDays, calendarIncomplete }: PortfolioComparisonProps) {
  const job = useMemo<PortfolioComparisonJob>(
    () => ({ input: { ...input, minimumBreakDays }, calendarIncomplete }),
    [input, minimumBreakDays, calendarIncomplete],
  );
  const [completed, setCompleted] = useState<{ job: PortfolioComparisonJob; report: CanonicalPortfolioReport | null }>();
  useEffect(() => {
    let cancelled = false;
    let worker: Worker | undefined;
    const finish = (report: CanonicalPortfolioReport | null) => {
      if (!cancelled) setCompleted({ job, report });
      worker?.terminate();
      worker = undefined;
    };
    const timer = setTimeout(() => {
      // The calendar's individual alternatives remain available when workers
      // are unavailable. A full multi-objective search can take several seconds.
      if (typeof Worker === 'undefined') { finish(null); return; }
      try {
        worker = new Worker(new URL('./portfolioComparison.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<CanonicalPortfolioReport | null>) => finish(event.data);
        worker.onerror = () => finish(null);
        worker.onmessageerror = () => finish(null);
        worker.postMessage(job);
      } catch {
        finish(null);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [job]);

  const current = completed?.job === job ? completed : undefined;
  return (
    <section aria-label="Compare recommendation goals" className="min-w-0 rounded-lg border border-line bg-surface-alt p-3 text-sm text-ink">
      <h3 className="font-semibold">Compare recommendation goals</h3>
      <p className="mt-1 text-muted">Compare separate ways to spend the same available PTO. These scenarios use calendar and policy costs.</p>
      <div aria-live="polite" aria-busy={!current}>
        {!current ? <p className="mt-2 text-muted">Finding feasible plans…</p> : current.report ? (
          <>
            {current.report.portfolios.length > 0 && (
              <ul className="m-0 mt-3 grid list-none items-start gap-2 p-0 xl:grid-cols-2">
                {current.report.portfolios.map(portfolio => (
                  <li key={portfolio.objective}>
                    <details className="rounded border border-line bg-surface px-2">
                      <summary className="min-h-11 cursor-pointer py-2">
                        <strong className="block font-semibold">{LABELS[portfolio.objective]}</strong>
                        <span className="text-muted tabular-nums">
                          {portfolio.totalCalendarDays} days off · {portfolio.ptoDays} PTO {portfolio.ptoDays === 1 ? 'day' : 'days'}
                          {' · '}{portfolio.getawayCount} {portfolio.getawayCount === 1 ? 'break' : 'breaks'}
                        </span>
                      </summary>
                      <ul className="mb-2 list-disc space-y-1 pl-5 text-muted tabular-nums">
                        {portfolio.breaks.map(brk => <li key={brk.start}>{formatCardDateRange(brk.start, brk.end)} · {brk.ptoDays} PTO {brk.ptoDays === 1 ? 'day' : 'days'}</li>)}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {current.report.shortfalls.map(issue => <p key={issue.kind} className="mt-2 text-muted">{issue.message}</p>)}
          </>
        ) : <p className="mt-2 text-muted">Plan comparison is unavailable for these settings. The calendar still shows its available alternatives.</p>}
      </div>
    </section>
  );
}
