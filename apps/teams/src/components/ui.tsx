import type { ReactNode } from 'react';

/* Small shared primitives in the Days Off visual language: slate neutrals, one blue accent. */

export function Card({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-page p-4 sm:p-5">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'bad' }) {
  // Tone is carried by border style and weight too, so it stays legible in greyscale.
  const cls = {
    neutral: 'border-line bg-surface-alt text-ink',
    accent: 'border-accent bg-accent text-white',
    warn: 'border-dashed border-ink bg-band text-ink',
    bad: 'border-2 border-ink bg-page text-ink font-semibold',
  }[tone];
  return <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${cls}`}>{children}</span>;
}

export const btn =
  'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
export const btnPrimary = `${btn} bg-accent text-white hover:bg-accent-strong`;
export const btnSecondary = `${btn} border border-line bg-page text-ink hover:bg-surface-alt`;
export const input =
  'block w-full rounded-md border border-line bg-page px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';
export const label = 'block text-sm font-medium text-ink';

export function fmt(n: number | null | undefined, unit?: string): string {
  if (n == null) return '—';
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${s} ${unit === 'days' && Math.abs(n) === 1 ? 'day' : unit}` : s;
}

export function formatRange(start: string, end: string): string {
  const f = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
  return start === end ? f(start, true) : `${f(start, false)} – ${f(end, true)}`;
}
