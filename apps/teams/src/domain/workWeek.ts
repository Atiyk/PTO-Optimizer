import type { WorkWeek } from '@daysoff/engine/solver/types';

/** DB stores the work week as 7 chars, Monday first: '1111100'. */
export function parseWorkWeek(s: string): WorkWeek {
  const days = s.padEnd(7, '0').slice(0, 7).split('').map((c) => c === '1');
  return days as WorkWeek;
}

export function formatWorkWeek(w: WorkWeek): string {
  return w.map((d) => (d ? '1' : '0')).join('');
}
