import { useState } from 'react';
import type { Break } from '@daysoff/engine/solver/types';
import type { DayCategory } from './types';
import type { WeekStart } from '@daysoff/engine/calendar/calendarMath';
import { downloadICS } from './icsExport';
import { copyShareImage, buildShareImageMonths } from './imageExport';
import { copyText } from './requestText';
import { track } from './analytics';
import { DEFAULT_SITE_HOST } from './siteUrl';
import { buttonClasses } from './Button';
import { SubscribeFeed } from './SubscribeFeed';
import { EmailReminders } from './EmailReminders';

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
  /** Phase 4: drives the .ics reminder's lead time directly - the SAME number as the
   * "Request by" date on every break card (see requestDeadline.ts), so this panel no
   * longer owns an independent 7/14/30 choice that could silently disagree with it. */
  noticePeriodDays: number;
  /** Opens the "Plan with someone" panel, where the person chooses which dates to share
   * and confirms them before any link is made (no link is copied from here). */
  onPlanWithPartner: () => void;
  /** F1: this plan's own query string (useAppState's planSearch); shows the live calendar
   * feed links when given. */
  planSearch?: string;
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
    <>
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
      className={buttonClasses(variant, 'md', 'disabled:cursor-wait')}
    >
      {message ?? label}
    </button>
    {/* The button's own text changes to the result; this announces it to screen readers. */}
    <span className="sr-only" role="status">{message ?? ''}</span>
    </>
  );
}

/**
 * The free, no-sign-up export actions, below the calendar/break list - someone shouldn't
 * be asked to download a plan they haven't looked at yet. Layout fix: all four actions
 * (.ics, copy image, copy link, share with a partner) now render in this one row - they're
 * the same kind of action and were previously split across two separate rows in two
 * different places on the page for no real reason.
 */
export function ExportBar(props: ExportBarProps) {
  const siteUrl = typeof window !== 'undefined' ? window.location.host : DEFAULT_SITE_HOST;

  // Default on - a UI-level default; generateICS/downloadICS themselves default to
  // disabled (see icsExport.ts) so every other caller is unaffected. The lead time itself
  // is no longer a local default: it's always props.noticePeriodDays (see the prop comment).
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  const isOutOfRange = (iso: string) => iso < props.rangeStart || iso > props.rangeEnd;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          id="shortcut-download-ics"
          label="Add to calendar (.ics)"
          variant="primary"
          onClick={async () => {
            downloadICS(props.breaks, props.isSuggestedPto, { enabled: remindersEnabled, leadDays: props.noticePeriodDays });
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
        <button type="button" onClick={props.onPlanWithPartner} className={buttonClasses('secondary', 'md')}>
          Plan with a partner
        </button>
      </div>
      <label className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink">
        <input
          type="checkbox"
          checked={remindersEnabled}
          onChange={(e) => setRemindersEnabled(e.target.checked)}
        />
        Remind me to request time off
        {remindersEnabled && (
          <span className="text-muted">
            &mdash; {props.noticePeriodDays} {props.noticePeriodDays === 1 ? 'day' : 'days'} before, matching your
            notice period in More options
          </span>
        )}
      </label>
      {props.planSearch !== undefined && <SubscribeFeed planSearch={props.planSearch} />}
      {props.planSearch !== undefined && <EmailReminders kind="plan" search={props.planSearch} />}
    </div>
  );
}
