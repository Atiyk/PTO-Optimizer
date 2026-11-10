import { formatDateRange } from '@daysoff/engine/calendar/dateFormat';
import { addDays } from '@daysoff/engine/solver/dateUtils';

function DateRanges({ dates }: { dates: readonly string[] }) {
  if (!dates.length) return <>None</>;
  const ranges: { start: string; end: string }[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const previous = ranges.at(-1);
    if (previous && addDays(previous.end, 1) === date) previous.end = date;
    else ranges.push({ start: date, end: date });
  }
  return <>{ranges.map(({ start, end }) => formatDateRange(start, end)).join(' · ')}</>;
}

/** An exact preview of the date-only payload, before the user copies it. */
export function ShareDatePreview({
  dates, status, freeDays, schoolDates, title = 'Preview shared dates', expanded = false,
}: {
  dates?: readonly string[];
  status?: 'proposed' | 'confirmed';
  freeDays?: readonly string[] | null;
  schoolDates?: readonly string[];
  title?: string;
  expanded?: boolean;
}) {
  return (
    <details open={expanded || undefined} className="rounded-[6px] border border-line bg-surface-alt px-3 py-2 text-sm text-ink">
      <summary className="min-h-8 cursor-pointer py-1 font-semibold">{title}</summary>
      <dl className="space-y-2 pb-1 pt-1 text-muted">
        {schoolDates && <>
          <dt className="font-semibold text-ink">School closures ({schoolDates.length})</dt>
          <dd><DateRanges dates={schoolDates} /></dd>
        </>}
        {dates && <>
          <dt className="font-semibold capitalize text-ink">{status} availability ({dates.length} dates)</dt>
          <dd><DateRanges dates={dates} /></dd>
          {freeDays === null
            ? <dd>Which dates are already off and PTO costs are undisclosed.</dd>
            : freeDays && <>
              <dt className="font-semibold text-ink">Already off ({freeDays.length})</dt>
              <dd><DateRanges dates={freeDays} /></dd>
            </>}
        </>}
      </dl>
    </details>
  );
}
