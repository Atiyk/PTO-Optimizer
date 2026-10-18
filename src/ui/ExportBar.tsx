import { useState } from 'react';
import type { Break } from '../solver/types';
import type { DayCategory } from './types';
import type { WeekStart } from './calendarMath';
import { downloadICS } from './icsExport';
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
  budget: number;
  budgetSpent: number;
  totalDaysOff: number;
  travelPercentile: number | null;
  efficiencyPercentile: number | null;
  buildOverlapLink: () => string;
}

interface ActionResult {
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

function ActionButton({ label, onClick }: { label: string; onClick: () => Promise<ActionResult> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  return (
    <button
      type="button"
      disabled={working}
      onClick={async () => {
        setWorking(true);
        const result = await onClick();
        setWorking(false);
        setMessage(result.message);
        setTimeout(() => setMessage(null), 2500);
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
    >
      {message ?? label}
    </button>
  );
}

export function ExportBar(props: ExportBarProps) {
  const siteUrl = typeof window !== 'undefined' ? window.location.host : 'pto-optimizer.app';

  const isOutOfRange = (iso: string) => iso < props.rangeStart || iso > props.rangeEnd;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <ActionButton
        label="Copy share link"
        onClick={async () => {
          if (typeof window === 'undefined') return { ok: false, message: "Couldn't copy — try again" };
          const ok = await copyText(window.location.href);
          if (ok) track('URL shared');
          return ok ? { ok: true, message: 'Link copied' } : { ok: false, message: "Couldn't copy — try again" };
        }}
      />
      <ActionButton
        label="Copy image"
        onClick={async () => {
          const months = buildShareImageMonths(props.rangeStart, props.rangeEnd, props.weekStart, props.categoryOf);
          const headline = `${props.budgetSpent} PTO days → ${props.totalDaysOff} days off`;
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
        label="Download .ics"
        onClick={async () => {
          downloadICS(props.breaks, props.isSuggestedPto);
          track('ICS downloaded');
          return { ok: true, message: 'Downloaded' };
        }}
      />
      <ActionButton
        label="Share my days"
        onClick={async () => {
          const ok = await copyText(props.buildOverlapLink());
          if (ok) track('URL shared');
          return ok
            ? { ok: true, message: 'Overlap link copied' }
            : { ok: false, message: "Couldn't copy — try again" };
        }}
      />
    </div>
  );
}
