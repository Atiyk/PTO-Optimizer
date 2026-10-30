import { useState } from 'react';
import { findTerm } from '../content/glossary/terms';
import { track } from './analytics';

/**
 * Stage 3B: replaces ad-hoc InfoHint text for a glossary definition - same visual/
 * interaction pattern as InfoHint (dotted underline here instead of the "i" badge, since
 * this wraps real inline text rather than standing alone next to a label), opened by hover
 * AND focus, closed by their opposites, dismissible with Escape, and reachable by keyboard.
 * Links through to the term's own page for the long definition.
 */
export function Term({ id, children }: { id: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const term = findTerm(id);
  if (!term) return <>{children ?? id}</>;

  const openPopover = () => {
    if (!open) track('term_opened');
    setOpen(true);
  };

  return (
    <span className="relative inline-block">
      <span
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label={`${term.term}: ${term.short}`}
        className="cursor-help border-b border-dotted border-slate-400 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--focus-ring)]"
        onMouseEnter={openPopover}
        onMouseLeave={() => setOpen(false)}
        onFocus={openPopover}
        onBlur={() => setOpen(false)}
        onClick={openPopover}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {children ?? term.term}
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-1 w-max max-w-[18rem] -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-2 text-xs text-white shadow-lg"
        >
          <span className="block font-semibold">{term.term}</span>
          <span className="mt-0.5 block">{term.short}</span>
          <a href={`/glossary/${term.id}`} className="mt-1 block text-slate-300 underline">
            More →
          </a>
        </span>
      )}
    </span>
  );
}
