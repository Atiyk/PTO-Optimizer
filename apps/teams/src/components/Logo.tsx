/** The product mark: a calendar page with one day taken. Decorative; the name is always beside it. */
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="4" width="28" height="26" rx="6" fill="var(--accent)" />
      <rect x="2" y="4" width="28" height="8" rx="6" fill="var(--accent-strong)" />
      <rect x="8" y="1.5" width="3" height="6" rx="1.5" fill="var(--accent-strong)" />
      <rect x="21" y="1.5" width="3" height="6" rx="1.5" fill="var(--accent-strong)" />
      <rect x="8" y="16" width="5" height="4" rx="1" fill="#ffffff" opacity=".45" />
      <rect x="15" y="16" width="5" height="4" rx="1" fill="#ffffff" />
      <rect x="22" y="16" width="3" height="4" rx="1" fill="#ffffff" opacity=".45" />
      <rect x="8" y="23" width="5" height="4" rx="1" fill="#ffffff" opacity=".45" />
      <rect x="15" y="23" width="5" height="4" rx="1" fill="#ffffff" opacity=".45" />
    </svg>
  );
}
