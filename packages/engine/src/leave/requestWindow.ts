import type { ISODate } from '../solver/types';
import type { TieBreak } from './rules';

/**
 * Request windows (pure, D1): a contested period (the holidays) collects requests until a date,
 * then shares the slots out by a stated tie-break instead of first come, first served:
 *  - rotation: whoever had leave in this period least recently goes first (never = first);
 *  - seniority: the earliest start date goes first;
 *  - lottery: a seeded shuffle, so the same seed always gives the same order (audit).
 * Each request is in only when every day it charges stays within `slots`. A person confirms the
 * allocation; people who miss out are offered other dates. Nothing is declined here.
 */

export interface WindowRequest {
  requestId: string;
  memberId: string;
  /** Working days inside the window that this request charges. */
  dates: ISODate[];
  /** When it was submitted (only the final tie-break, after the rule's own). */
  submittedAt: string;
  /** For rotation: the last year the person had leave in this period; null = never. */
  lastYearInPeriod: number | null;
  /** For seniority. */
  startDate: ISODate | null;
}

export interface Allocation {
  order: string[];
  results: { requestId: string; memberId: string; in: boolean; reason: string }[];
  seed: number | null;
}

export function allocateWindow(requests: WindowRequest[], slots: number, tieBreak: TieBreak, seed?: number): Allocation {
  const byTime = [...requests].sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : a.submittedAt > b.submittedAt ? 1 : a.requestId < b.requestId ? -1 : 1));
  let ordered: WindowRequest[];
  const s = tieBreak === 'lottery' ? (seed ?? 1) : null;
  if (tieBreak === 'rotation') {
    ordered = [...byTime].sort((a, b) => (a.lastYearInPeriod ?? -Infinity) - (b.lastYearInPeriod ?? -Infinity));
  } else if (tieBreak === 'seniority') {
    ordered = [...byTime].sort((a, b) => (a.startDate ?? '9999-12-31').localeCompare(b.startDate ?? '9999-12-31'));
  } else {
    ordered = shuffle(byTime, s!);
  }
  const used = new Map<ISODate, number>();
  const results: Allocation['results'] = [];
  for (const r of ordered) {
    const full = r.dates.find((d) => (used.get(d) ?? 0) >= slots);
    if (full) {
      results.push({ requestId: r.requestId, memberId: r.memberId, in: false, reason: `${full} already has ${slots} of ${slots} people away` });
      continue;
    }
    for (const d of r.dates) used.set(d, (used.get(d) ?? 0) + 1);
    results.push({ requestId: r.requestId, memberId: r.memberId, in: true, reason: reasonFor(tieBreak, r) });
  }
  return { order: ordered.map((r) => r.requestId), results, seed: s };
}

function reasonFor(t: TieBreak, r: WindowRequest): string {
  if (t === 'rotation') return r.lastYearInPeriod == null ? 'has not had this period before' : `last had this period in ${r.lastYearInPeriod}`;
  if (t === 'seniority') return r.startDate ? `started ${r.startDate}` : 'no start date on record';
  return 'drawn in the lottery';
}

/** mulberry32: small, deterministic PRNG. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
