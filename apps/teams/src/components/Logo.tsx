/**
 * The Gapless mark: a small coverage grid, rooms by half hours, with one cell picked out (the
 * gap you hear about first). Original drawing. Decorative; the name is always beside it.
 */
export function Logo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="var(--accent)" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => {
          const hot = row === 1 && col === 2;
          return <rect key={`${row}-${col}`} x={6 + col * 7.5} y={6 + row * 7.5} width="5.5" height="5.5" rx="1.25" fill="#ffffff" opacity={hot ? 1 : 0.4} />;
        }),
      )}
      <rect x="20.25" y="12.75" width="7" height="7" rx="1.75" fill="none" stroke="#ffffff" strokeWidth="1.25" />
    </svg>
  );
}
