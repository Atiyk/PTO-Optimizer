import type { Break } from '../solver/types';

/**
 * Phase 3 step 4: "UNDERSTAND WHY each recommendation is good" - one plain-language sentence
 * per break, visible on the card, not a tooltip. Every branch here is tied to a real,
 * already-computed field (brk.days/tags/meanDemand/multiplier/totalDaysOff/ptoCost) - never
 * a holiday name or a percentile the data doesn't actually have. In particular there is no
 * per-break travel percentile anywhere in the solver (only a whole-plan one, in Scores), so
 * the travel-demand branches below report meanDemand as a plain "% above/below an average
 * day" instead of a fabricated percentile.
 *
 * `holidayNameFor` is the same single-date lookup DayCell's tooltip already uses - scanning
 * every day of the break against it is the only truthful way to say "bridges X," since nothing
 * on Break itself names an adjacent holiday.
 */
export function breakReason(brk: Break, holidayNameFor: (iso: string) => string | undefined): string {
  const dayWord = brk.totalDaysOff === 1 ? 'day' : 'days';
  const ptoWord = brk.ptoCost === 1 ? 'day' : 'days';
  const swap = `${brk.ptoCost} PTO ${ptoWord} for ${brk.totalDaysOff} ${dayWord} off`;

  // Same threshold BreakCard already uses to decide the multiplier badge's low-value
  // styling - a 1.0x-or-worse swap gets the honest "no extra days off" explanation instead
  // of a reason that would read as a sales pitch for a break that isn't actually a bargain.
  if (brk.multiplier <= 1) {
    if (brk.tags.includes('Low travel demand')) return 'No extra days off — chosen for low travel demand.';
    return 'No extra days off — this uses the full available budget rather than leaving a PTO day unspent.';
  }

  const holidayName = brk.days.map(holidayNameFor).find((name): name is string => !!name);
  if (holidayName) return `Bridges ${holidayName} — ${swap}.`;

  if (brk.tags.includes('Low travel demand')) {
    const pct = Math.round((1 - brk.meanDemand) * 100);
    return `Quiet travel week — about ${pct}% less demand than an average day.`;
  }
  if (brk.tags.includes('Peak travel')) {
    const pct = Math.round((brk.meanDemand - 1) * 100);
    return `Busier travel week (about ${pct}% above average) — ${swap} regardless.`;
  }
  if (brk.tags.includes('Estimated')) {
    return `${swap} — travel demand here is an estimate for this country.`;
  }
  return `Efficient swap — ${swap} (${brk.multiplier.toFixed(2)}x).`;
}
