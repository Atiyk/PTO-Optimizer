import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { isoToSerial, rangeISO } from '@daysoff/engine/solver/dateUtils';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import type { NoticeUnit } from '@daysoff/engine/calendar/requestDeadline';
import type { CommittedPlanEntry } from '../personal/workspace';
import { settleLedgerAction } from '../integration/browserWalletStore';
import { buttonClasses } from './Button';
import { scrollBehavior } from './scrollBehavior';
import { Chevron } from './Chevron';
import { BreakRibbon } from './BreakRibbon';
import { RequestPanel, type RequestAction } from './RequestPanel';

/** What each status means, said plainly. Only the person can say a request was approved. */
const STATUS: Record<string, { label: string; note: string }> = {
  planned: { label: 'Planned', note: 'Not requested yet. New breaks are planned around it and its PTO is counted once.' },
  requested: { label: 'Requested', note: 'Waiting for an answer. New breaks are planned around it and its PTO is counted once.' },
  approved: { label: 'Approved', note: 'You marked it approved. New breaks are planned around it and its PTO is counted once.' },
  completed: { label: 'Taken', note: 'Already taken. Its PTO is counted once.' },
};

/** A tracked request as a Break, so the request panel and ribbon can draw it. */
function entryAsBreak(entry: CommittedPlanEntry): Break {
  const days = rangeISO(entry.start, entry.end);
  return { id: `committed:${entry.id}`, start: entry.start, end: entry.end, days, totalDaysOff: days.length, ptoCost: entry.ptoDays, multiplier: entry.ptoDays ? days.length / entry.ptoDays : days.length, tags: [], meanDemand: 1 };
}

/**
 * A planned, requested or approved break inside the plan window. It stays in the results so
 * recording a break never makes it disappear, while the planner keeps it out of new
 * recommendations and counts its PTO once (see personal/workspace.ts). It carries the one
 * next step its status allows: ask (planned), or mark the answer (requested).
 */
export function CommittedBreakCard({ entry, message, focusLink = false, onPlanWithPartner, holidayNameFor, onMarkRequested, onMarkApproved, today, noticePeriodDays, noticeUnit, workWeek, offDays }: {
  entry: CommittedPlanEntry;
  message?: string;
  focusLink?: boolean;
  /** Same partner flow as a recommendation; shares the dates only. */
  onPlanWithPartner?: () => void;
  holidayNameFor?: (iso: string) => string | undefined;
  /** Planned → requested, once the person has asked. */
  onMarkRequested?: RequestAction;
  /** Requested → approved, once the person's employer has said yes. */
  onMarkApproved?: RequestAction;
  today?: string;
  noticePeriodDays?: number;
  noticeUnit?: NoticeUnit;
  workWeek?: WorkWeek;
  offDays?: readonly string[];
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!focusLink) return;
    const heading = headingRef.current;
    heading?.focus({ preventScroll: true });
    // The card moves when a break is recorded (it joins the recorded breaks at the top of the
    // list), so bring it into view: on a wide screen it can land a long way up the page.
    const card = heading?.closest('li');
    const box = card?.getBoundingClientRect();
    if (card && box && (box.top < 64 || box.bottom > window.innerHeight)) card.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: scrollBehavior() });
  }, [focusLink, entry.status]);
  const brk = useMemo(() => entryAsBreak(entry), [entry]);
  const ptoDates = useMemo(() => new Set(entry.ptoDates), [entry.ptoDates]);
  const startYear = entry.start.slice(0, 4);
  const range = formatCardDateRange(entry.start, entry.end);
  const datedRange = entry.end.startsWith(startYear) ? `${range}, ${startYear}` : range;
  const daysOff = isoToSerial(entry.end) - isoToSerial(entry.start) + 1;
  const cost = entry.ptoMinutes !== undefined
    ? `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(entry.ptoMinutes / 60)} hours of PTO`
    : `${entry.ptoDays} PTO ${entry.ptoDays === 1 ? 'day' : 'days'}`;
  const status = STATUS[entry.status] ?? { label: entry.status, note: '' };
  const canAsk = entry.status === 'planned' && onMarkRequested && workWeek && today !== undefined && noticePeriodDays !== undefined;

  const approve = () => {
    if (!onMarkApproved) return;
    setPending(true);
    void settleLedgerAction(onMarkApproved(), (result) => {
      setPending(false);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[14px] px-4 py-4">
      <h3 ref={headingRef} tabIndex={-1} className="text-xl font-bold leading-7 text-ink type-condensed focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
        {datedRange}<span className="sr-only">, {status.label}</span>
      </h3>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] tabular-nums text-ink">
        <span data-committed-label className={`inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-xs font-semibold ${entry.status === 'approved' || entry.status === 'completed' ? 'bg-holiday-soft text-ink' : 'bg-accent-soft text-accent-ink'}`}>
          {(entry.status === 'approved' || entry.status === 'completed') && <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
          {status.label}
        </span>
        <span><span className="font-semibold">{daysOff} {daysOff === 1 ? 'day' : 'days'} off</span> for <span>{cost}</span></span>
      </p>
      <BreakRibbon days={brk.days} isPtoDay={(day) => ptoDates.has(day)} holidayNameFor={holidayNameFor} className="my-1.5 max-w-xl" />
      <p className="text-sm text-muted">{status.note}</p>
      {(canAsk || (entry.status === 'requested' && onMarkApproved)) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {canAsk && (
            <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} className={buttonClasses('secondary', 'md', 'min-h-11 border-accent! px-3.5! text-sm! text-accent-ink! hover:bg-accent-soft!')}>
              {open ? 'Hide request steps' : 'Request this time off'} <Chevron direction={open ? 'up' : 'down'} />
            </button>
          )}
          {entry.status === 'requested' && onMarkApproved && (
            <button type="button" disabled={pending} onClick={approve} className={buttonClasses('secondary', 'md', 'min-h-11 px-3.5! text-sm!')}>
              Mark approved
            </button>
          )}
          {entry.status === 'requested' && onMarkApproved && <span className="text-sm text-muted">Only once your manager or HR tool has said yes.</span>}
        </div>
      )}
      {canAsk && (
        <div id={panelId} hidden={!open}>
          {open && <RequestPanel brk={brk} isPtoDay={(day) => ptoDates.has(day)} holidayNameFor={holidayNameFor} today={today} noticePeriodDays={noticePeriodDays}
            noticeUnit={noticeUnit} workWeek={workWeek} offDays={offDays} onMarkRequested={onMarkRequested} onPlanWithPartner={onPlanWithPartner} />}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4">
        <a href="#requests" className="link-mark inline-flex min-h-11 items-center text-sm">See My PTO requests</a>
        {onPlanWithPartner && !open && (
          <button type="button" onClick={onPlanWithPartner} className={buttonClasses('quiet', 'md', 'min-h-11 px-0! text-sm!')}>
            Plan this break with a partner
          </button>
        )}
      </div>
      {(error || message) && <p role="status" className="text-sm text-ink">{error || message}</p>}
    </div>
  );
}
