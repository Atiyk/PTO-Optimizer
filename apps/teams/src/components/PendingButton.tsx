'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** A form's button that says what is happening while the server action runs. */
export function PendingButton({ children, pending, className }: { children: ReactNode; pending: ReactNode; className: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy} aria-busy={busy}>
      {busy ? pending : children}
    </button>
  );
}
