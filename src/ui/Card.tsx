import type { ElementType, ReactNode } from 'react';

/**
 * 2026-11 redesign: the sheet everything glanceable sits on - white paper one tone above the
 * page, a hairline edge and no shadow at rest (only things that float get a shadow). `eyebrow`
 * is kept for API compatibility and now renders as a plain sentence-case caption, not a tracked
 * uppercase label. `as` lets a card be a section or an article for document structure.
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
    <Tag className={`rounded-[10px] border border-line bg-surface ${padded ? 'p-5 sm:p-6' : ''} ${className}`}>
      {eyebrow && <p className="mb-2 text-sm font-semibold text-muted">{eyebrow}</p>}
      {children}
    </Tag>
  );
}
