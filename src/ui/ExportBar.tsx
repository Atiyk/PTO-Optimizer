import { useState } from 'react';
import type { Break } from '../solver/types';
import type { DayCategory } from './types';
import type { WeekStart } from './calendarMath';
import { downloadICS } from './icsExport';
import { copyShareImage, buildShareImageMonths } from './imageExport';
import { copyText } from './requestText';

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

type ButtonState = 'idle' | 'working' | 'done' | 'error';

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

function ActionButton({
  label,
  doneLabel,
  onClick,
}: {
  label: string;
  doneLabel: string;
  onClick: () => Promise<boolean>;
}) {
  const [state, setState] = useState<ButtonState>('idle');

  return (
    <button
      type="button"
      disabled={state === 'working'}
      onClick={async () => {
        setState('working');
        const ok = await onClick();
        setState(ok ? 'done' : 'error');
        setTimeout(() => setState('idle'), 2000);
      }}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
    >
      {state === 'done' ? doneLabel : state === 'error' ? 'Download started instead' : label}
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
        doneLabel="Link copied"
        onClick={async () => {
          if (typeof window === 'undefined') return false;
          return copyText(window.location.href);
        }}
      />
      <ActionButton
        label="Copy image"
        doneLabel="Image copied"
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
          return result.method === 'clipboard' || result.method === 'download';
        }}
      />
      <ActionButton
        label="Download .ics"
        doneLabel="Downloaded"
        onClick={async () => {
          downloadICS(props.breaks, props.isSuggestedPto);
          return true;
        }}
      />
      <ActionButton
        label="Share my days"
        doneLabel="Overlap link copied"
        onClick={async () => copyText(props.buildOverlapLink())}
      />
    </div>
  );
}
