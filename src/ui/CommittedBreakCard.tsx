import { useEffect, useRef } from 'react';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import type { CommittedPlanEntry } from '../personal/workspace';
import { buttonClasses } from './Button';

const STATUS_LABEL: Record<string, string> = {
  planned: 'Tracked · planned',
  requested: 'Tracked · requested',
  approved: 'Approved',
  completed: 'Completed',
};

/**
 * A tracked or approved request inside the plan window. It stays in the results so
 * tracking a break never makes it disappear, while the planner keeps it out of new
 * recommendations and counts its PTO once (see personal/workspace.ts).
 */
export function CommittedBreakCard({ entry, message, focusLink = false, onPlanWithPartner }: {
  entry: CommittedPlanEntry;
  message?: string;
  focusLink?: boolean;
  /** Same partner flow as a recommendation; shares the dates only. */
  onPlanWithPartner?: () => void;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (focusLink) linkRef.current?.focus({ preventScroll: true });
  }, [focusLink]);
  const startYear = entry.start.slice(0, 4);
  const range = formatCardDateRange(entry.start, entry.end);
  const datedRange = entry.end.startsWith(startYear) ? `${range}, ${startYear}` : range;
  const daysOff = isoToSerial(entry.end) - isoToSerial(entry.start) + 1;
  const cost = entry.ptoMinutes !== undefined
    ? `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(entry.ptoMinutes / 60)} hours of PTO`
    : `${entry.ptoDays} PTO ${entry.ptoDays === 1 ? 'day' : 'days'}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] px-3 py-4 sm:px-4">
      <h3 className="text-xl font-bold leading-7 text-ink type-condensed">{datedRange}</h3>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] tabular-nums text-ink">
        <span className="rounded-[6px] bg-surface-alt px-2 py-0.5 text-xs font-semibold text-ink">{STATUS_LABEL[entry.status] ?? entry.status}</span>
        <span><span className="font-semibold">{daysOff} {daysOff === 1 ? 'day' : 'days'} off</span> for <span>{cost}</span></span>
      </p>
      <p className="text-sm text-muted">
        {entry.role === 'tentative' ? 'Tentative until approved. ' : ''}
        Already in your time off, so new breaks are planned around it and its PTO is counted once.
      </p>
      <p className="flex min-h-11 flex-wrap items-center gap-x-2 text-sm text-ink">
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>
        <span className="font-semibold">Tracked</span>
        <a ref={linkRef} href="#requests" className="link-mark inline-flex min-h-11 items-center">See My PTO requests</a>
      </p>
      {onPlanWithPartner && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onPlanWithPartner} className={buttonClasses('quiet', 'md', 'min-h-11 px-2! text-sm!')}>
            Plan this break with a partner
          </button>
        </div>
      )}
      {message && <p role="status" className="text-sm text-muted">{message}</p>}
    </div>
  );
}
