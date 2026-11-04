import { useId, useState } from 'react';
import { REQUEST_STATUSES, calendarCoversRequest, initialRequestDate, requestCalendarCoverageHint, requestConflicts, requestPtoDates, validRequestRange, type PtoRequest, type RequestCalendar, type RequestStatus } from '../personal/requestLedger';
import type { RequestLedgerState } from './useRequestLedger';
import { Button } from './Button';
import { compactDate, compactDatesIn } from './compactDate';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';

const fieldClass = 'h-11 w-full min-w-0 rounded-[3px] border border-line-strong bg-surface px-3 text-[15px] font-normal text-ink';
const statusLabel = (status: RequestStatus) => status[0].toUpperCase() + status.slice(1);

function RequestRow({ request, ledger, calendar, calendarReady, onStatusChanged }: { request: PtoRequest; ledger: RequestLedgerState; calendar: RequestCalendar; calendarReady: boolean; onStatusChanged?: () => void }) {
  const id = useId();
  const [start, setStart] = useState(request.start);
  const [end, setEnd] = useState(request.end);
  const invalid = !validRequestRange(start, end);
  const outsideCoverage = !invalid && !calendarCoversRequest(calendar, start, end);
  return (
    <article className="min-w-0 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-ink type-condensed">{validRequestRange(request.start, request.end) ? formatCardDateRange(request.start, request.end) : `${compactDate(request.start)} – ${compactDate(request.end)}`}</h3>
        <p className="text-sm text-muted">{request.ptoDays} PTO {request.ptoDays === 1 ? 'day' : 'days'}</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-sm text-muted">Start date
          <input type="date" aria-label={`Start date for request ${request.start}`} className={`${fieldClass} mt-1`} value={start} min={calendar.rangeStart} max={calendar.rangeEnd} disabled={!calendarReady} onChange={(event) => {
            if (!calendarReady) return;
            const date = event.target.value; setStart(date);
            if (calendarCoversRequest(calendar, date, end)) ledger.updateRequest(request.id, { start: date, end }, calendar);
          }} />
        </label>
        <label className="min-w-0 text-sm text-muted">End date
          <input type="date" aria-label={`End date for request ${request.start}`} className={`${fieldClass} mt-1`} value={end} min={calendar.rangeStart} max={calendar.rangeEnd} disabled={!calendarReady} onChange={(event) => {
            if (!calendarReady) return;
            const date = event.target.value; setEnd(date);
            if (calendarCoversRequest(calendar, start, date)) ledger.updateRequest(request.id, { start, end: date }, calendar);
          }} />
        </label>
        <label className="min-w-0 text-sm text-muted">Status
          <select aria-label={`Status for request ${request.start}`} className="select-ink mt-1 w-full min-w-0 text-[15px] font-normal" value={request.status} onChange={(event) => {
            if (ledger.updateRequest(request.id, { status: event.target.value as RequestStatus }, calendar)) onStatusChanged?.();
          }}>
            {REQUEST_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </label>
      </div>
      {invalid && <p role="status" className="mt-2 text-sm font-semibold text-ink">Choose valid dates in order. Your saved request is unchanged until both dates are valid.</p>}
      {outsideCoverage && <p role="status" className="mt-2 text-sm text-muted">These dates are outside the calendar loaded on this page. The saved PTO cost is retained; load the relevant calendar before editing dates.</p>}
      <details className="mt-3 text-sm">
        <summary className="flex min-h-11 w-fit cursor-pointer items-center font-medium text-ink">Personal note</summary>
        <label htmlFor={id} className="sr-only">Personal note for request {request.start}</label>
        <textarea id={id} rows={2} maxLength={1000} value={request.note} className="mt-1 w-full rounded-[3px] border border-line-strong bg-surface p-3 text-ink" placeholder="Optional. Stored in this browser, never added to a share link." onChange={(event) => ledger.updateRequest(request.id, { note: event.target.value }, calendar)} />
      </details>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Updated {compactDate(request.updatedAt.slice(0, 10))}</p>
        <Button variant="quiet" size="sm" onClick={() => ledger.deleteRequest(request.id)} aria-label={`Delete request ${request.start}`}>Delete request</Button>
      </div>
    </article>
  );
}

export interface PtoTrackerProps {
  ledger: RequestLedgerState;
  calendar: RequestCalendar;
  calendarReady?: boolean;
  calendarNotice?: string;
  remainingPto?: number;
  today?: string;
  onTrackingStarted?: () => void;
  onStatusChanged?: () => void;
}

export function PtoTracker({ ledger, calendar, calendarReady = true, calendarNotice, remainingPto, today, onTrackingStarted, onStatusChanged }: PtoTrackerProps) {
  const id = useId();
  const [visitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const effectiveToday = today ?? visitDate;
  const [start, setStart] = useState(() => initialRequestDate(effectiveToday, calendar));
  const [end, setEnd] = useState(() => initialRequestDate(effectiveToday, calendar));
  const [showPast, setShowPast] = useState(false);
  const validRange = validRequestRange(start, end);
  const coveredRange = validRange && calendarCoversRequest(calendar, start, end);
  const coverageHint = requestCalendarCoverageHint(calendar);
  const upcoming = ledger.requests.filter((request) => request.end >= effectiveToday);
  const visible = (showPast ? ledger.requests : upcoming).slice().sort((a, b) => a.start.localeCompare(b.start));
  const counts = [
    { label: 'Planned', count: upcoming.filter((r) => r.status === 'planned').length },
    { label: 'Awaiting approval', count: upcoming.filter((r) => r.status === 'requested').length },
    { label: 'Approved upcoming', count: upcoming.filter((r) => r.status === 'approved').length },
    { label: 'Completed', count: ledger.requests.filter((r) => r.status === 'completed').length },
  ];
  const conflicts = requestConflicts(ledger.requests);
  return (
    <section id="my-pto-requests" aria-labelledby={`${id}-heading`} className="min-w-0 rounded-[4px] border border-line bg-surface p-5 sm:p-6">
      <h2 id={`${id}-heading`} className="text-h2 font-bold text-ink type-condensed">My PTO requests</h2>
      <p className="mt-1 text-sm leading-6 text-muted">A personal tracker. You update each status yourself; Gapless does not send requests to your employer or confirm approval.</p>
      {coverageHint && <p className="mt-3 text-sm leading-6 text-muted">{compactDatesIn(coverageHint)}</p>}
      {calendarNotice && <p className="mt-2 text-sm leading-6 text-muted">{compactDatesIn(calendarNotice)}</p>}
      {!calendarReady && <p role="status" className="mt-3 border-l-2 border-ink pl-3 text-sm text-ink">Holiday data is loading or unavailable. New requests and date edits are paused until the calendar is ready. You can still update statuses and notes or delete requests.</p>}
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {counts.map(({ label, count }) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-[1.75rem] leading-8 tabular-nums text-ink type-display">{count}</dd></div>)}
      </dl>
      {remainingPto !== undefined && <p className="mt-4 text-sm text-muted">Unallocated PTO in the current optimizer plan: <strong className="text-ink">{remainingPto} days</strong>. Check the balance forecast for approved and tentative requests.</p>}
      <details className="mt-5 border-y border-line">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">Track another date range</summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm text-muted">Start date<input className={`${fieldClass} mt-1`} type="date" value={start} min={calendar.rangeStart} max={calendar.rangeEnd} disabled={!calendarReady} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="min-w-0 text-sm text-muted">End date<input className={`${fieldClass} mt-1`} type="date" value={end} min={calendar.rangeStart} max={calendar.rangeEnd} disabled={!calendarReady} onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
        <p className="mt-3 text-sm text-muted">{!calendarReady ? 'PTO cost will be available when the employer calendar is ready.' : !validRange ? 'Choose valid dates in order, spanning no more than three years.' : !coveredRange ? 'These dates are outside the loaded employer calendar. Extend the planning range or choose covered dates.' : `${requestPtoDates(start, end, calendar).length} PTO days using your current workweek and employer holiday calendar.`}</p>
        <Button variant="secondary" className="mb-3 mt-3" disabled={!calendarReady || !coveredRange} onClick={() => { if (calendarReady && coveredRange && ledger.addRequest({ start, end }, calendar).ok) onTrackingStarted?.(); }}>Track these dates</Button>
      </details>
      {ledger.message && <p role="status" className="mt-4 text-sm text-muted">{compactDatesIn(ledger.message)}</p>}
      {!ledger.storageAvailable && <p role="status" className="mt-4 border-l-2 border-ink pl-3 text-sm text-ink">Browser storage is unavailable. Your tracker works for this visit, but changes may disappear when you leave.</p>}
      {conflicts.length > 0 && <p className="mt-4 flex gap-2 border-l-2 border-ink pl-3 text-sm text-ink">Some request dates overlap. They are flagged here and deducted only once in the balance forecast. Review the dates before requesting leave.</p>}
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{showPast ? 'All tracked requests' : 'Upcoming requests'}</p>
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showPast} onChange={(event) => setShowPast(event.target.checked)} />Include past requests</label>
      </div>
      <div className="mt-3 space-y-3">
        {visible.length === 0 ? <p className="text-sm leading-6 text-muted">No {showPast ? '' : 'upcoming '}requests tracked. Choose “Track this PTO request” on a recommended break, or add dates above.</p>
          : visible.map((request) => <RequestRow key={`${request.id}:${request.start}:${request.end}`} request={request} ledger={ledger} calendar={calendar} calendarReady={calendarReady} onStatusChanged={onStatusChanged} />)}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">Saved only in this browser. Notes and statuses stay out of plan links. PTO cost is saved when you add a request; editing its dates recalculates it using your current calendar.</p>
    </section>
  );
}
