import type { Break } from '@daysoff/engine/solver/types';

/** Explain the exact PTO trade first. Travel tags reflect an estimate for the
 * dates, so they only qualify the context in broad terms. */
export function breakReason(brk: Break, holidayNameFor: (iso: string) => string | undefined): string {
  const dayWord = brk.totalDaysOff === 1 ? 'day' : 'days';
  const ptoWord = brk.ptoCost === 1 ? 'day' : 'days';
  const swap = `${brk.ptoCost} PTO ${ptoWord} for ${brk.totalDaysOff} ${dayWord} off`;

  // Same threshold BreakCard already uses to decide the multiplier badge's low-value
  // styling - a 1.0x-or-worse swap gets the honest "no extra days off" explanation instead
  // of a reason that would read as a sales pitch for a break that isn't actually a bargain.
  if (brk.multiplier <= 1) {
    if (brk.tags.includes('Estimated')) return `No extra days off — ${swap}; travel demand here is an estimate for this country.`;
    if (brk.tags.includes('Low travel demand') && Number.isFinite(brk.meanDemand) && brk.meanDemand >= 0 && brk.meanDemand < 1) return `No extra days off — ${swap}; these dates look quieter in the historical comparison.`;
    return `No extra days off — ${swap}.`;
  }

  const holidayName = brk.days.map(holidayNameFor).find((name): name is string => !!name);
  if (holidayName) return `Bridges ${holidayName} — ${swap}.`;

  // Estimated demand must not be presented as an observed quiet/peak comparison.
  // This takes precedence when a recommendation carries both tags.
  if (brk.tags.includes('Estimated')) {
    return `${swap} — travel demand here is an estimate for this country.`;
  }
  if (brk.tags.includes('Low travel demand') && Number.isFinite(brk.meanDemand) && brk.meanDemand >= 0 && brk.meanDemand < 1) {
    return `${swap} — quieter in the historical travel comparison.`;
  }
  if (brk.tags.includes('Peak travel') && Number.isFinite(brk.meanDemand) && brk.meanDemand > 1) {
    return `${swap} — busier in the historical travel comparison.`;
  }
  return `Efficient swap — ${swap} (${brk.multiplier.toFixed(2)}x).`;
}
