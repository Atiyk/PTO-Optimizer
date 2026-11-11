import { useId, useState } from 'react';
import { REQUEST_STATUSES, calendarCoversRequest, calendarForSavedRequest, createPtoRequest, initialRequestDate, requestCalendarCoverageHint, requestConflicts, requestPtoDates, requestPtoMinutes, validRequestRange, type PtoRequest, type RequestCalendar, type RequestStatus } from '../personal/requestLedger';
import type { RequestLedgerState } from './useRequestLedger';
import { requestDayEquivalent, scheduledMinutesOn, type WorkdaySchedule } from '../personal/workspace';
import { Button } from './Button';
import { compactDate, compactDatesIn } from './compactDate';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { DEFAULT_NOTICE_PERIOD_DAYS, submitByDate } from '../personal/outOfOffice';
import { ApprovalAssistant } from './ApprovalAssistant';
import { useTodayISO } from './useTodayISO';
import { settleLedgerAction } from '../integration/browserWalletStore';

const fieldClass = 'h-11 w-full min-w-0 rounded-[6px] border border-line-strong bg-surface px-3 text-[15px] font-normal text-ink';
const STATUS_COPY: Record<RequestStatus, { label: string; description: string }> = {
  considering: { label: 'Considering', description: 'Saved for later. This time is excluded from both balance forecasts.' },
  planned: { label: 'Planned', description: 'Dates you intend to request. Included in the tentative forecast.' },
  requested: { label: 'Requested', description: 'Sent to your employer and awaiting a decision. Included in the tentative forecast.' },
  approved: { label: 'Approved', description: 'Approved by your employer. Counted in the confirmed forecast unless your entered balance already includes it.' },
  completed: { label: 'Completed', description: 'Time you have taken. Counts in the confirmed forecast after your balance date if your entered balance has yet to account for it.' },
  canceled: { label: 'Cancelled', description: 'Withdrawn or cancelled. This time is excluded from both balance forecasts.' },
  rejected: { label: 'Rejected', description: 'Declined by your employer. This time is excluded from both balance forecasts.' },
};

const durationFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

/** Hours are the recorded unit; a partial day also shows its share of that day's shift. */
function requestCostLabel(days: number, minutes?: Readonly<Record<string, number>>, partialDay?: { request: PtoRequest; schedule: WorkdaySchedule }) {
  if (minutes === undefined) return `${days} PTO ${days === 1 ? 'day' : 'days'}`;
  const hours = Object.values(minutes).reduce((sum, duration) => sum + duration, 0) / 60;
  const label = `${durationFormat.format(hours)} PTO ${hours === 1 ? 'hour' : 'hours'}`;
  const date = partialDay?.request.partialMinutes !== undefined ? partialDay.request.start : undefined;
  if (!partialDay || !date || scheduledMinutesOn(date, partialDay.schedule) === undefined) return label;
  return `${label} · ${durationFormat.format(requestDayEquivalent(partialDay.request, date, partialDay.schedule))} day`;
}

function SubmitBy({ start, noticePeriodDays, calendar, today }: { start: string; noticePeriodDays: number; calendar: RequestCalendar; today: string }) {
  const deadline = submitByDate(start, noticePeriodDays, calendar.workWeek, calendar.offDays);
  if (!deadline) return <p className="mt-1 text-sm text-muted">Submit-by date is unavailable for this work schedule.</p>;
  const notice = `${noticePeriodDays}-day notice`;
  return deadline < today
    ? <p className="mt-1 text-sm text-ink"><strong>Submit now</strong>: the {notice} window opened {compactDate(deadline)}.</p>
    : <p className="mt-1 text-sm text-muted"><strong className="font-semibold text-ink">Submit by {compactDate(deadline)}</strong> · {notice}</p>;
}

function RequestRow({ request, ledger, calendar, calendarReady, onStatusChanged, noticePeriodDays, today }: { request: PtoRequest; ledger: RequestLedgerState; calendar: RequestCalendar; calendarReady: boolean; onStatusChanged?: () => void; noticePeriodDays: number; today: string }) {
  const id = useId();
  const [start, setStart] = useState(request.start);
  const [end, setEnd] = useState(request.end);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [savingDates, setSavingDates] = useState(false);
  const changedDates = start !== request.start || end !== request.end;
  const invalid = !validRequestRange(start, end);
  const outsideCoverage = !invalid && !calendarCoversRequest(calendar, start, end);
  const pricedCalendar = calendarForSavedRequest(request, calendar);
  const preview = changedDates && calendarReady && pricedCalendar && !invalid && !outsideCoverage
    ? createPtoRequest({ ...request, start, end }, pricedCalendar, request.id, request.updatedAt)
    : null;
  const savedCost = requestCostLabel(request.ptoDays, request.ptoMinutes, { request, schedule: { shiftMinutes: calendar.shiftMinutes } });
  return (
    <article className="min-w-0 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-ink type-condensed">{validRequestRange(request.start, request.end) ? formatCardDateRange(request.start, request.end) : `${compactDate(request.start)} – ${compactDate(request.end)}`}</h3>
        <p className="text-sm text-muted">{savedCost}</p>
      </div>
      {request.status === 'planned' && request.start >= today && validRequestRange(request.start, request.end) && <SubmitBy start={request.start} noticePeriodDays={noticePeriodDays} calendar={calendar} today={today} />}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-sm text-muted">Start date
          <input type="date" aria-label={`Start date for request ${request.start}`} className={`${fieldClass} mt-1`} value={start} min={calendar.rangeStart} max={calendar.rangeEnd} disabled={!calendarReady || !pricedCalendar || savingDates} onChange={event => setStart(event.target.value)} />
        </label>
        <label className="min-w-0 text-sm text-muted">End date
          <input type="date" aria-label={`End date for request ${request.start}`} className={`${fieldClass} mt-1`} value={end} min={calendar.rangeStart} max={calendar.rangeEnd} disabled={!calendarReady || !pricedCalendar || savingDates} onChange={event => setEnd(event.target.value)} />
        </label>
        <label className="min-w-0 text-sm text-muted">Status
          <select aria-label={`Status for request ${request.start}`} aria-describedby={`${id}-status`} className="select-ink mt-1 w-full min-w-0 text-[15px] font-normal" value={request.status} onChange={(event) => {
            void settleLedgerAction(ledger.updateRequest(request.id, { status: event.target.value as RequestStatus }, calendar), (saved) => {
              if (saved) onStatusChanged?.();
            });
          }}>
            {REQUEST_STATUSES.map((status) => <option key={status} value={status}>{STATUS_COPY[status].label}</option>)}
          </select>
        </label>
      </div>
      <p id={`${id}-status`} className="mt-2 text-xs leading-5 text-muted">{STATUS_COPY[request.status].description}</p>
      {invalid && <p role="status" className="mt-2 text-sm font-semibold text-ink">Choose valid dates in order before saving.</p>}
      {outsideCoverage && <p role="status" className="mt-2 text-sm text-muted">These dates are outside the calendar loaded on this page. The saved PTO cost is retained; load the relevant calendar before editing dates.</p>}
      {!pricedCalendar && <p className="mt-2 text-sm text-muted">Use an hourly request calendar to edit these dates and retain the hourly cost.</p>}
      {changedDates && !invalid && !outsideCoverage && pricedCalendar && calendarReady && !preview && (
        <p role="status" className="mt-2 text-sm text-ink">The new dates do not fit the saved request duration or your current work shifts.</p>
      )}
      {changedDates && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {preview && <p role="status" className="basis-full text-sm text-muted">With your current calendar, these dates use {requestCostLabel(preview.ptoDays, preview.ptoMinutes)}. Saved cost is {savedCost}.</p>}
          <Button variant="secondary" size="sm" className="min-h-11" disabled={!preview || savingDates} onClick={() => {
            if (!preview) return;
            setSavingDates(true);
            void settleLedgerAction(ledger.updateRequest(request.id, { start, end }, calendar, request.updatedAt), () => setSavingDates(false));
          }}>Save dates</Button>
          <Button variant="quiet" size="sm" className="min-h-11" disabled={savingDates} onClick={() => { setStart(request.start); setEnd(request.end); }}>Discard date edits</Button>
        </div>
      )}
      <details className="mt-3 text-sm">
        <summary className="flex min-h-11 w-fit cursor-pointer items-center font-medium text-ink">Personal note</summary>
        <label htmlFor={id} className="sr-only">Personal note for request {request.start}</label>
        <textarea id={id} rows={2} maxLength={1000} value={noteDraft ?? request.note} className="mt-1 w-full rounded-[6px] border border-line-strong bg-surface p-3 text-ink" placeholder="Optional. Stored in this browser, never added to a share link." onChange={(event) => {
          const note = event.target.value;
          setNoteDraft(note);
          void settleLedgerAction(ledger.updateRequest(request.id, { note }, calendar), () => {
            setNoteDraft((draft) => draft === note ? null : draft);
          });
        }} />
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
  forecastSummary?: string;
  remainingPto?: number;
  today?: string;
  /** The planner's notice period (/pto). /policy has none, so the submit-by date uses the 14-day default there. */
  noticePeriodDays?: number;
  onTrackingStarted?: () => void;
  onStatusChanged?: () => void;
}

export function PtoTracker({ ledger, calendar, calendarReady = true, calendarNotice, forecastSummary, remainingPto, today, noticePeriodDays = DEFAULT_NOTICE_PERIOD_DAYS, onTrackingStarted, onStatusChanged }: PtoTrackerProps) {
  const id = useId();
  const effectiveToday = useTodayISO(today);
  const [start, setStart] = useState(() => initialRequestDate(effectiveToday, calendar));
  const [end, setEnd] = useState(() => initialRequestDate(effectiveToday, calendar));
  const [showPast, setShowPast] = useState(false);
  const [partialHours, setPartialHours] = useState('');
  const [tracking, setTracking] = useState(false);
  const validRange = validRequestRange(start, end);
  const coveredRange = validRange && calendarCoversRequest(calendar, start, end);
  const hourly = calendar.shiftMinutes !== undefined;
  const canEnterPartial = hourly && coveredRange && start === end && requestPtoDates(start, end, calendar).length === 1;
  const partialMinutes = canEnterPartial && partialHours !== '' ? Math.round(Number(partialHours) * 60) : undefined;
  const pricedMinutes = hourly ? requestPtoMinutes(start, end, calendar, partialMinutes) : undefined;
  const canTrack = calendarReady && coveredRange && pricedMinutes !== null;
  const coverageHint = requestCalendarCoverageHint(calendar);
  const upcoming = ledger.requests.filter((request) => request.end >= effectiveToday);
  const visible = (showPast ? ledger.requests : upcoming).slice().sort((a, b) => a.start.localeCompare(b.start));
  const counts = [
    { label: 'Considering', count: upcoming.filter((r) => r.status === 'considering').length },
    { label: 'Planned', count: upcoming.filter((r) => r.status === 'planned').length },
    { label: 'Requested', count: upcoming.filter((r) => r.status === 'requested').length },
    { label: 'Approved upcoming', count: upcoming.filter((r) => r.status === 'approved').length },
    { label: 'Completed', count: ledger.requests.filter((r) => r.status === 'completed').length },
    { label: 'Cancelled', count: ledger.requests.filter((r) => r.status === 'canceled').length },
  ];
  const conflicts = requestConflicts(ledger.requests);
  return (
    <section id="my-pto-requests" aria-labelledby={`${id}-heading`} className="min-w-0 rounded-[10px] border border-line bg-surface p-5 sm:p-6">
      <h2 id={`${id}-heading`} className="text-h2 font-bold text-ink type-condensed">My PTO requests</h2>
      <p className="mt-1 text-sm leading-6 text-muted">Save breaks you’re considering and record what your employer approves. Update each status yourself as your plans change.</p>
      {coverageHint && <p className="mt-3 text-sm leading-6 text-muted">{compactDatesIn(coverageHint)}</p>}
      {calendarNotice && <p className="mt-2 text-sm leading-6 text-muted">{compactDatesIn(calendarNotice)}</p>}
      {!calendarReady && <p role="status" className="mt-3 border-l-2 border-ink pl-3 text-sm text-ink">Holiday data is loading or unavailable. New requests and date edits are paused until the calendar is ready. You can still update statuses and notes or delete requests.</p>}
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {counts.map(({ label, count }) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-[1.75rem] leading-8 tabular-nums text-ink type-display">{count}</dd></div>)}
      </dl>
      {forecastSummary && <p className="mt-4 text-sm text-muted">{forecastSummary}</p>}
      {remainingPto !== undefined && <p className="mt-4 text-sm text-muted">Unallocated PTO in the current optimizer plan: <strong className="text-ink">{remainingPto} days</strong>. Check the balance forecast for approved and tentative requests.</p>}
      <ApprovalAssistant ledger={ledger} calendar={calendar} today={effectiveToday} onStatusChanged={onStatusChanged} />
      <details className="mt-5 border-y border-line">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">Track another date range</summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-sm text-muted">Start date<input className={`${fieldClass} mt-1`} type="date" value={start} min={calendar.rangeStart} max={calendar.rangeEnd} disabled={!calendarReady} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="min-w-0 text-sm text-muted">End date<input className={`${fieldClass} mt-1`} type="date" value={end} min={calendar.rangeStart} max={calendar.rangeEnd} disabled={!calendarReady} onChange={(event) => setEnd(event.target.value)} /></label>
          {canEnterPartial && (
            <label className="min-w-0 text-sm text-muted">Hours of partial-day PTO (optional)
              <input className={`${fieldClass} mt-1`} type="number" min={1 / 60} max={24} step="any"
                value={partialHours} placeholder="Full shift" disabled={!calendarReady}
                onChange={event => setPartialHours(event.target.value)} />
            </label>
          )}
        </div>
        <p className="mt-3 text-sm text-muted">{!calendarReady ? 'PTO cost will be available when the employer calendar is ready.' : !validRange ? 'Choose valid dates in order, spanning no more than three years.' : !coveredRange ? 'These dates are outside the loaded employer calendar. Extend the planning range or choose covered dates.' : pricedMinutes === null ? 'Enter hours that fit the configured work shifts.' : `${requestCostLabel(requestPtoDates(start, end, calendar).length, pricedMinutes)} using your current workweek and employer holiday calendar.`}</p>
        <Button variant="secondary" className="mb-3 mt-3" disabled={!canTrack || tracking} onClick={() => {
          if (!canTrack) return;
          setTracking(true);
          void settleLedgerAction(ledger.addRequest({ start, end, partialMinutes }, calendar), (result) => {
            setTracking(false);
            if (!result.ok) return;
            setPartialHours('');
            onTrackingStarted?.();
          });
        }}>Track these dates</Button>
      </details>
      {ledger.message && <p role="status" className="mt-4 text-sm text-muted">{compactDatesIn(ledger.message)}</p>}
      {!ledger.storageAvailable && <p role="status" className="mt-4 border-l-2 border-ink pl-3 text-sm text-ink">Browser storage is unavailable. Your tracker works for this visit, but changes may disappear when you leave.</p>}
      {conflicts.length > 0 && <p className="mt-4 flex gap-2 border-l-2 border-ink pl-3 text-sm text-ink">Some request dates overlap. They are flagged here and deducted only once in the balance forecast. Review the dates before requesting leave.</p>}
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{showPast ? 'All tracked requests' : 'Upcoming requests'}</p>
        <label className="flex min-h-11 items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showPast} onChange={(event) => setShowPast(event.target.checked)} />Include past requests</label>
      </div>
      <div className="mt-3 space-y-3">
        {visible.length === 0 ? <p className="text-sm leading-6 text-muted">No {showPast ? '' : 'upcoming '}time off saved. Save a recommended break from the planner or add dates above.</p>
          : visible.map((request) => <RequestRow key={`${request.id}:${request.start}:${request.end}`} request={request} ledger={ledger} calendar={calendar} calendarReady={calendarReady} onStatusChanged={onStatusChanged} noticePeriodDays={noticePeriodDays} today={effectiveToday} />)}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">Saved in this browser. Notes and statuses stay private. You can review the updated PTO cost before saving date edits.</p>
    </section>
  );
}
