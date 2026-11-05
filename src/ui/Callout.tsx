import type { ReactNode } from 'react';

/**
 * 2026-11 redesign: a note on a tone step - a reason, a finding, a caveat. The plan's own findings
 * carry a small marker square; context notes are plain. `why` adds the
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
    <div className={`rounded-[10px] py-3 pr-4 pl-4 ${tone === 'accent' ? 'bg-accent-soft' : 'bg-surface-alt'} ${className}`}>
      {title && (
        <p className="flex items-baseline gap-2 font-semibold text-ink">
          {tone === 'accent' && <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[-1px] rounded-[2px] bg-accent" />}
          {title}
        </p>
      )}
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
