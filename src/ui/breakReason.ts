import type { Break } from '@daysoff/engine/solver/types';

/**
 * The "why" line under a break. The card (and the homepage's "Longest" line) already states
 * the trade ("18 days off for 10 PTO days") right above it, so this line only adds what the
 * reader does not have yet: the holiday it uses, the days already off it joins, or the
 * travel context. Travel tags reflect an estimate for the dates, so they only qualify the
 * context in broad terms.
 */
export function breakReason(brk: Break, holidayNameFor: (iso: string) => string | undefined): string {
  // Same threshold BreakCard uses for its low-value case: a 1.0x-or-worse swap gets the
  // plain "no extra days off" explanation, never a reason that reads as a sales pitch.
  // A busier-dates note is left off here: it would read as a reason to take the break.
  if (brk.multiplier <= 1) {
    const travel = travelNote(brk, false);
    return travel ? `No extra days off from weekends or holidays. ${travel}` : 'No extra days off from weekends or holidays.';
  }

  const holidayName = brk.days.map(holidayNameFor).find((name): name is string => !!name);
  if (holidayName) return `Bridges ${holidayName}.`;

  return travelNote(brk, true) ?? 'Joins your PTO to days you already have off.';
}

function travelNote(brk: Break, includePeak: boolean): string | undefined {
  // Estimated demand must not be presented as an observed quiet/peak comparison.
  // This takes precedence when a recommendation carries both tags.
  if (brk.tags.includes('Estimated')) return 'Travel demand for these dates is an estimate for this country.';
  if (brk.tags.includes('Low travel demand') && Number.isFinite(brk.meanDemand) && brk.meanDemand >= 0 && brk.meanDemand < 1) {
    return 'These dates look quieter in the historical travel comparison.';
  }
  if (includePeak && brk.tags.includes('Peak travel') && Number.isFinite(brk.meanDemand) && brk.meanDemand > 1) {
    return 'These dates look busier in the historical travel comparison.';
  }
  return undefined;
}
