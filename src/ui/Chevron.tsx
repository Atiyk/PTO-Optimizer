/**
 * A drawn chevron for disclosures and menus, in place of Unicode glyphs (which render at
 * different weights per font and platform). `direction` is where it points; pass `open`
 * to a disclosure's chevron and it turns from down to up. Always decorative.
 */
export function Chevron({ direction = 'down', className = 'h-3 w-3' }: { direction?: 'down' | 'up' | 'right'; className?: string }) {
  const rotate = direction === 'up' ? 'rotate-180' : direction === 'right' ? '-rotate-90' : '';
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className={`shrink-0 transition-transform duration-150 ${rotate} ${className}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  );
}

/** Plus that becomes a minus: for "open more" disclosures. */
export function PlusMinus({ open, className = 'h-3.5 w-3.5' }: { open: boolean; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 14 14" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M2 7h10" />
      {!open && <path d="M7 2v10" />}
    </svg>
  );
}
