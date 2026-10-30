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
        // Stage 6 quality pass: the short "?" glyph form (passed as children in Policy.tsx/
        // MoreOptions.tsx) rendered a ~7x17px hit area, found while live-clicking it in the
        // browser (a real mouse click at its exact geometric centre missed the React handler
        // more often than not - .click() always worked, a coordinate-based click didn't,
        // which is exactly what a too-small touch/click target looks like). Padding widens
        // the clickable+focusable box without changing the full-term-text usage's visual
        // inline flow (MoreOptions.tsx's "Accrual" heading etc.) - still short of the ideal
        // 44px touch target for a one-character glyph without turning it into a visible
        // button, which is a real design tradeoff, not fully resolved - see PROGRESS.md.
        className="cursor-help border-b border-dotted border-slate-400 px-0.5 py-1 text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--focus-ring)]"
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
