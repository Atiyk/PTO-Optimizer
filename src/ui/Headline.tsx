import { useEffect, useState, type RefObject } from 'react';
import type { Scores } from '@daysoff/engine/solver/types';
import { Button } from './Button';

interface HeadlineProps {
  budgetSpent: number;
  totalDaysOff: number;
  breakCountActual: number;
  /** Kept for API stability; the plain-language score lines live in SummaryMetrics now. */
  scores: Scores | null;
  /** Raw total PTO balance, before reserve is subtracted. */
  budget: number;
  reserveDays: number;
  canPin: boolean;
  onPin: () => void;
  pinnedCount: number;
  pending?: boolean;
  unavailable?: boolean;
  /** "target days" instead of "PTO days" in the balance line for unlimited-PTO plans. */
  unlimitedPto?: boolean;
  /** PTO the planner reserves once for approved and tentative tracked requests. */
  trackedReservedDays?: number;
}

/**
 * Phase 3.1: "12 of 15 days planned · 3 kept in reserve → 26 days off" when a reserve is
 * set - must read as a DELIBERATE choice, never as the unspent-budget warning. Falls back to
 * "N PTO days → M days off" when reserveDays is 0. Still the one-line form of the result: the
 * portrait/image exports and the compact phone bar use it; the page's h1 sets the same facts
 * as a marked figure (see Headline below).
 */
export function headlineText(budgetSpent: number, budget: number, reserveDays: number, totalDaysOff: number): string {
  const offWord = totalDaysOff === 1 ? 'day' : 'days';
  if (reserveDays > 0) {
    const dayWord = budget === 1 ? 'day' : 'days';
    return `${budgetSpent} of ${budget} ${dayWord} planned · ${reserveDays} kept in reserve → ${totalDaysOff} ${offWord} off`;
  }
  const spentWord = budgetSpent === 1 ? 'day' : 'days';
  return `${budgetSpent} PTO ${spentWord} → ${totalDaysOff} ${offWord} off`;
}

/** The supporting line under the figure: break count, then how the balance was used. */
export function balanceLine(budgetSpent: number, budget: number, reserveDays: number, breakCountActual: number, unlimitedPto = false, trackedReservedDays = 0): string {
  const breaks = `${breakCountActual} ${breakCountActual === 1 ? 'break' : 'breaks'}`;
  const unit = unlimitedPto ? 'target' : 'PTO';
  const dayWord = budget === 1 ? 'day' : 'days';
  const parts = [breaks, `${budgetSpent} of ${budget} ${unit} ${dayWord} planned`];
  const reserve = Math.min(budget, reserveDays);
  // PTO already promised to tracked requests (workspace rule) is not "not placed".
  const tracked = Math.min(Math.max(0, budget - reserve), trackedReservedDays);
  if (reserveDays > 0) parts.push(`${reserve} kept in reserve`);
  if (tracked > 0) parts.push(`${tracked} reserved for tracked requests`);
  const unplanned = Math.max(0, budget - budgetSpent - reserve - tracked);
  if (unplanned > 0) parts.push(`${unplanned} not placed`);
  return parts.join(' · ');
}

/**
 * The answer, put first: the plan's result as a marked figure ("27 days off") with what it
 * costs beside it ("from 12 PTO days"). This is the page's single h1 and sits inside a polite
 * live region, so a screen reader hears the new result as the sliders move.
 */
export function Headline({ budgetSpent, totalDaysOff, breakCountActual, budget, reserveDays, canPin, onPin, pinnedCount, pending, unavailable, unlimitedPto = false, trackedReservedDays = 0 }: HeadlineProps) {
  if (pending || unavailable) {
    return <div className="min-w-0">
      <h1 className="text-h2 font-bold text-ink type-condensed">Your PTO plan</h1>
      {pending && <p role="status" className="mt-2 text-sm text-muted">Updating your plan…</p>}
    </div>;
  }
  const saveTitle = pinnedCount >= 2 ? 'Remove a saved plan to make room for another.' : undefined;
  const offWord = totalDaysOff === 1 ? 'day' : 'days';
  const spentWord = budgetSpent === 1 ? 'day' : 'days';
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-x-6">
        <h1 className="m-0 min-w-0 text-ink" aria-live="polite">
          <span className="block text-display-sm type-display tabular-nums">
            <span className="mark">{totalDaysOff} {offWord} off</span>
          </span>{' '}
          <span className="mt-2 block text-h2 font-bold tabular-nums type-condensed">
            from {budgetSpent} {unlimitedPto ? 'target' : 'PTO'} {spentWord}
          </span>
        </h1>
        <Button variant="secondary" size="md" onClick={onPin} disabled={!canPin} title={saveTitle} className="mt-1 shrink-0 px-3! text-sm!">
          Save this plan
        </Button>
      </div>
      <p className="mt-3 text-sm tabular-nums text-muted">{balanceLine(budgetSpent, budget, reserveDays, breakCountActual, unlimitedPto, trackedReservedDays)}</p>
    </div>
  );
}

/**
 * Phones only: once the result line has scrolled away, a slim bar pinned to the top keeps the
 * figure in view while the person works the sliders and the calendar below. It is a visual
 * echo of the h1 (aria-hidden, inert, no controls), so assistive tech is not told twice; the
 * bottom tab bar stays clear because this sits at the top.
 */
export function CompactResultBar({ watch, totalDaysOff, budgetSpent, breakCountActual }: { watch: RefObject<HTMLElement | null>; totalDaysOff: number; budgetSpent: number; breakCountActual: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = watch.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [watch]);
  return (
    <div
      aria-hidden="true"
      inert
      className={`fixed inset-x-0 top-0 z-30 border-b border-line bg-page/95 backdrop-blur transition-transform duration-150 ease-[var(--ease-out)] lg:hidden [@media(max-height:500px)]:hidden ${visible ? 'translate-y-0' : '-translate-y-full'}`}
    >
      <div className="mx-auto flex h-11 max-w-7xl items-center gap-3 px-4 text-sm tabular-nums text-ink sm:px-6">
        <span className="text-lg font-extrabold type-display"><span className="mark">{totalDaysOff} days off</span></span>
        <span className="text-muted">from {budgetSpent} PTO · {breakCountActual} {breakCountActual === 1 ? 'break' : 'breaks'}</span>
      </div>
    </div>
  );
}
