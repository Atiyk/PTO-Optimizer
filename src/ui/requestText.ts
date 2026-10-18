import type { Break } from '../solver/types';
import { addDays } from '../solver/dateUtils';
import { formatShort, formatDateRange } from './dateFormat';

/** Groups a sorted list of ISO dates into maximal runs of consecutive calendar days. */
function groupConsecutive(dates: string[]): string[][] {
  const groups: string[][] = [];
  for (const d of dates) {
    const last = groups[groups.length - 1];
    if (last && addDays(last[last.length - 1], 1) === d) last.push(d);
    else groups.push([d]);
  }
  return groups;
}

function ptoDatesOf(brk: Break, isPtoDay: (iso: string) => boolean): string[] {
  return brk.days.filter(isPtoDay).slice().sort();
}

function formatGroup(group: string[]): string {
  if (group.length === 1) return formatShort(group[0]);
  return `${formatShort(group[0])}–${formatShort(group[group.length - 1])}`;
}

/** The bare, HR-system-ready list: the exact working days being requested, grouped into
 * readable consecutive runs, plus the total count. Deliberately lists the PTO-cost days
 * themselves (not the break's full span) - an HR system wants the days actually being
 * deducted from the balance, not the weekends/holidays around them. */
export function formatWorkingDaysList(brk: Break, isPtoDay: (iso: string) => boolean): string {
  const dates = ptoDatesOf(brk, isPtoDay);
  if (dates.length === 0) return 'No working days in this break.';
  const groups = groupConsecutive(dates);
  const groupText = groups.map(formatGroup).join(', ');
  const year = dates[0].slice(0, 4);
  const spansMultipleYears = dates.some((d) => d.slice(0, 4) !== year);
  const dayWord = dates.length === 1 ? 'working day' : 'working days';
  return `${groupText}${spansMultipleYears ? '' : `, ${year}`} — ${dates.length} ${dayWord}`;
}

/** A three-sentence manager email draft: the request itself, the payoff (total days off
 * gained from the surrounding weekend/holiday), and a closing invitation to adjust. */
export function formatManagerEmail(brk: Break, isPtoDay: (iso: string) => boolean): string {
  const dates = ptoDatesOf(brk, isPtoDay);
  const groups = groupConsecutive(dates);
  const groupText = groups.map(formatGroup).join(', ');
  const dayWord = dates.length === 1 ? 'working day' : 'working days';
  const freeDays = Math.max(0, brk.totalDaysOff - dates.length);
  const totalWord = brk.totalDaysOff === 1 ? 'day' : 'days';

  const sentence1 = `I'd like to request PTO covering ${formatDateRange(brk.start, brk.end)} — ${dates.length} ${dayWord}: ${groupText}.`;
  const sentence2 =
    freeDays > 0
      ? `With the surrounding weekend${freeDays === 1 ? '' : 's'}/holiday${freeDays === 1 ? '' : 's'}, this gives me ${brk.totalDaysOff} ${totalWord} off in total.`
      : `This uses ${dates.length} ${dayWord} from my PTO balance.`;
  const sentence3 = `Let me know if this works, or if you'd like me to adjust the dates.`;

  return `${sentence1} ${sentence2} ${sentence3}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
