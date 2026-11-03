import { useId, useRef, useState, type KeyboardEvent } from 'react';

interface DateListEditorProps {
  label?: string;
  dates: string[];
  onAdd: (date: string) => void;
  onRemove: (date: string) => void;
}

/** Reusable date editor for overlap and unavailable days. Changes go straight to the
 * planner's existing callbacks; no separate submit step or hidden state is introduced. */
export function DateListEditor({ dates, onAdd, onRemove, label = 'Date to add' }: DateListEditorProps) {
  const [draft, setDraft] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const duplicate = Boolean(draft) && dates.includes(draft);
  const canAdd = Boolean(draft) && !duplicate;

  const addDate = () => {
    if (!canAdd) return;
    onAdd(draft);
    setAnnouncement('Added ' + draft + '.');
    setDraft('');
    inputRef.current?.focus();
  };

  const removeDate = (date: string) => {
    onRemove(date);
    setAnnouncement('Removed ' + date + '.');
    // Removing the focused chip would otherwise drop keyboard focus to the page.
    inputRef.current?.focus();
  };

  const onDateKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addDate();
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="date"
          aria-label={label}
          aria-describedby={duplicate ? statusId : undefined}
          aria-invalid={duplicate || undefined}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setAnnouncement('');
          }}
          onKeyDown={onDateKeyDown}
          className="h-11 min-w-0 max-w-full flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={addDate}
          className="min-h-11 shrink-0 rounded-md bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-100"
        >
          Add
        </button>
      </div>
      <p id={statusId} role="status" aria-live="polite" className={duplicate ? 'text-xs text-amber-800' : 'sr-only'}>
        {duplicate ? draft + ' is already in the list.' : announcement}
      </p>
      {dates.length > 0 && (
        <ul aria-label={label + ' selected dates'} className="flex min-w-0 flex-wrap gap-2">
          {dates.map((date) => (
            <li key={date} className="flex min-h-11 items-center gap-1 rounded-lg bg-slate-100 pl-3 pr-1 text-sm text-slate-700">
              <time dateTime={date}>{date}</time>
              <button
                type="button"
                aria-label={'Remove ' + date}
                onClick={() => removeDate(date)}
                className="flex h-11 min-w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
