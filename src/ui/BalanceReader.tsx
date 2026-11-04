import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { analyzeBalanceText, type BalanceAnalysis, type BalanceCandidate, type BalanceUnit } from '../personal/balanceExtract';

/**
 * F5: the "Read it from a screenshot" panel, lazy-loaded by BalanceFromImage when opened. The user picks, pastes or drops an image of a payslip or
 * HR balance screen; on-device OCR (lazy-loaded, see balanceOcr.ts) reads it; the extractor
 * proposes candidates; one tap on a candidate sets the balance (and as-of date) through the
 * page's own setters, so it lands in the URL like any typed value. The tap is the confirm
 * step the product rules require for values read from messy input; there is no other
 * button. Nothing is stored: the object URL for the preview is revoked and the text lives
 * only in component state.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface BalanceReaderProps {
  /** The page's balance unit. Candidates in the other unit are converted on use. */
  unit: BalanceUnit;
  hoursPerDay: number;
  /** ISO date, for as-of plausibility. */
  today: string;
  onUse: (balance: number, asOf?: string) => void;
  /** Injected in tests; defaults to the lazy on-device OCR module. */
  recognize?: (image: Blob, onProgress: (p: { phase: 'loading' | 'reading'; progress: number }) => void) => Promise<string>;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; phase: 'loading' | 'reading'; progress: number }
  | { kind: 'error'; message: string };

const lazyRecognize: NonNullable<BalanceReaderProps['recognize']> = async (image, onProgress) => {
  const { recognizeImageText } = await import('./balanceOcr');
  return recognizeImageText(image, onProgress);
};

const fmtNumber = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
const fmtDate = (iso: string, withYear: boolean) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const unitWord = (value: number, unit: BalanceUnit) => (unit === 'days' ? (Math.abs(value) === 1 ? 'day' : 'days') : (Math.abs(value) === 1 ? 'hour' : 'hours'));

/** The candidate's value in the page's unit, rounded to 2 decimals. */
export function valueInUnit(c: BalanceCandidate, unit: BalanceUnit, hoursPerDay: number): number {
  if (c.unit === unit) return c.value;
  const converted = unit === 'days' ? c.value / hoursPerDay : c.value * hoursPerDay;
  return Math.round(converted * 100) / 100;
}

const REASON_TEXT: Record<NonNullable<BalanceAnalysis['reason']>, string> = {
  empty: '',
  'no-numbers': 'No numbers were found. Try a sharper or closer screenshot of the balance, or paste the text instead.',
  'only-other-leave': 'Only sick or other leave balances were found, not vacation or PTO. You can still type your balance above.',
  'no-balance': 'No vacation or PTO balance was found. Try a screenshot that shows the balance line, or paste the text instead.',
};

export default function BalanceReader({ id, unit, hoursPerDay, today, onUse, recognize = lazyRecognize }: BalanceReaderProps & { id: string }) {
  const baseId = useId();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [source, setSource] = useState<'image' | 'text'>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [usedMessage, setUsedMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const job = useRef(0);

  // Revoke the preview URL when it is replaced or the component unmounts.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const activeText = source === 'text' ? pastedText : ocrText;
  const analysis = useMemo<BalanceAnalysis | null>(
    () => (activeText === null || (source === 'text' && !activeText.trim()) ? null : analyzeBalanceText(activeText, { today, unit })),
    [activeText, source, today, unit],
  );

  async function readImage(file: File | Blob | null | undefined) {
    setUsedMessage('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus({ kind: 'error', message: 'That file is not an image. Choose a PNG, JPG or other screenshot, or paste the text instead.' });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setStatus({ kind: 'error', message: 'That image is over 10 MB. Crop it to the balance, or take a smaller screenshot.' });
      return;
    }
    const id = ++job.current;
    setSource('image');
    setOcrText(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStatus({ kind: 'working', phase: 'loading', progress: 0 });
    try {
      const text = await recognize(file, (p) => { if (job.current === id) setStatus({ kind: 'working', ...p }); });
      if (job.current !== id) return;
      setOcrText(text);
      setStatus({ kind: 'idle' });
    } catch {
      if (job.current !== id) return;
      setStatus({ kind: 'error', message: 'The screenshot could not be read on this device. Paste the text instead, or type your balance above.' });
    }
  }

  function clear() {
    job.current++;
    setPreviewUrl(null);
    setOcrText(null);
    setStatus({ kind: 'idle' });
    setUsedMessage('');
    if (fileInput.current) fileInput.current.value = '';
  }

  // While the reader is open, an image pasted anywhere on the page is read (text pastes into
  // fields are left alone).
  const readRef = useRef(readImage);
  readRef.current = readImage;
  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      const items = event.clipboardData ? [...event.clipboardData.items] : [];
      const item = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      if (!item) return;
      event.preventDefault();
      void readRef.current(item.getAsFile());
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, []);

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    void readImage(event.dataTransfer.files[0]);
  }

  function use(c: BalanceCandidate) {
    const value = valueInUnit(c, unit, hoursPerDay);
    onUse(value, c.asOf);
    setUsedMessage(`Balance set to ${fmtNumber(value)} ${unitWord(value, unit)}${c.asOf ? ` as of ${fmtDate(c.asOf, true)}` : ''}. Check it against your payslip.`);
  }

  const working = status.kind === 'working';
  const candidates = analysis?.candidates ?? [];
  const showResults = analysis !== null && !working;

  return (
    <div
      id={id}
      role="region"
      aria-label="Read your balance from a screenshot"
      className="mt-2 min-w-0 rounded-[4px] border border-line bg-surface-alt p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <p className="text-sm text-ink">Pick or paste a screenshot of your payslip or HR time-off page. We read it and show the balances we find; tap one to use it.</p>
      <p className="mt-1 text-xs text-muted">Reading happens on this device and your image is never uploaded. The first time, the reading engine (about 7 MB) downloads once from this site.</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label
          htmlFor={`${baseId}-file`}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-[3px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-alt focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink"
        >
          Choose a screenshot
          <input
            ref={fileInput}
            id={`${baseId}-file`}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void readImage(e.target.files?.[0])}
          />
        </label>
        <span className="text-xs text-muted">or paste one here (Ctrl+V / ⌘V)</span>
      </div>

      {previewUrl && (
        <div className="mt-3 flex items-start gap-3">
          <img src={previewUrl} alt="Your screenshot" className="max-h-24 max-w-[40%] rounded-[3px] border border-line object-contain" />
          <button type="button" onClick={clear} className="min-h-11 px-1 text-sm text-muted underline decoration-1 underline-offset-[0.22em] hover:decoration-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Remove image</button>
        </div>
      )}

      <div role="status" aria-live="polite" className="mt-3 text-sm text-ink empty:hidden">
        {working && (
          <div className="flex flex-col gap-1">
            <span>{status.phase === 'loading' ? 'Loading the reading engine…' : `Reading your screenshot… ${Math.round(status.progress * 100)}%`}</span>
            <progress className="h-2 w-full max-w-xs accent-ink" max={1} value={status.progress} aria-label="Reading progress" />
          </div>
        )}
        {status.kind === 'error' && <span>{status.message}</span>}
        {showResults && candidates.length === 0 && analysis?.reason && REASON_TEXT[analysis.reason]}
        {usedMessage}
      </div>

      {showResults && candidates.length > 0 && (
        <div className="mt-3">
          <p id={`${baseId}-found`} className="text-sm font-semibold text-ink">Balances found{source === 'image' ? ' in your screenshot' : ''}. Tap the right one:</p>
          <ul aria-labelledby={`${baseId}-found`} className="mt-2 flex flex-col gap-2">
            {candidates.map((c, i) => {
              const converted = c.unit !== unit ? valueInUnit(c, unit, hoursPerDay) : null;
              const asOf = c.asOf ? ` · as of ${fmtDate(c.asOf, c.asOf.slice(0, 4) !== today.slice(0, 4))}` : '';
              return (
                <li key={`${c.kind}-${c.value}-${c.unit}-${i}`}>
                  <button
                    type="button"
                    onClick={() => use(c)}
                    className="flex min-h-11 w-full min-w-0 flex-col items-start rounded-[3px] border border-line-strong bg-surface px-3 py-2 text-left hover:border-ink hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <span className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">
                      {c.label} · {fmtNumber(c.value)} {unitWord(c.value, c.unit)}
                      {converted !== null && <> ({fmtNumber(converted)} {unitWord(converted, unit)} at {fmtNumber(hoursPerDay)} h/day)</>}
                      {asOf}
                    </span>
                    <span className="mt-0.5 max-w-full truncate text-xs text-muted">From: “{c.sourceLine}”{c.unitStated ? '' : ' · unit guessed'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <button
          type="button"
          aria-expanded={pasteOpen}
          aria-controls={`${baseId}-paste`}
          onClick={() => { setPasteOpen((o) => !o); setSource((s) => (pasteOpen ? 'image' : s)); }}
          className="min-h-11 text-sm font-semibold text-ink underline decoration-1 underline-offset-[0.22em] hover:decoration-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {pasteOpen ? 'Hide pasted text' : 'Paste the text instead'}
        </button>
        {pasteOpen && (
          <div id={`${baseId}-paste`} className="mt-2">
            <label htmlFor={`${baseId}-text`} className="block text-sm font-medium text-ink">Text from your payslip or HR page</label>
            <textarea
              id={`${baseId}-text`}
              value={pastedText}
              onChange={(e) => { setPastedText(e.target.value); setSource('text'); setUsedMessage(''); }}
              rows={4}
              placeholder="e.g. Vacation available 12.5 days as of 10/31/2026"
              className="mt-1 block w-full min-w-0 rounded-[3px] border border-line-strong bg-surface p-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            />
          </div>
        )}
      </div>
    </div>
  );
}
