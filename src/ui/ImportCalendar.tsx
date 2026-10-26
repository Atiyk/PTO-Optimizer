import { useRef, useState } from 'react';
import { parseICSBusyDays, IcsParseError, type ParsedImportResult } from './icsImport';
import { monthShortName } from './dateFormat';

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
      <h4 className="mb-2 text-sm font-semibold text-slate-700">Import my calendar (.ics)</h4>
      <p className="mb-2 text-xs text-slate-400">
        Parsed in your browser. Nothing is uploaded. All-day and multi-day events become days you can&apos;t take
        off; short, timed meetings are ignored.
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
        className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      {state.kind === 'error' && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.message}
        </p>
      )}
      {state.kind === 'preview' && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <p>
            Found {state.result.busyDays.length} busy day{state.result.busyDays.length === 1 ? '' : 's'} between{' '}
            {summarizeMonths(state.result.busyDays)} &mdash; add them?
          </p>
          {state.result.cappedAt !== null && (
            <p className="text-amber-600">
              This file has more than {state.result.cappedAt} events &mdash; only the first {state.result.cappedAt} were read.
            </p>
          )}
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
              className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
            >
              Add
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
