import type { ReactNode } from 'react';

/* Small pieces shared by the public marketing pages (/, /childcare, /developers). */

export function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-serif text-3xl leading-tight font-semibold tracking-tight text-balance text-ink sm:text-4xl">
        {title}
      </h2>
      {children && <p className="mt-4 text-lg text-muted">{children}</p>}
    </div>
  );
}

export function Example() {
  return <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-sm text-muted">Example</span>;
}

export function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9" fill="var(--accent-soft)" />
      <path d="M6 10.5l2.5 2.5L14 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A phone outline around a drawing of the staff app. Decorative frame; the content is real text. */
export function PhoneFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="mx-auto w-full max-w-72">
      <div className="rounded-[2rem] border-[6px] border-ink/85 bg-page p-3 shadow-sm">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-line" aria-hidden="true" />
        <div className="min-h-64 space-y-3">{children}</div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted">{label}</figcaption>
    </figure>
  );
}
