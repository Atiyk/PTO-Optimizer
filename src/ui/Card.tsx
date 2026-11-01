import type { ElementType, ReactNode } from 'react';

/**
 * Redesign Phase 1: the white surface everything glanceable sits on (Apple Weather-style
 * stack). `eyebrow` is a small label above the content; `as` lets a card be a section or
 * an article for document structure.
 */
export function Card({
  children,
  eyebrow,
  as: Tag = 'div',
  className = '',
  padded = true,
}: {
  children: ReactNode;
  eyebrow?: ReactNode;
  as?: ElementType;
  className?: string;
  padded?: boolean;
}) {
  return (
    <Tag className={`rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(28,25,23,0.04)] ${padded ? 'p-5 sm:p-6' : ''} ${className}`}>
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{eyebrow}</p>}
      {children}
    </Tag>
  );
}
