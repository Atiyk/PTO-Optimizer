import { useId, useState } from 'react';
import { formatCardDateRange, formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { Button } from './Button';

/** One candidate closure from a file, a photo or pasted text. `snippet` is shown here only,
 * so the person can check where a date came from; it is never stored or put in a link. */
export interface CandidateDates {
  id: string;
  start: string;
  end: string;
  snippet?: string;
  label?: string;
  confidence: 'likely-closure' | 'unsure';
}

interface FamilyConfirmListProps {
  heading: string;
  candidates: readonly CandidateDates[];
  /** Every date of every checked range (inclusive), sorted. */
  onAdd: (dates: string[]) => void;
  onDiscard: () => void;
}

function rangeText(start: string, end: string): string {
  return start === end ? formatShortWithYear(start) : formatCardDateRange(start, end);
}

/**
 * The import confirmation every extracted date passes through: one checkbox per range,
 * likely closures pre-checked, unsure ones not, and one "Add N checked dates" action. This
 * confirms what to import; it is not a planning submit - the plan itself updates live.
 */
export function FamilyConfirmList({ heading, candidates, onAdd, onDiscard }: FamilyConfirmListProps) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(candidates.filter((c) => c.confidence === 'likely-closure').map((c) => c.id)));
  const headingId = useId();
  const chosen = candidates.filter((c) => checked.has(c.id));
  const n = chosen.length;
  const unsure = candidates.filter((c) => c.confidence === 'unsure').length;

  return (
    <div role="group" aria-labelledby={headingId} className="mt-3 border-l-2 border-ink pl-3">
      <p id={headingId} className="text-sm font-semibold text-ink">{heading}</p>
      <p className="mt-1 text-sm text-muted">
        Check each date against the calendar you used.{unsure > 0 ? ` ${unsure} ${unsure === 1 ? 'date is' : 'dates are'} unchecked because ${unsure === 1 ? 'it' : 'they'} may not be ${unsure === 1 ? 'a day' : 'days'} without school.` : ''}
      </p>
      <ul className="mt-2 flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-1">
        {candidates.map((c) => (
          <li key={c.id}>
            <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[6px] border border-line bg-surface px-3 py-2 hover:border-line-strong">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0"
                checked={checked.has(c.id)}
                onChange={(e) => setChecked((cur) => {
                  const next = new Set(cur);
                  if (e.target.checked) next.add(c.id); else next.delete(c.id);
                  return next;
                })}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold tabular-nums text-ink">
                  {rangeText(c.start, c.end)}
                  {c.label ? <span className="font-normal text-muted"> · {c.label}</span> : null}
                  {c.confidence === 'unsure' ? <span className="ml-1.5 inline-block rounded-[6px] bg-surface-alt px-1.5 text-xs font-semibold text-ink">Unsure</span> : null}
                </span>
                {c.snippet ? <span className="mt-0.5 block break-words text-xs text-muted">“{c.snippet}”</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={n === 0} onClick={() => onAdd([...new Set(chosen.flatMap((c) => rangeISO(c.start, c.end)))].sort())}>
          Add {n} checked {n === 1 ? 'date' : 'dates'}
        </Button>
        <Button variant="quiet" size="sm" onClick={onDiscard}>Discard</Button>
      </div>
    </div>
  );
}
