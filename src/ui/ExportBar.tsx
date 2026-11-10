import { useState } from 'react';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
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
import { ordinal } from './scoreFormat';
import { buildPublicPlanLink, buildPublicPlanSearch, publicPlanOmissions } from './publicSharePrivacy';

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
  workWeek?: WorkWeek;
  offDays?: readonly string[];
  /** Opens the "Plan with someone" panel, where the person chooses which dates to share
   * and confirms them before any link is made (no link is copied from here). */
  onPlanWithPartner: () => void;
  /** Internal source state. Must be converted to a public scenario before sharing. */
  planSearch?: string;
  /** The checked holiday dates for this plan, when calendar coverage is known. */
  observedHolidayDates?: readonly string[];
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
  const planSearch = props.planSearch;
  const omissions = planSearch === undefined ? undefined : publicPlanOmissions(planSearch);
  const observedDates = props.observedHolidayDates && [...new Set(props.observedHolidayDates)].sort();
  const copyPlan = async (dates?: readonly string[]): Promise<ActionResult> => {
    if (typeof window === 'undefined') return { ok: false, message: "Couldn't copy — try again" };
    if (planSearch === undefined) return { ok: false, message: 'Plan link unavailable' };
    const share = buildPublicPlanLink(window.location.href, planSearch, dates);
    const ok = await copyText(share.url);
    if (ok) track('URL shared');
    return ok
      ? { ok: true, message: share.omittedPrivateCalendar ? 'Copied (calendar omitted)' : 'Link copied' }
      : { ok: false, message: "Couldn't copy — try again" };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          id="shortcut-download-ics"
          label="Add to calendar (.ics)"
          variant="primary"
          onClick={async () => {
            const reminderOptions = {
              enabled: remindersEnabled, leadDays: props.noticePeriodDays,
              workWeek: props.workWeek, offDays: props.offDays,
            };
            downloadICS(props.breaks, props.isSuggestedPto, reminderOptions);
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
          onClick={() => copyPlan()}
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
      {planSearch !== undefined && (
        <p className="text-xs text-muted">Public plan links include the scenario budget and planning controls. Employer names, blackout dates, partner availability, tracked requests and private policy settings stay in this browser. A recipient’s result may differ.</p>
      )}
      {planSearch !== undefined && observedDates !== undefined && (
        <details className="space-y-2 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">Share observed holiday dates</summary>
          <p className="max-w-prose text-muted">Include the dates checked in this plan’s holiday calendar. Anyone with the link can see those dates. Employer names and holiday labels stay private.{omissions?.settings ? ' Private scheduling and policy settings are still omitted, so the result may differ.' : ''}</p>
          <p className="max-w-prose break-words text-xs text-muted">{observedDates.length ? observedDates.join(', ') : 'No holidays are checked in this date range.'}</p>
          <ActionButton label="Copy link with holiday dates" onClick={() => copyPlan(observedDates)} />
        </details>
      )}
      {planSearch !== undefined && <SubscribeFeed planSearch={planSearch} observedHolidayDates={observedDates} />}
      {planSearch !== undefined && <EmailReminders kind="plan" search={buildPublicPlanSearch(planSearch)} />}
    </div>
  );
}
