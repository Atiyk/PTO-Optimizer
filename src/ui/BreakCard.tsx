import { useState, useRef, useEffect, useId } from 'react';
import { FEWER_FLYERS_LABEL, fewerFlyersThanUsual } from '../planning/travelEvidence';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import type { RequestStatus } from '../personal/requestLedger';
import { formatWorkingDaysList } from './requestText';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { isContested, type NoticeUnit } from '@daysoff/engine/calendar/requestDeadline';
import { buttonClasses } from './Button';
import { Chevron } from './Chevron';
import { settleLedgerAction } from '../integration/browserWalletStore';
import { BreakRibbon } from './BreakRibbon';
import { RequestPanel, type RequestAction } from './RequestPanel';

/** A saved record for this break's exact dates that is not (or no longer) on the calendar:
 * a saved idea, or a request canceled or declined in My PTO. Requested, planned and approved
 * breaks are shown by CommittedBreakCard instead. */
export type BreakRecordStatus = Extract<RequestStatus, 'considering' | 'canceled' | 'rejected'>;

const RECORD_LABEL: Record<BreakRecordStatus, string> = {
  considering: 'Saved',
  canceled: 'Canceled in My PTO',
  rejected: 'Declined in My PTO',
};

interface BreakCardProps {
  brk: Break;
  onSave?: RequestAction;
  /** Records the break as requested, reusing any saved record for the same dates. */
  onMarkRequested?: RequestAction;
  record?: BreakRecordStatus;
  requestDatesChanged?: boolean;
  onPlanWithPartner?: () => void;
  requestToolsReady?: boolean;
  /** Lets the compact summary above the calendar link straight to this card. */
  anchorId?: string;
  /** 1-based, chronological - the same number its calendar badge shows (see
   * useAppState's `orderedBreaks`, the one shared source for both). */
  index: number;
  highlighted?: boolean;
  isPtoDay: (iso: string) => boolean;
  onHover: (id: string | null) => void;
  /** Phase 4.2: this card's break is the single most-contested one in the whole plan. */
  isMostContested: boolean;
  /** Phase 3 step 4: one plain-language sentence on why this break is a good pick - from
   * breakReason.ts, computed in App.tsx (it needs holidayNameFor, which BreakCard doesn't
   * otherwise touch). Always present, for every card, not just the low-value ones. */
  reason: string;
  /** Names the holidays inside the break on its day ribbon. */
  holidayNameFor?: (iso: string) => string | undefined;
  today: string;
  noticePeriodDays: number;
  /** Calendar or working days; default calendar. */
  noticeUnit?: NoticeUnit;
  workWeek: WorkWeek;
  offDays?: readonly string[];
  /** Whether the request panel starts open. Every card starts closed unless told otherwise. */
  defaultExpanded?: boolean;
}

/* A break at or below 1.0x gains no extra days off; breakReason.ts says so in the card's
 * "why" line (see NOTES.md for why the planner can still choose one). */

const travelTagLabels: Partial<Record<Break['tags'][number], string>> = {
  'Peak travel': 'Busier travel estimate',
  // Shown only when fewerFlyersThanUsual agrees (>= 15% below the 2025 yearly mean).
  'Low travel demand': FEWER_FLYERS_LABEL,
  Estimated: 'Seasonal estimate',
};

export function BreakCard({
  brk,
  index,
  highlighted = false,
  isPtoDay,
  onHover,
  isMostContested,
  reason,
  holidayNameFor,
  today,
  noticePeriodDays,
  noticeUnit = 'calendar',
  workWeek,
  offDays,
  defaultExpanded = false,
  onSave,
  onMarkRequested,
  record,
  requestDatesChanged,
  onPlanWithPartner,
  requestToolsReady = true,
  anchorId,
}: BreakCardProps) {
  const [saveMessage, setSaveMessage] = useState('');
  const [savePending, setSavePending] = useState(false);
  const recordLinkRef = useRef<HTMLAnchorElement>(null);
  const focusRecordLink = useRef(false);
  useEffect(() => {
    if (focusRecordLink.current && record) {
      focusRecordLink.current = false;
      recordLinkRef.current?.focus({ preventScroll: true });
    }
  }, [saveMessage, record]);
  const save = () => {
    if (!onSave) return;
    setSavePending(true);
    void settleLedgerAction(onSave(), (result) => {
      focusRecordLink.current = result.ok;
      setSaveMessage(result.message);
      setSavePending(false);
    });
  };
  // BUG FOUND: a plain `useState(defaultExpanded)` captures its initial value once, at
  // mount, and never again - but holidays load asynchronously (see useAppState.ts), so the
  // very first render solves without them, producing a different/smaller break set than
  // the final one. Fixed by tracking only an EXPLICIT user choice locally (`userExpanded`,
  // null until they click); absent that, `expanded` mirrors the current `defaultExpanded`
  // prop every render, so it stays correct as the plan settles.
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const expanded = userExpanded ?? defaultExpanded;
  const dayWord = brk.totalDaysOff === 1 ? 'day' : 'days';
  const ptoWord = brk.ptoCost === 1 ? 'day' : 'days';
  const contested = isContested(brk);
  const startYear = brk.start.slice(0, 4);
  const breakRange = formatCardDateRange(brk.start, brk.end);
  const datedRange = brk.end.startsWith(startYear) ? `${breakRange}, ${startYear}` : breakRange;
  const panelId = useId();

  return (
    <div
      id={anchorId}
      onMouseEnter={() => onHover(brk.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(brk.id)}
      onBlur={() => onHover(null)}
      className={`grid scroll-mt-16 grid-cols-1 gap-x-3 rounded-[14px] px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)] transition-colors duration-150 ease-[var(--ease-out)] sm:gap-x-4 sm:px-4 ${
        // The hovered break gets one tone step (chrome never takes the marker; its days get
        // the stronger marker pass on the calendar at the same moment).
        highlighted ? 'bg-surface-alt' : 'bg-transparent'
      }`}
    >
      {/* The same number its calendar badge shows: one shared, chronological index. */}
      <span aria-hidden="true" className="mt-0.5 hidden h-7 min-w-7 items-center justify-center rounded-[6px] bg-accent px-1 text-sm font-bold tabular-nums text-white sm:flex">
        {index}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="text-xl font-bold leading-7 text-ink type-condensed">
          <span className="sr-only">Break {index}: </span>
          <span aria-hidden="true" className="mr-2 inline-flex h-6 min-w-6 -translate-y-0.5 items-center justify-center rounded-[6px] bg-accent px-1 align-middle text-sm font-bold tabular-nums text-white sm:hidden">{index}</span>
          {datedRange}
        </h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] tabular-nums text-ink">
          <span>
            <span className="mark font-semibold">{brk.totalDaysOff} {dayWord} off</span> for {brk.ptoCost} PTO {ptoWord}
          </span>
          {record && (
            <span data-break-record={record} className="rounded-[6px] bg-surface-alt px-2 py-0.5 text-xs font-semibold text-ink">{RECORD_LABEL[record]}</span>
          )}
          {brk.tags.filter((tag) => tag !== 'Low travel demand' || fewerFlyersThanUsual(brk.start, brk.end)).map((tag) => (
            <span key={tag} className="rounded-[6px] bg-surface-alt px-2 py-0.5 text-xs font-medium text-ink">
              {travelTagLabels[tag] ?? tag}
            </span>
          ))}
          {contested && (
            <span className="rounded-[6px] bg-surface-alt px-2 py-0.5 text-xs font-medium text-ink">Busier dates estimate</span>
          )}
        </p>

        {/* The break itself, day by day: which days are PTO and which were already off. */}
        <BreakRibbon days={brk.days} isPtoDay={isPtoDay} holidayNameFor={holidayNameFor} className="my-1.5 max-w-xl" />

        {/* Every recommendation states its own reasoning, visibly, not in a tooltip. */}
        <p className="text-sm text-muted">{reason}</p>

        {requestToolsReady && !expanded && (
          <p className="text-sm text-ink">
            <strong className="font-semibold">PTO dates to request</strong>
            <span className="block tabular-nums">{formatWorkingDaysList(brk, isPtoDay)}</span>
          </p>
        )}

        {/* Advice, not an error: the single most contested break in the plan. */}
        {contested && isMostContested && (
          <p className="text-sm text-muted">
            This break falls in a busier period in the travel model. Your employer&apos;s availability is separate.
          </p>
        )}

        {requestToolsReady && <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setUserExpanded(!expanded)} className={buttonClasses('secondary', 'md', 'min-h-11 border-accent! px-3.5! text-sm! text-accent-ink! hover:bg-accent-soft!')}>
            {expanded ? 'Hide request steps' : 'Request this time off'} <Chevron direction={expanded ? 'up' : 'down'} />
          </button>
          {onSave && !record && (
            <button type="button" disabled={savePending} onClick={save} className={buttonClasses('quiet', 'md', 'min-h-11 px-2! text-sm!')}>
              Save break
            </button>
          )}
          {record && (
            <a ref={recordLinkRef} href="#requests" className="link-mark inline-flex min-h-11 items-center text-sm">See My PTO requests</a>
          )}
        </div>}
        {saveMessage && <p role="status" className="text-sm text-muted">{saveMessage}</p>}
        {requestToolsReady && requestDatesChanged && <p className="text-sm text-muted">The PTO dates for this break have changed since you saved it. Review it in My PTO.</p>}
        <div id={panelId} hidden={!requestToolsReady || !expanded}>
          {requestToolsReady && expanded && (
            <RequestPanel
              brk={brk}
              isPtoDay={isPtoDay}
              holidayNameFor={holidayNameFor}
              today={today}
              noticePeriodDays={noticePeriodDays}
              noticeUnit={noticeUnit}
              workWeek={workWeek}
              offDays={offDays}
              onMarkRequested={onMarkRequested}
              onPlanWithPartner={onPlanWithPartner}
            />
          )}
        </div>
      </div>
    </div>
  );
}
