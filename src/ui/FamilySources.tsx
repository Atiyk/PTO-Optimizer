import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { SCHOOL_DISTRICT_PRESETS, SCHOOL_PRESETS_AS_OF, type SchoolDistrictPreset } from '../content/schoolDistricts';
import { extractSchoolDates } from '../personal/schoolDateText';
import { IcsParseError, MAX_IMPORT_CHARS, MAX_IMPORT_FILE_BYTES, parseICSBusyDays } from './icsImport';
import { FamilyConfirmList, type CandidateDates } from './FamilyConfirmList';
import { DateListEditor } from './DateListEditor';
import { Button } from './Button';
import { copyText } from './requestText';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';
const FIELD = `h-11 w-full min-w-0 rounded-[3px] border border-line-strong bg-surface px-3 text-base text-ink ${FOCUS}`;
const FILE_INPUT = 'block w-full max-w-full text-sm text-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-[3px] file:border file:border-solid file:border-ink file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-ink hover:file:bg-surface-alt';

/** Consecutive dates as ranges, for showing an .ics import in the confirm list. */
function datesToRuns(dates: readonly string[]): { start: string; end: string }[] {
  const sorted = [...new Set(dates)].sort();
  const runs: { start: string; end: string }[] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && addDays(last.end, 1) === d) last.end = d;
    else runs.push({ start: d, end: d });
  }
  return runs;
}

function Disclosure({ title, hint, children, defaultOpen = false }: { title: string; hint: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group border-b border-line" open={defaultOpen || undefined}>
      <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          <span className="block text-sm text-muted">{hint}</span>
        </span>
        <span aria-hidden="true" className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border border-ink group-open:bg-ink">
          <span className="absolute h-[1.5px] w-2.5 bg-ink group-open:bg-white" />
          <span className="absolute h-2.5 w-[1.5px] bg-ink group-open:hidden" />
        </span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------------------
// District presets

function presetMatches(p: SchoolDistrictPreset, q: string): boolean {
  if (!q) return true;
  const hay = `${p.district} ${p.shortName} ${p.city} ${p.state} ${p.schoolYear}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export function DistrictPicker({ districtId, onChange }: { districtId?: string; onChange: (id: string | undefined) => void }) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const listId = useId();
  const selected = SCHOOL_DISTRICT_PRESETS.find((p) => p.id === districtId);
  // The chosen preset stays at the top of the list so it is visible without scrolling.
  const matches = useMemo(
    () => SCHOOL_DISTRICT_PRESETS.filter((p) => presetMatches(p, query.trim())).sort((a, b) => Number(b.id === districtId) - Number(a.id === districtId)),
    [query, districtId],
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={searchId} className="block text-sm font-semibold text-ink">School district</label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by district, city or state"
        aria-controls={listId}
        autoComplete="off"
        className={FIELD}
      />
      <fieldset className="min-w-0">
        <legend className="text-xs text-muted">{query.trim() ? `${matches.length} of ${SCHOOL_DISTRICT_PRESETS.length} presets match` : `${SCHOOL_DISTRICT_PRESETS.length} district presets: search or scroll`}</legend>
        <ul id={listId} className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
          <li>
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[3px] px-2 text-sm text-ink hover:bg-surface-alt">
              <input type="radio" name="family-district" checked={!selected} onChange={() => onChange(undefined)} />
              No preset: I&apos;ll add my school&apos;s dates
            </label>
          </li>
          {matches.map((p) => (
            <li key={p.id}>
              <label className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-sm text-ink hover:bg-surface-alt ${p.id === districtId ? 'bg-surface-alt' : ''}`}>
                <input type="radio" name="family-district" checked={p.id === districtId} onChange={() => onChange(p.id)} />
                <span className="min-w-0">
                  <span className="block font-semibold">{p.shortName}</span>
                  <span className="block text-xs text-muted">{p.city}, {p.state} · {p.schoolYear}</span>
                </span>
              </label>
            </li>
          ))}
          {matches.length === 0 && <li className="px-2 py-2 text-sm text-muted">No preset matches “{query}”. Add your school&apos;s dates below instead.</li>}
        </ul>
      </fieldset>
      {selected && (
        <div className="rounded-[4px] bg-surface-alt p-3 text-sm text-ink">
          <p className="font-semibold">{selected.district}, {selected.schoolYear}</p>
          <p className="mt-0.5 text-muted">
            Classes {formatShortWithYear(selected.firstDay)} to {formatShortWithYear(selected.lastDay)} · {selected.closures.length} closures listed
          </p>
          <p className="mt-1.5">
            Source: <a href={selected.source.url} target="_blank" rel="noopener noreferrer" className={`link-mark break-words ${FOCUS}`}>{selected.source.title}</a>
            <span className="text-muted">, checked {formatShortWithYear(selected.source.retrieved)}</span>
          </p>
          {selected.notes && <p className="mt-1.5 text-muted">{selected.notes}</p>}
        </div>
      )}
      <p className="text-xs leading-5 text-muted">
        Presets as of {formatShortWithYear(SCHOOL_PRESETS_AS_OF)}. This is not a directory of every district. Check your own school&apos;s calendar, and add any dates that differ below.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Import sources

type Pending = { source: string; heading: string; candidates: CandidateDates[] } | null;

function icsCandidates(busyDays: string[]): CandidateDates[] {
  return datesToRuns(busyDays).map((r) => ({ id: `${r.start}_${r.end}`, start: r.start, end: r.end, confidence: 'likely-closure' as const }));
}

export function ImportSources({
  schoolYearStart, customDates, onAddDates, onRemoveDate, onClearDates, askLink,
}: {
  schoolYearStart: number;
  customDates: readonly string[];
  onAddDates: (dates: string[]) => void;
  onRemoveDate: (date: string) => void;
  onClearDates: () => void;
  /** Builds the "please add the school calendar" link (ask=1). */
  askLink: () => string;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const [icsError, setIcsError] = useState<string | null>(null);
  const [icsNote, setIcsNote] = useState<string | null>(null);
  const [icsUrl, setIcsUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<{ kind: 'idle' } | { kind: 'reading'; message: string } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const [pasted, setPasted] = useState('');
  const [askMessage, setAskMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const urlId = useId();
  const pasteId = useId();

  const pastedCandidates = useMemo(() => (pasted.trim() ? extractSchoolDates(pasted, { schoolYearStart }) : []), [pasted, schoolYearStart]);

  const add = (dates: string[]) => {
    onAddDates(dates);
    setPending(null);
  };

  const acceptIcs = (text: string, source: string) => {
    const result = parseICSBusyDays(text);
    if (result.busyDays.length === 0) {
      setIcsError('No all-day or multi-day events found in this calendar.');
      return;
    }
    const notes = [
      result.cappedAt !== null ? `Only the first ${result.cappedAt} events were read.` : '',
      result.skippedRecurring > 0 ? `${result.skippedRecurring} repeating ${result.skippedRecurring === 1 ? 'event was' : 'events were'} skipped.` : '',
    ].filter(Boolean).join(' ');
    setIcsNote(notes || null);
    setPending({ source, heading: `Found ${datesToRuns(result.busyDays).length} date ranges in ${source}. Untick anything that isn't a day without school.`, candidates: icsCandidates(result.busyDays) });
  };

  const handleIcsFile = async (file: File) => {
    setIcsError(null);
    setIcsNote(null);
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) { setIcsError('This calendar file is too large to import.'); return; }
      acceptIcs(await file.text(), 'the calendar file');
    } catch (err) {
      setIcsError(err instanceof IcsParseError ? err.message : 'Could not read this as a calendar (.ics) file.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleIcsUrl = async () => {
    setIcsError(null);
    setIcsNote(null);
    let url: URL;
    try {
      url = new URL(icsUrl.trim().replace(/^webcal:\/\//i, 'https://'));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    } catch {
      setIcsError('That doesn’t look like a web address. It should start with https://');
      return;
    }
    setFetching(true);
    try {
      const resp = await fetch(url.toString(), { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
      if (!resp.ok) throw new Error(String(resp.status));
      const text = await resp.text();
      if (text.length > MAX_IMPORT_CHARS) { setIcsError('This calendar is too large to import.'); return; }
      acceptIcs(text, 'that calendar link');
    } catch (err) {
      setIcsError(err instanceof IcsParseError
        ? err.message
        : 'That calendar’s website doesn’t let other sites read it. Open the link, download the .ics file, and upload it above instead.');
    } finally {
      setFetching(false);
    }
  };

  const handlePhoto = async (file: File) => {
    setPhotoStatus({ kind: 'reading', message: 'Loading the text reader…' });
    try {
      const { readImageText } = await import('./familyOcr');
      const text = await readImageText(file, (message) => setPhotoStatus({ kind: 'reading', message }));
      const found = extractSchoolDates(text, { schoolYearStart });
      if (found.length === 0) {
        setPhotoStatus({ kind: 'error', message: 'No dates could be read from this photo. Try a sharper, straight-on photo, paste the text instead, or type the dates.' });
        return;
      }
      setPhotoStatus({ kind: 'idle' });
      setPending({ source: 'photo', heading: `Found ${found.length} ${found.length === 1 ? 'date' : 'dates'} in your photo.`, candidates: found });
    } catch (err) {
      setPhotoStatus({ kind: 'error', message: `${err instanceof Error && err.message.startsWith('This image') ? err.message : 'The photo couldn’t be read on this device.'} You can paste the calendar text or type the dates instead.` });
    } finally {
      // Drop the browser's reference to the image so it can be released.
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  return (
    <div className="flex min-w-0 flex-col">
      <Disclosure title="Calendar file or link (.ics)" hint="From the school website or a shared calendar">
        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          aria-label="Upload a school calendar file (.ics)"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleIcsFile(f); }}
          className={FILE_INPUT}
        />
        <label htmlFor={urlId} className="mt-3 block text-sm font-semibold text-ink">Or paste a calendar link</label>
        <div className="mt-1.5 flex min-w-0 flex-wrap gap-2">
          <input id={urlId} type="url" inputMode="url" value={icsUrl} onChange={(e) => setIcsUrl(e.target.value)} placeholder="https://… .ics" className={`${FIELD} flex-1 basis-48`} />
          <Button variant="secondary" disabled={!icsUrl.trim() || fetching} onClick={() => void handleIcsUrl()}>{fetching ? 'Reading…' : 'Read link'}</Button>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted">Read in your browser. Many school sites block this; if so, download the file and upload it.</p>
        {icsError && <p role="alert" className="mt-2 text-sm font-semibold text-ink">{icsError}</p>}
        {icsNote && <p className="mt-2 text-sm text-ink">{icsNote}</p>}
        {pending && pending.source !== 'photo' && pending.source !== 'paste' && (
          <FamilyConfirmList key={pending.candidates.map((c) => c.id).join()} heading={pending.heading} candidates={pending.candidates} onAdd={add} onDiscard={() => setPending(null)} />
        )}
      </Disclosure>

      <Disclosure title="Photo or screenshot" hint="Of a printed calendar or a PDF page">
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          aria-label="Choose a photo or screenshot of the school calendar"
          disabled={photoStatus.kind === 'reading'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhoto(f); }}
          className={FILE_INPUT}
        />
        <p className="mt-1.5 text-xs leading-5 text-muted">Your photo is read on this device and never uploaded. You check every date before it&apos;s added.</p>
        <p role="status" className="mt-2 text-sm text-ink">{photoStatus.kind === 'reading' ? photoStatus.message : ''}</p>
        {photoStatus.kind === 'error' && <p role="alert" className="text-sm font-semibold text-ink">{photoStatus.message}</p>}
        {pending?.source === 'photo' && (
          <FamilyConfirmList key={pending.candidates.map((c) => c.id).join()} heading={pending.heading} candidates={pending.candidates} onAdd={add} onDiscard={() => setPending(null)} />
        )}
      </Disclosure>

      <Disclosure title="Paste text" hint="Copied from a PDF, email or web page">
        <label htmlFor={pasteId} className="sr-only">School calendar text</label>
        <textarea
          id={pasteId}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={5}
          maxLength={50_000}
          placeholder={'Winter recess: Dec 21 – Jan 1\nNo school Mon, Feb 15'}
          className={`w-full min-w-0 rounded-[3px] border border-line-strong bg-surface px-3 py-2 text-base text-ink ${FOCUS}`}
        />
        {pasted.trim() && pastedCandidates.length === 0 && <p className="mt-1 text-sm text-muted">No dates found yet. Dates like “Dec 21 – Jan 1” or “11/26/2026” work.</p>}
        {pastedCandidates.length > 0 && (
          <FamilyConfirmList
            key={pastedCandidates.map((c) => c.id).join()}
            heading={`Found ${pastedCandidates.length} ${pastedCandidates.length === 1 ? 'date' : 'dates'} in the text.`}
            candidates={pastedCandidates}
            onAdd={(dates) => { onAddDates(dates); setPasted(''); }}
            onDiscard={() => setPasted('')}
          />
        )}
      </Disclosure>

      <Disclosure title="Type dates" hint={customDates.length ? `${customDates.length} added so far` : 'One day at a time'}>
        <DateListEditor
          label="School day off"
          dates={[...customDates]}
          onAdd={(d) => onAddDates([d])}
          onRemove={onRemoveDate}
        />
        {customDates.length > 0 && (
          <Button variant="quiet" size="sm" className="mt-2 -ml-2.5" onClick={onClearDates}>Remove all {customDates.length} added dates</Button>
        )}
      </Disclosure>

      <Disclosure title="Ask someone to add them" hint="A co-parent or the school office">
        <p className="text-sm text-muted">Copy a link that asks them to add the school&apos;s dates and send the link back. It contains no dates or details about you.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={async () => {
            try {
              const ok = await copyText(askLink());
              setAskMessage(ok ? 'Request link copied.' : 'Could not copy the link. Please try again.');
            } catch (err) {
              setAskMessage(err instanceof Error ? err.message : 'Could not create the link.');
            }
          }}>Copy request link</Button>
          <span role="status" className="text-sm text-muted">{askMessage}</span>
        </div>
      </Disclosure>
    </div>
  );
}
