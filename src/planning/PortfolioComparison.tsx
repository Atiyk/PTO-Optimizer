import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCardDateRange, formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import type { SolveInput } from '@daysoff/engine/solver/types';
import type { CanonicalPortfolioReport, PortfolioObjective } from './canonicalPortfolio';
import type { PortfolioComparisonJob, PortfolioComparisonResult } from './portfolioComparison.worker';
import type { PortfolioSuggestion } from './portfolioSuggestions';

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
  /** False for unlimited PTO, so no different day count is suggested. */
  allowBudgetChange?: boolean;
  /** Suggestion actions. They change the same live, URL-backed inputs as the controls. */
  onAddPto?: (extraDays: number) => void;
  onExtendEnd?: (rangeEnd: string) => void;
}

function suggestionLabel(suggestion: PortfolioSuggestion): string {
  return suggestion.kind === 'add-pto'
    ? `Add ${suggestion.extraDays} PTO ${suggestion.extraDays === 1 ? 'day' : 'days'}`
    : `End on ${formatShortWithYear(suggestion.rangeEnd)}`;
}

function suggestionResult(suggestion: PortfolioSuggestion): string {
  return `· ${suggestion.portfolioCount} ${suggestion.portfolioCount === 1 ? 'plan' : 'plans'}`;
}

export function PortfolioComparison({ input, minimumBreakDays, calendarIncomplete, allowBudgetChange = true, onAddPto, onExtendEnd }: PortfolioComparisonProps) {
  const job = useMemo<PortfolioComparisonJob>(
    () => ({ input: { ...input, minimumBreakDays }, calendarIncomplete, allowBudgetChange }),
    [input, minimumBreakDays, calendarIncomplete, allowBudgetChange],
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [completed, setCompleted] = useState<{ job: PortfolioComparisonJob; report: CanonicalPortfolioReport | null; suggestions?: PortfolioSuggestion[] }>();
  useEffect(() => {
    let cancelled = false;
    let worker: Worker | undefined;
    const finish = (report: CanonicalPortfolioReport | null, suggestions: PortfolioSuggestion[] | undefined = []) => {
      if (!cancelled) setCompleted({ job, report, suggestions });
      // The first message carries the plans; keep the worker for its verified suggestions.
      if (suggestions === undefined && report) return;
      worker?.terminate();
      worker = undefined;
    };
    const timer = setTimeout(() => {
      // The calendar's individual alternatives remain available when workers
      // are unavailable. A full multi-objective search can take several seconds.
      if (typeof Worker === 'undefined') { finish(null); return; }
      try {
        worker = new Worker(new URL('./portfolioComparison.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<PortfolioComparisonResult>) => finish(event.data?.report ?? null, event.data?.suggestions);
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
  const suggestions = (current?.suggestions ?? []).filter(s => s.kind === 'add-pto' ? onAddPto : onExtendEnd);
  const apply = (suggestion: PortfolioSuggestion) => {
    if (suggestion.kind === 'add-pto') onAddPto?.(suggestion.extraDays);
    else onExtendEnd?.(suggestion.rangeEnd);
    // The clicked button is replaced by the new result; keep keyboard focus in this panel.
    headingRef.current?.focus();
  };
  return (
    <section aria-label="Compare recommendation goals" className="min-w-0 rounded-lg border border-line bg-surface-alt p-3 text-sm text-ink">
      <h3 ref={headingRef} tabIndex={-1} className="font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Compare recommendation goals</h3>
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
            {suggestions.length > 0 && (
              <div className="mt-3 border-t border-line pt-2">
                <p className="text-muted">To compare more plans, try one of these. Each was checked with your other settings.</p>
                <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-5 p-0">
                  {suggestions.map(suggestion => (
                    <li key={suggestion.kind} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <button type="button" className="link-mark min-h-11 font-semibold" onClick={() => apply(suggestion)}>{suggestionLabel(suggestion)}</button>
                      <span className="text-muted tabular-nums">{suggestionResult(suggestion)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : <p className="mt-2 text-muted">Plan comparison is unavailable for these settings. The calendar still shows its available alternatives.</p>}
      </div>
    </section>
  );
}
