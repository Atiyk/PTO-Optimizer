import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Redesign Phase 1: a huge numeral with its label (Apple Weather-style). The number is
 * always passed in from engine output; this only displays it. When the value changes (not
 * on first render - no motion on page load) it eases in over 150ms so the change is
 * noticed; prefers-reduced-motion turns that off (index.css).
 */
export function StatNumber({
  value,
  label,
  prefix,
  suffix,
  size = 'display',
  className = '',
}: {
  value: number | string;
  label: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: 'display' | 'lg' | 'md';
  className?: string;
}) {
  const first = useRef(true);
  const [changed, setChanged] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setChanged((n) => n + 1);
  }, [value]);

  const numeralCls =
    size === 'display'
      ? 'text-display-sm sm:text-display type-display'
      : size === 'lg'
        ? 'text-h1 type-display'
        : 'text-h2 font-bold type-condensed';

  return (
    <div className={`flex flex-col ${className}`}>
      <span className="flex items-baseline gap-2 text-ink">
        {prefix && <span className="text-lg font-medium text-muted">{prefix}</span>}
        <span key={changed} className={`${numeralCls} tabular-nums ${changed ? 'animate-[stat-in_160ms_var(--ease-out)]' : ''}`}>
          {value}
        </span>
        {suffix && <span className="text-lg font-medium text-ink">{suffix}</span>}
      </span>
      <span className="mt-1 text-sm text-muted">{label}</span>
    </div>
  );
}
