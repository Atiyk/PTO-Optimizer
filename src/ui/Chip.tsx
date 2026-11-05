import type { ReactNode } from 'react';

export type ChipTone = 'neutral' | 'accent';

/**
 * 2026-11 redesign: a small square-cornered label - a fact ("3.8×", "Free, no sign-up") or, with
 * `onClick`, a toggle (`selected` sets aria-pressed and a visible border, not colour alone).
 */
export function Chip({
  children,
  tone = 'neutral',
  selected,
  onClick,
  className = '',
}: {
  children: ReactNode;
  tone?: ChipTone;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const toneCls = tone === 'accent' ? 'bg-mark text-ink' : 'bg-surface-alt text-ink';
  const base = `inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-sm font-semibold tabular-nums ${toneCls}`;
  if (!onClick) return <span className={`${base} ${className}`}>{children}</span>;
  return (
    <button
      type="button"
      aria-pressed={selected ?? false}
      onClick={onClick}
      className={`${base} border transition-colors duration-150 ${selected ? 'border-ink bg-mark' : 'border-transparent hover:border-ink'} ${className}`}
    >
      {selected && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {children}
    </button>
  );
}
