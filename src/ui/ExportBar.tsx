import { useState } from 'react';
import type { Break } from '../solver/types';
import type { DayCategory } from './types';
import type { WeekStart } from './calendarMath';
import { downloadICS, type ReminderOptions } from './icsExport';
import { copyShareImage, buildShareImageMonths } from './imageExport';
import { copyText } from './requestText';
import { track } from './analytics';

interface ExportBarProps {
  breaks: Break[];
  isSuggestedPto: (iso: string) => boolean;
  categoryOf: (iso: string) => DayCategory;
  rangeStart: string;
  rangeEnd: string;
  weekStart: WeekStart;
  budgetSpent: number;
  totalDaysOff: number;
  travelPercentile: number | null;
  efficiencyPercentile: number | null;
}

export interface ActionResult {
  ok: boolean;
  /** What the button shows for 2s after the click - written by the handler that knows
   * what actually happened, never a generic guess. A button with no fallback path must
   * say so on failure rather than claiming a fallback (e.g. a download) that never
   * happened - that was a real bug here: every button shared one hardcoded "Download
   * started instead" error message, which was simply false for the two buttons (share
   * link, overlap link) that have no download fallback at all. */
  message: string;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Download .ics is the primary action - the one real "take this with you" step, the
 * others are ways to share/preview the plan. Solid/filled vs outline is the only
 * difference; both still render the same success/failure message in place of the label,
 * so the weight distinction never affects what a click actually reports back.
 */
export function ActionButton({
  label,
  onClick,
  variant = 'secondary',
  id,
}: {
  label: string;
  onClick: () => Promise<ActionResult>;
  variant?: 'primary' | 'secondary';
  id?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  return (
    <button
      type="button"
      id={id}
      disabled={working}
      onClick={async () => {
        setWorking(true);
        const result = await onClick();
        setWorking(false);
        setMessage(result.message);
        setTimeout(() => setMessage(null), 2500);
      }}
      className={
        variant === 'primary'
          ? 'rounded-md bg-slate-800 dark:bg-slate-200 px-3 py-1.5 text-sm font-semibold text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300 disabled:cursor-wait disabled:opacity-60'
          : 'rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60'
      }
    >
      {message ?? label}
    </button>
  );
}

/**
 * The free, no-sign-up export actions - moved directly beneath the result headline
 * (Phase 2 item 3), not buried below the calendar, since this is the actual payoff: take
 * the plan with you. "Share with a partner" (the overlap link) isn't one of these three -
 * it's a separate, secondary action and stays near the calendar (see App.tsx).
 */
export function ExportBar(props: ExportBarProps) {
  const siteUrl = typeof window !== 'undefined' ? window.location.host : 'pto-optimizer.app';

  // Default on, 14 days - a UI-level default; generateICS/downloadICS themselves default to
  // disabled (see icsExport.ts) so every other caller is unaffected.
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [leadDays, setLeadDays] = useState<ReminderOptions['leadDays']>(14);

  const isOutOfRange = (iso: string) => iso < props.rangeStart || iso > props.rangeEnd;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          id="shortcut-download-ics"
          label="Add to calendar (.ics)"
          variant="primary"
          onClick={async () => {
            downloadICS(props.breaks, props.isSuggestedPto, { enabled: remindersEnabled, leadDays });
            track('ICS downloaded');
            return { ok: true, message: 'Downloaded' };
          }}
        />
        <ActionButton
          label="Copy as image"
          onClick={async () => {
            const months = buildShareImageMonths(props.rangeStart, props.rangeEnd, props.weekStart, props.categoryOf);
            const ptoWord = props.budgetSpent === 1 ? 'day' : 'days';
            const offWord = props.totalDaysOff === 1 ? 'day' : 'days';
            const headline = `${props.budgetSpent} PTO ${ptoWord} → ${props.totalDaysOff} ${offWord} off`;
            const subtitleParts: string[] = [];
            if (props.travelPercentile !== null) subtitleParts.push(`Travel ${ordinal(props.travelPercentile)}`);
            if (props.efficiencyPercentile !== null) subtitleParts.push(`Efficiency ${ordinal(props.efficiencyPercentile)}`);
            const result = await copyShareImage({
              headline,
              subtitle: subtitleParts.join(' · '),
              months,
              categoryOf: props.categoryOf,
              isOutOfRange,
              siteUrl,
            });
            if (result.method === 'clipboard') {
              track('Image copied');
              return { ok: true, message: 'Image copied' };
            }
            if (result.method === 'download') {
              track('Image copied');
              return { ok: true, message: 'Downloaded instead (clipboard unavailable)' };
            }
            return { ok: false, message: "Couldn't create image — try again" };
          }}
        />
        <ActionButton
          id="shortcut-copy-link"
          label="Copy link"
          onClick={async () => {
            if (typeof window === 'undefined') return { ok: false, message: "Couldn't copy — try again" };
            const ok = await copyText(window.location.href);
            if (ok) track('URL shared');
            return ok ? { ok: true, message: 'Link copied' } : { ok: false, message: "Couldn't copy — try again" };
          }}
        />
      </div>
      <label className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <input
          type="checkbox"
          checked={remindersEnabled}
          onChange={(e) => setRemindersEnabled(e.target.checked)}
        />
        Remind me to request time off
        {remindersEnabled && (
          <>
            <select
              value={leadDays}
              onChange={(e) => setLeadDays(Number(e.target.value) as ReminderOptions['leadDays'])}
              className="rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-0.5 text-xs text-slate-600 dark:text-slate-300"
              aria-label="Reminder lead time"
            >
              <option value={7}>7 days before</option>
              <option value={14}>14 days before</option>
              <option value={30}>30 days before</option>
            </select>
            <span>&mdash; lands in the .ics file above</span>
          </>
        )}
      </label>
      <p className="text-xs text-slate-400 dark:text-slate-500">Free, no sign-up, no email.</p>
    </div>
  );
}
