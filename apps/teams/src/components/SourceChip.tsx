'use client';

import { useEffect, useId, useRef, useState } from 'react';

/*
 * The provenance pattern: a small citation chip that links a number or setting to its
 * source (a regulation section or a handbook sentence). Activating it opens a small panel
 * with the quoted text, who published it, the date it was read and a link, plus "Not legal
 * advice". A real button (keyboard-reachable); Escape or a click elsewhere closes it.
 */

export interface SourceChipSource {
  /** Short chip text, e.g. "Cal. H&S Code § 1596.955(a)(3)–(4)" or "Handbook, p. 4". */
  label: string;
  regulation: string;
  section?: string;
  url?: string | null;
  /** ISO date the source was read. */
  retrievedOn?: string | null;
  publisher?: 'official' | 'mirror' | 'agency_guidance' | 'enacted_bill' | 'handbook';
  quote?: string | null;
}

const PUBLISHER: Record<NonNullable<SourceChipSource['publisher']>, string> = {
  official: 'Official text',
  mirror: 'Copy of the official text; check it against the publisher',
  agency_guidance: 'The agency’s own guidance',
  enacted_bill: 'Text of the enacted bill',
  handbook: 'Your handbook',
};

function readableDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function SourceChip({ source }: { source: SourceChipSource }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrap} className="relative inline-block align-baseline">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-sm font-medium text-accent-strong hover:border-accent"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" focusable="false">
          <path d="M4 2.5h6l2.5 2.5v8.5H4z M10 2.5V5h2.5 M6 8h4.5 M6 10.5h4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        <span className="sr-only">Source: </span>
        {source.label}
      </button>
      {open && (
        <span
          id={id}
          role="group"
          aria-label={`Source: ${source.label}`}
          className="absolute top-full left-0 z-30 mt-2 block w-80 max-w-[calc(100vw-2.5rem)] rounded-lg border border-line bg-card p-3 text-left text-sm text-ink shadow-lg"
        >
          <span className="block font-semibold">
            {source.regulation}
            {source.section ? ` ${source.section}` : ''}
          </span>
          {source.quote && <span className="mt-2 block border-l-2 border-accent pl-2 text-ink">“{source.quote}”</span>}
          <span className="mt-2 block text-muted">
            {source.publisher ? PUBLISHER[source.publisher] : null}
            {source.publisher && source.retrievedOn ? ' · ' : null}
            {source.retrievedOn ? `read ${readableDate(source.retrievedOn)}` : null}
          </span>
          {source.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium text-accent underline underline-offset-2">
              Open the source<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
          <span className="mt-2 block text-muted">Not legal advice.</span>
        </span>
      )}
    </span>
  );
}
