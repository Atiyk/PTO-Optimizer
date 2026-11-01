/**
 * Redesign Phase 1: "in 26 days" / "tomorrow" / "today". `days` comes from the engine
 * (landingData's daysAway and friends); this only words it. With `date`, it renders a
 * <time> so the exact day is machine-readable too.
 */
export function countdownText(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function Countdown({ days, date, emphasis = false }: { days: number; date?: string; emphasis?: boolean }) {
  const inner =
    days > 1 ? (
      <>
        in <span className={emphasis ? 'font-semibold text-ink' : ''}>{days}</span> days
      </>
    ) : (
      countdownText(days)
    );
  return date ? (
    <time dateTime={date} className="tabular-nums">
      {inner}
    </time>
  ) : (
    <span className="tabular-nums">{inner}</span>
  );
}
