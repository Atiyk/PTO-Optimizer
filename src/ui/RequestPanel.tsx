import { useEffect, useId, useState } from 'react';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { formatShort } from '@daysoff/engine/calendar/dateFormat';
import type { NoticeUnit } from '@daysoff/engine/calendar/requestDeadline';
import { requestDeadline } from './requestDeadlineText';
import { copyText, formatManagerEmailDetailed, formatManagerEmailShort, formatWorkingDaysList } from './requestText';
import { buttonClasses } from './Button';
import { downloadICS } from './icsExport';
import { track, trackBreakAction } from './analytics';
import { settleLedgerAction } from '../integration/browserWalletStore';
import type { RequestAction } from './requestDeadlineText';

export type { RequestAction };

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayDate = (iso: string) => `${WEEKDAY_SHORT[mondayIndexedDow(iso)]} ${formatShort(iso)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface RequestPanelProps {
  brk: Break;
  isPtoDay: (iso: string) => boolean;
  holidayNameFor?: (iso: string) => string | undefined;
  today: string;
  noticePeriodDays: number;
  noticeUnit?: NoticeUnit;
  workWeek: WorkWeek;
  offDays?: readonly string[];
  /** Records the break as requested (absent when it is already requested or can't be saved). */
  onMarkRequested?: RequestAction;
  onPlanWithPartner?: () => void;
  id?: string;
}

/**
 * One place to ask for a break: the exact workdays it costs, the date to ask by, then two
 * steps: copy a manager-ready request, and mark it requested once it has actually been sent.
 * Copying and marking stay separate on purpose: copying text is not asking, and Timebower
 * never sends anything or claims an answer. The other formats and the calendar file sit
 * behind one quiet disclosure.
 */
export function RequestPanel({ brk, isPtoDay, holidayNameFor, today, noticePeriodDays, noticeUnit = 'calendar', workWeek, offDays, onMarkRequested, onPlanWithPartner, id }: RequestPanelProps) {
  const headingId = useId();
  const [copied, setCopied] = useState<'email' | 'dates' | 'detailed' | 'failed' | null>(null);
  const [marking, setMarking] = useState(false);
  const [markMessage, setMarkMessage] = useState('');
  const [fileMessage, setFileMessage] = useState('');
  useEffect(() => {
    if (!fileMessage) return;
    const timeout = window.setTimeout(() => setFileMessage(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [fileMessage]);

  const ptoDates = brk.days.filter(isPtoDay);
  const freeDays = brk.days.filter((day) => !isPtoDay(day));
  const holidayNames = [...new Set(freeDays.map((day) => holidayNameFor?.(day)).filter((name): name is string => !!name))];
  const deadline = requestDeadline(brk.start, noticePeriodDays, workWeek, today, offDays, noticeUnit);

  const copy = async (kind: 'email' | 'dates' | 'detailed') => {
    const text = kind === 'dates' ? formatWorkingDaysList(brk, isPtoDay)
      : kind === 'detailed' ? formatManagerEmailDetailed(brk, isPtoDay, noticePeriodDays, workWeek, offDays, noticeUnit)
        : formatManagerEmailShort(brk, isPtoDay);
    const ok = await copyText(text);
    if (ok) track('request_text_copied');
    setCopied(ok ? kind : 'failed');
  };

  const mark = () => {
    if (!onMarkRequested) return;
    setMarking(true);
    void settleLedgerAction(onMarkRequested(), (result) => {
      setMarking(false);
      // On success the break moves to the requested list and this panel unmounts; the
      // message only shows when something went wrong.
      if (!result.ok) setMarkMessage(result.message);
    });
  };

  const copiedMessage = copied === 'failed'
    ? 'Copying isn’t available in this browser. Select the dates above and copy them yourself.'
    : copied === 'dates' ? 'Dates copied.'
      : copied ? 'Request copied. Paste it into an email or your HR tool.' : '';

  return (
    <section id={id} aria-labelledby={headingId} data-request-panel className="mt-1 rounded-[12px] border border-line bg-page p-4">
      <h4 id={headingId} className="text-base font-bold text-ink">
        Ask for {plural(ptoDates.length, 'workday')} off
      </h4>
      <ul aria-label="PTO days to request" className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
        {ptoDates.map((day) => (
          <li key={day} className="rounded-[6px] bg-accent px-2 py-1 text-sm font-semibold tabular-nums text-white">{weekdayDate(day)}</li>
        ))}
      </ul>
      {freeDays.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          The other {plural(freeDays.length, 'day')} {freeDays.length === 1 ? 'is' : 'are'} already off{holidayNames.length ? `: weekend and ${holidayNames.join(', ')}` : ', on the weekend'}.
        </p>
      )}
      <p data-request-deadline={deadline.date ?? ''} data-deadline-tone={deadline.tone} className="mt-3 text-[15px] text-ink">
        <strong className={`font-semibold ${deadline.tone === 'now' || deadline.tone === 'soon' ? 'mark' : ''}`}>{deadline.lead}</strong>
        <span className="text-muted">{deadline.tone === 'unknown' ? '. ' : ', '}{deadline.detail}</span>
      </p>

      <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
        <li className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted"><span aria-hidden="true">1 · </span>Send your manager a request</span>
          <button type="button" onClick={() => void copy('email')} className={buttonClasses(copied ? 'secondary' : 'primary', 'md', 'min-h-11 self-start')}>
            {copied === 'email' || copied === 'detailed' ? 'Copied ✓' : 'Copy request'}
          </button>
        </li>
        <li className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted"><span aria-hidden="true">2 · </span>Sent it? Keep track here</span>
          {onMarkRequested ? (
            <button type="button" disabled={marking} onClick={mark} className={buttonClasses(copied && copied !== 'failed' ? 'primary' : 'secondary', 'md', 'min-h-11 self-start')}>
              Mark requested
            </button>
          ) : (
            <p className="text-sm text-muted">Wait for your calendar to finish updating, then mark it.</p>
          )}
          <p className="text-sm text-muted">Only after you’ve asked. Timebower doesn’t send anything or contact your employer.</p>
        </li>
      </ol>
      <p role="status" className="mt-2 min-h-5 text-sm text-ink">{markMessage || copiedMessage}</p>

      <details className="group mt-1 border-t border-line pt-2">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink [&::-webkit-details-marker]:hidden">
          Other formats and calendar file
        </summary>
        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-1">
          <button type="button" onClick={() => void copy('dates')} className={buttonClasses('quiet', 'md', 'min-h-11 px-0! text-sm!')}>Copy just the dates</button>
          <button type="button" onClick={() => void copy('detailed')} className={buttonClasses('quiet', 'md', 'min-h-11 px-0! text-sm!')}>Copy detailed email</button>
          <button type="button" className={buttonClasses('quiet', 'md', 'min-h-11 px-0! text-sm!')} onClick={() => {
            try {
              downloadICS([brk], isPtoDay, { enabled: true, leadDays: noticePeriodDays, workWeek, offDays, noticeUnit }, `pto-break-${brk.start}.ics`);
              trackBreakAction('exported');
              track('ICS downloaded');
              setFileMessage('Calendar file downloaded. It’s a snapshot of these dates; it won’t change if your plan does.');
            } catch {
              setFileMessage('The calendar file could not be downloaded.');
            }
          }}>Download calendar file (.ics)</button>
          {onPlanWithPartner && <button type="button" onClick={onPlanWithPartner} className={buttonClasses('quiet', 'md', 'min-h-11 px-0! text-sm!')}>Plan this break with a partner</button>}
        </div>
        {fileMessage && <p role="status" className="text-sm text-muted">{fileMessage}</p>}
      </details>
    </section>
  );
}
