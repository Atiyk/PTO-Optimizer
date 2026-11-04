import { lazy, Suspense, useId, useState } from 'react';
import type { BalanceReaderProps } from './BalanceReader';

/**
 * F5 entry point beside the current-balance field: a small disclosure that loads the
 * screenshot reader (and the balance extractor) only when opened, so a normal page load
 * pays for one button. See BalanceReader.tsx for the reader and balanceOcr.ts for the
 * on-device OCR engine (a further lazy load, only when an image is picked).
 */
const BalanceReader = lazy(() => import('./BalanceReader'));

export type BalanceFromImageProps = BalanceReaderProps;

export function BalanceFromImage(props: BalanceFromImageProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0 sm:col-span-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink underline decoration-1 underline-offset-[0.22em] hover:decoration-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {open ? 'Hide screenshot reader' : 'Read it from a screenshot'}
      </button>
      {open && (
        <Suspense fallback={<p role="status" className="mt-2 text-sm text-muted">Opening the screenshot reader…</p>}>
          <BalanceReader id={id} {...props} />
        </Suspense>
      )}
    </div>
  );
}
