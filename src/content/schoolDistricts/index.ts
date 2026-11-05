/**
 * Verified 2026-27 school-calendar presets for large US districts.
 * Every date was read from the district's own published calendar; see each district file for its source
 * and docs/runs/family-planner/DISTRICT-SOURCES.md for what was checked. This is not a directory of every
 * district — users should check their own school's calendar.
 */
import type { SchoolDistrictPreset } from './types';
import { AUSTIN_2026_27 } from './austin';
import { BROWARD_2026_27 } from './broward';
import { CHICAGO_2026_27 } from './chicago';
import { DALLAS_2026_27 } from './dallas';
import { FAIRFAX_2026_27 } from './fairfax';
import { GWINNETT_2026_27 } from './gwinnett';
import { HOUSTON_2026_27 } from './houston';
import { LAUSD_2026_27 } from './lausd';
import { MONTGOMERY_2026_27 } from './montgomery';
import { NYC_2026_27 } from './nyc';
import { PHILADELPHIA_2026_27 } from './philadelphia';
import { SEATTLE_2026_27 } from './seattle';

export type { ClosureKind, SchoolClosure, SchoolDistrictPreset } from './types';

export const SCHOOL_PRESETS_AS_OF = '2026-11-04';

export const SCHOOL_DISTRICT_PRESETS: readonly SchoolDistrictPreset[] = [
  AUSTIN_2026_27,
  BROWARD_2026_27,
  CHICAGO_2026_27,
  DALLAS_2026_27,
  FAIRFAX_2026_27,
  GWINNETT_2026_27,
  HOUSTON_2026_27,
  LAUSD_2026_27,
  MONTGOMERY_2026_27,
  NYC_2026_27,
  PHILADELPHIA_2026_27,
  SEATTLE_2026_27,
].sort((a, b) => a.shortName.localeCompare(b.shortName, 'en'));

export function findDistrictPreset(id: string): SchoolDistrictPreset | undefined {
  return SCHOOL_DISTRICT_PRESETS.find((p) => p.id === id);
}

const DAY_MS = 86_400_000;

function parseISO(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === iso ? t : null;
}

/** Expands each closure to its weekday dates, calling fn(date, label) in closure order. */
function eachClosureWeekday(preset: SchoolDistrictPreset, fn: (date: string, label: string) => void): void {
  for (const c of preset.closures) {
    const start = parseISO(c.start);
    const end = parseISO(c.end);
    if (start === null || end === null) continue;
    for (let t = start; t <= end; t += DAY_MS) {
      const dow = new Date(t).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      fn(new Date(t).toISOString().slice(0, 10), c.label);
    }
  }
}

/** Every weekday closure date (expanded, sorted, deduped), Sat/Sun excluded. */
export function presetOffDays(preset: SchoolDistrictPreset): string[] {
  const days = new Set<string>();
  eachClosureWeekday(preset, (d) => days.add(d));
  return [...days].sort();
}

/** date -> label for UI display. When closures overlap, the first listed closure's label wins. */
export function presetLabels(preset: SchoolDistrictPreset): Record<string, string> {
  const labels: Record<string, string> = {};
  eachClosureWeekday(preset, (d, label) => {
    if (!(d in labels)) labels[d] = label;
  });
  return labels;
}
