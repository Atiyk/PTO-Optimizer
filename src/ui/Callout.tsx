import type { ReactNode } from 'react';

/**
 * Redesign Phase 1: a left-bordered note - a reason, a finding, a caveat. `why` adds the
 * one-line explanation behind it ("Why: bridges Thanksgiving"). The accent tone is for
 * the plan's own findings; neutral for context.
 */
export function Callout({
  title,
  children,
  why,
  tone = 'accent',
  className = '',
}: {
  title?: ReactNode;
  children?: ReactNode;
  why?: ReactNode;
  tone?: 'accent' | 'neutral';
  className?: string;
}) {
  return (
    <div className={`rounded-r-xl border-l-4 bg-surface py-3 pr-4 pl-4 ${tone === 'accent' ? 'border-accent' : 'border-line-strong'} ${className}`}>
      {title && <p className="font-semibold text-ink">{title}</p>}
      {children && <div className={`text-[15px] leading-6 text-ink ${title ? 'mt-0.5' : ''}`}>{children}</div>}
      {why && (
        <p className="mt-1.5 text-sm text-muted">
          <span className="font-semibold text-ink">Why: </span>
          {why}
        </p>
      )}
    </div>
  );
}
