import { formatShort } from '@daysoff/engine/calendar/dateFormat';

/** Phase 5.1: "a message when it changes the plan" - pure and exported so the exact wording
 * is directly unit-testable, same pattern as Headline.tsx's headlineText. */
export function peakCapMessage(maxDays: number, startDate: string, endDate: string): string {
  const dayWord = maxDays === 1 ? 'day' : 'days';
  return `Capped at ${maxDays} ${dayWord} between ${formatShort(startDate)} and ${formatShort(endDate)} — the rest of your PTO moved elsewhere in your range.`;
}

interface PeakCapBannerProps {
  /** solveResult.peakCapApplied - true only when the cap actually changed the plan, never
   * just because it's configured (see solve.ts's enforcePeakCap). */
  applied: boolean;
  maxDays: number;
  startDate: string;
  endDate: string;
}

export function PeakCapBanner({ applied, maxDays, startDate, endDate }: PeakCapBannerProps) {
  if (!applied) return null;
  return (
    <div role="status" className="flex gap-2 rounded-[10px] border border-line bg-surface p-4 text-sm tabular-nums text-ink">
      <span aria-hidden="true" className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 bg-ink" />
      <p>{peakCapMessage(maxDays, startDate, endDate)}</p>
    </div>
  );
}
