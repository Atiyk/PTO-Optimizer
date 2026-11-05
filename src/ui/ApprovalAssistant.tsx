import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { MAX_APPROVAL_INPUT, parseApprovalMessage, type ApprovalParseResult } from '../personal/approvalParser';
import { formatOooDate, outOfOfficeMessage, returnToWorkDate } from '../personal/outOfOffice';
import type { PtoRequest, RequestCalendar, RequestStatus } from '../personal/requestLedger';
import type { RequestLedgerState } from './useRequestLedger';
import { Button, buttonClasses } from './Button';
import { Callout } from './Callout';
import { downloadOutOfOfficeICS } from './icsExport';
import { copyText } from './requestText';

const wrapButton = 'min-h-11 h-auto! whitespace-normal! py-2 text-left';

function browserLocale(): string | undefined {
  try { return typeof navigator === 'undefined' ? undefined : navigator.language || undefined; } catch { return undefined; }
}

const rangeText = (start: string, end: string) => formatCardDateRange(start, end);

/** "“Winter break” (Dec 22 – 24)" when the request has a short note, else "for Dec 22 – 24". */
export function requestLabel(request: Pick<PtoRequest, 'start' | 'end' | 'note'>): string {
  const firstLine = request.note.split('\n')[0].trim();
  const dates = rangeText(request.start, request.end);
  return firstLine && firstLine.length <= 40 ? `“${firstLine}” (${dates})` : `for ${dates}`;
}

function cautions(result: ApprovalParseResult): string[] {
  const out: string[] = [];
  if (result.notes.includes('day-month-ambiguous')) out.push('The numeric dates could be read day-first or month-first. Check them before you confirm.');
  if (result.notes.includes('day-month-from-locale')) out.push('The numeric dates were read in your browser’s date order. Check them before you confirm.');
  if (result.notes.includes('weekday-mismatch')) out.push('A weekday in the message doesn’t match its date. Check the dates before you confirm.');
  if (result.matchReason === 'overlap') out.push('These dates overlap your request but are not identical.');
  if (result.notes.includes('weak-decision')) out.push(result.decision === 'approved' ? 'The reply doesn’t say “approved” outright.' : 'The reply doesn’t say “declined” outright.');
  return out;
}

interface Confirmed { request: PtoRequest; status: Extract<RequestStatus, 'approved' | 'rejected'> }

export interface ApprovalAssistantProps {
  ledger: RequestLedgerState;
  calendar: RequestCalendar;
  today: string;
  /** Overrides the browser locale for numeric dates (tests). */
  locale?: string;
  onStatusChanged?: () => void;
}

/**
 * F4: paste a manager's reply or an HR notification; it is read live, in this browser only.
 * The pasted text lives in component state, is never stored or sent, and is cleared on
 * confirm. A value read from messy input changes nothing until the user confirms it once.
 */
export function ApprovalAssistant({ ledger, calendar, today, locale, onStatusChanged }: ApprovalAssistantProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [oooDraft, setOooDraft] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const doneRef = useRef<HTMLHeadingElement>(null);
  const effectiveLocale = locale ?? browserLocale();

  const result = useMemo(
    () => (text.trim() ? parseApprovalMessage(text, { today, requests: ledger.requests, locale: effectiveLocale }) : null),
    [text, today, ledger.requests, effectiveLocale],
  );
  const matched = result?.matchedRequestId ? ledger.requests.find((r) => r.id === result.matchedRequestId) : undefined;
  const related = result?.relatedRequestId ? ledger.requests.find((r) => r.id === result.relatedRequestId) : undefined;

  useEffect(() => { if (confirmed) doneRef.current?.focus(); }, [confirmed]);

  function confirm() {
    if (!result || !matched || result.decision === 'unclear') return;
    const status = result.decision;
    if (!ledger.updateRequest(matched.id, { status }, calendar)) return;
    setConfirmed({ request: { ...matched, status }, status });
    setOooDraft(status === 'approved' ? outOfOfficeMessage(matched, calendar) : '');
    setCopyStatus('');
    setText('');
    onStatusChanged?.();
  }

  const found = result?.dateRanges.map((r) => rangeText(r.start, r.end)).join(', ');
  const firstRange = result?.dateRanges[0];
  const decisionWord = result?.decision === 'approved' ? 'Approved' : 'Not approved';
  const evidence = result?.evidence.length ? <p className="mt-1 text-sm text-muted">Found: {result.evidence.map((e, i) => <span key={i}>{i > 0 && ', '}“<span className="text-ink">{e}</span>”</span>)}</p> : null;

  let body: ReactNode = null;
  if (result && result.decision !== 'unclear' && matched) {
    const shown = result.dateRanges.find((r) => r.start <= matched.end && r.end >= matched.start) ?? firstRange!;
    body = (
      <Callout title={`${decisionWord}: ${rangeText(shown.start, shown.end)}`}>
        <p>Matches your {matched.status} request {requestLabel(matched)}.</p>
        {evidence}
        {cautions(result).map((c) => <p key={c} className="mt-1 text-sm text-ink">{c}</p>)}
        <Button className={`mt-3 ${wrapButton}`} onClick={confirm}>{result.decision === 'approved' ? 'Mark as approved' : 'Mark as rejected'}</Button>
      </Callout>
    );
  } else if (result && result.decision !== 'unclear') {
    const title = firstRange ? `${decisionWord}: ${found}` : `${decisionWord}, but no dates found`;
    const help = result.matchReason === 'no-dates'
      ? 'Paste the whole thread, including your original request, so the dates are in it. Or set the status in the list below.'
      : result.matchReason === 'already-decided' && related
        ? `These dates match your request ${requestLabel(related)}, which is already marked ${related.status}. Change it in the list below if that’s wrong.`
        : result.matchReason === 'ambiguous'
          ? 'These dates overlap more than one of your requests. Set the right one’s status in the list below.'
          : 'None of your planned or requested dates overlap these. Track these dates below first, or check the year in the message.';
    body = <Callout tone="neutral" title={title}><p>{help}</p>{evidence}</Callout>;
  } else if (result) {
    const help = result.notes.includes('mixed-decision')
      ? 'It reads as both a yes and a no, maybe for different days. Update each request in the list below yourself.'
      : result.notes.includes('pending')
        ? 'It reads as still pending, or as a question. Wait for a clear yes or no, then paste that.'
        : 'There’s no word like “approved” or “declined” in it. Paste the reply itself, or set the status in the list below.';
    body = (
      <Callout tone="neutral" title="Couldn’t tell if this is an approval">
        <p>{help}</p>
        {found && <p className="mt-1 text-sm text-muted">Dates found: <span className="text-ink">{found}</span></p>}
        {evidence}
      </Callout>
    );
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      <label htmlFor={`${id}-paste`} className="block">
        <span className="block text-lg font-bold text-ink type-condensed">Got a reply from your manager?</span>
        <span className="block text-sm text-muted">Paste it here, or an HR system email.</span>
      </label>
      <p id={`${id}-privacy`} className="mt-1 text-xs leading-5 text-muted">Read in this browser only. The text isn’t saved or sent anywhere, and it’s cleared when you confirm.</p>
      <textarea
        id={`${id}-paste`} aria-describedby={`${id}-privacy`} rows={4} maxLength={MAX_APPROVAL_INPUT} value={text}
        spellCheck={false} autoComplete="off" placeholder="Approved, enjoy! …"
        className="mt-2 block w-full min-w-0 rounded-[6px] border border-line-strong bg-surface p-3 text-[15px] text-ink hover:border-ink"
        onChange={(event) => { setText(event.target.value); if (event.target.value.trim()) setConfirmed(null); }}
      />
      <div aria-live="polite" className="mt-3 empty:mt-0">{body}</div>
      {confirmed && (
        <div className="mt-3 min-w-0 rounded-[10px] bg-surface-alt px-4 py-3">
          <h3 ref={doneRef} tabIndex={-1} className="font-semibold text-ink focus:outline-none">
            Marked as {confirmed.status}: {rangeText(confirmed.request.start, confirmed.request.end)}
          </h3>
          {confirmed.status === 'approved' ? <>
            <p className="mt-1 text-sm text-muted">Back at work {formatOooDate(returnToWorkDate(confirmed.request.end, calendar))}. Two things worth doing now:</p>
            <button type="button" className={buttonClasses('secondary', 'md', `mt-3 ${wrapButton}`)}
              onClick={() => downloadOutOfOfficeICS({ requestId: confirmed.request.id, start: confirmed.request.start, end: confirmed.request.end, description: `Back on ${formatOooDate(returnToWorkDate(confirmed.request.end, calendar))}.` })}>
              Add out-of-office to your calendar (.ics)
            </button>
            <label htmlFor={`${id}-ooo`} className="mt-4 block text-sm font-semibold text-ink">Out-of-office message</label>
            <p id={`${id}-ooo-hint`} className="text-xs leading-5 text-muted">Edit the [bracketed] parts, then copy it into your email auto-reply.</p>
            <textarea id={`${id}-ooo`} aria-describedby={`${id}-ooo-hint`} rows={9} value={oooDraft} onChange={(event) => setOooDraft(event.target.value)}
              className="mt-2 block w-full min-w-0 rounded-[6px] border border-line-strong bg-surface p-3 text-[15px] text-ink hover:border-ink" />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={async () => setCopyStatus(await copyText(oooDraft) ? 'Copied.' : 'Copy failed. Select the text and copy it yourself.')}>Copy message</Button>
              <p role="status" className="text-sm text-muted">{copyStatus}</p>
            </div>
          </> : <p className="mt-1 text-sm text-muted">These dates no longer count against your balance forecast. Change the status below if that’s wrong.</p>}
        </div>
      )}
    </div>
  );
}
