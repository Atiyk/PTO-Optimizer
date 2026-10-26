import { formatShort } from './dateFormat';
import { Container } from './Container';

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
    <div role="status" className="border-b border-slate-200 bg-slate-50">
      <Container className="px-4 py-2">
        <p className="text-xs tabular-nums text-slate-600">{peakCapMessage(maxDays, startDate, endDate)}</p>
      </Container>
    </div>
  );
}
