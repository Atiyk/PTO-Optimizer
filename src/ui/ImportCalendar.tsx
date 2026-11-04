import { useRef, useState } from 'react';
import { parseICSBusyDays, IcsParseError, MAX_IMPORT_FILE_BYTES, type ParsedImportResult } from './icsImport';
import { monthShortName } from '@daysoff/engine/calendar/dateFormat';
import { buttonClasses } from './Button';

interface ImportCalendarProps {
  /** Reuses the same bulk handler "Block the next N days" already uses - an .ics import is
   * just another source of "Days I can't take off" dates, not a separate concept. */
  onImportBusyDays: (dates: string[]) => void;
}

type ImportState = { kind: 'idle' } | { kind: 'error'; message: string } | { kind: 'preview'; result: ParsedImportResult };

/** "Nov and Jan" (different months), or just "Nov" when every busy day falls in one month -
 * matches the spec's own example phrasing exactly. */
function summarizeMonths(dates: string[]): string {
  if (dates.length === 0) return '';
  const first = monthShortName(dates[0]);
  const last = monthShortName(dates[dates.length - 1]);
  return first === last ? first : `${first} and ${last}`;
}

/**
 * Phase 3 item 3: an .ics file upload, not a live OAuth calendar sync - sync needs a
 * backend for token exchange and Google's calendar-scope verification review, which breaks
 * the no-backend design this whole product commits to. This gets most of the real value
 * with none of that: every calendar app can export an .ics, and the parse (icsImport.ts)
 * runs entirely in the browser - confirmed live with the network tab open, zero requests
 * fire during parsing (see NOTES.md). Never silently rewrites the user's inputs: the parsed
 * result is always shown as a preview the user explicitly confirms or cancels first.
 */
export function ImportCalendar({ onImportBusyDays }: ImportCalendarProps) {
  const [state, setState] = useState<ImportState>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  const resetInput = () => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    try {
      // Check bytes before file.text(): parsing limits alone cannot bound read memory.
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setState({ kind: 'error', message: 'Calendar file is too large to import safely.' });
        return;
      }
      const text = await file.text();
      const result = parseICSBusyDays(text);
      if (result.busyDays.length === 0) {
        setState({ kind: 'error', message: 'No all-day or multi-day events found in this file.' });
        return;
      }
      setState({ kind: 'preview', result });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof IcsParseError ? err.message : 'Could not read this as a calendar (.ics) export.',
      });
    }
  };

  const confirm = () => {
    if (state.kind !== 'preview') return;
    onImportBusyDays(state.result.busyDays);
    setState({ kind: 'idle' });
    resetInput();
  };

  const cancel = () => {
    setState({ kind: 'idle' });
    resetInput();
  };

  return (
    <section>
      <h3 className="mb-2 text-[15px] font-semibold text-ink">Import my calendar (.ics)</h3>
      <p className="mb-2 text-sm text-muted">
        Parsed in your browser. Nothing is uploaded. All-day and multi-day events become days you can&apos;t take
        off; short, timed meetings are ignored. Timed events use their stated UTC or IANA time zone;
        unsupported or ambiguous time zones are rejected rather than guessed. Check the dates before adding.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        aria-label="Import calendar file (.ics)"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="block w-full max-w-full text-sm text-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-[3px] file:border file:border-solid file:border-ink file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-ink hover:file:bg-accent-soft"
      />
      {state.kind === 'error' && (
        <p role="alert" className="mt-2 text-sm font-semibold text-ink">
          {state.message}
        </p>
      )}
      {state.kind === 'preview' && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-[4px] bg-surface-alt p-3 text-sm text-ink">
          <p>
            Found {state.result.busyDays.length} busy day{state.result.busyDays.length === 1 ? '' : 's'} between{' '}
            {summarizeMonths(state.result.busyDays)} &mdash; add them?
          </p>
          {state.result.cappedAt !== null && (
            <p className="font-semibold">
              This file has more than {state.result.cappedAt} events &mdash; only the first {state.result.cappedAt} were read.
            </p>
          )}
          <details className="mt-1 rounded-[3px] border border-line bg-surface px-2">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-ink">Review individual dates</summary>
            <p className="mb-2 break-words text-sm text-muted">
              {state.result.busyDays.slice(0, 30).join(', ')}
              {state.result.busyDays.length > 30
                ? ` … and ${state.result.busyDays.length - 30} more dates; only confirm after checking your source calendar.`
                : ''}
            </p>
          </details>
          {state.result.skippedRecurring > 0 && (
            <p>
              {state.result.skippedRecurring} recurring event{state.result.skippedRecurring === 1 ? '' : 's'} skipped (not
              expanded).
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              className={buttonClasses('secondary', 'md')}
            >
              Add
            </button>
            <button
              type="button"
              onClick={cancel}
              className={buttonClasses('quiet', 'md')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
