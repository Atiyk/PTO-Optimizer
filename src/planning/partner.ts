import type { Break, SolveInput } from '@daysoff/engine/solver/types';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate, readOverlapPayloadFromURL } from '../ui/urlState';
import { validatePtoDates } from './optimizer';

export const PARTNER_PARAM = 'pp';
export const MAX_PARTNER_DAYS = 1100;
export const MAX_PARTNER_PAYLOAD = 12000;

/** Available dates are the only coordinates disclosed. A missing free-day set means
 * legacy availability of unknown composition; it must never be called confirmed PTO. */
export interface PartnerAvailability {
  days: string[];
  freeDays: string[] | null;
  status: 'proposed' | 'confirmed';
}

function normalizedDays(days: string[]): string[] {
  if (days.length > MAX_PARTNER_DAYS || days.some(day => typeof day !== 'string' || !isValidISODate(day))) throw new Error('Invalid availability dates.');
  return [...new Set(days)].sort();
}

function compressDays(days: string[]): string {
  const values = normalizedDays(days);
  const ranges: string[] = [];
  for (let index = 0; index < values.length; index++) {
    const start = values[index];
    let end = start;
    while (index + 1 < values.length && values[index + 1] === addDays(end, 1)) end = values[++index];
    ranges.push(start.replaceAll('-', '') + (end === start ? '' : `~${end.replaceAll('-', '')}`));
  }
  return ranges.join(',');
}

function expandDays(raw: string): string[] | null {
  if (!raw) return [];
  const days: string[] = [];
  const compactToISO = (value: string) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  for (const item of raw.split(',')) {
    if (!/^\d{8}(~\d{8})?$/.test(item)) return null;
    const [startRaw, endRaw = startRaw] = item.split('~');
    const start = compactToISO(startRaw);
    const end = compactToISO(endRaw);
    if (!isValidISODate(start) || !isValidISODate(end) || end < start || end > addDays(start, MAX_PARTNER_DAYS - 1)) return null;
    const range = rangeISO(start, end);
    if (days.length + range.length > MAX_PARTNER_DAYS) return null;
    days.push(...range);
  }
  return normalizedDays(days);
}

/** The whitelist below never serializes an input budget, policy, note, or employer. */
export function encodePartnerAvailability(availability: PartnerAvailability): string {
  const days = normalizedDays(availability.days);
  if (!days.length) throw new Error('Choose at least one date to share.');
  const daySet = new Set(days);
  const free = availability.freeDays === null ? '-' : compressDays(normalizedDays(availability.freeDays).filter(day => daySet.has(day)));
  const payload = `1:${availability.status === 'confirmed' ? 'c' : 'p'}:${compressDays(days)}:${free}`;
  if (payload.length > MAX_PARTNER_PAYLOAD) throw new Error('This selection is too large to share in a link. Choose fewer breaks.');
  return payload;
}

export function decodePartnerAvailability(raw: string): PartnerAvailability | null {
  if (raw.length > MAX_PARTNER_PAYLOAD) return null;
  const parts = raw.split(':');
  if (parts.length !== 4 || parts[0] !== '1' || !['c', 'p'].includes(parts[1])) return null;
  const days = expandDays(parts[2]);
  const freeDays = parts[3] === '-' ? null : expandDays(parts[3]);
  if (!days?.length || (parts[3] !== '-' && freeDays === null)) return null;
  const daySet = new Set(days);
  if (freeDays?.some(day => !daySet.has(day))) return null;
  return { days, freeDays, status: parts[1] === 'c' ? 'confirmed' : 'proposed' };
}

export function readPartnerAvailability(search: string): { availability: PartnerAvailability | null; invalid: boolean } {
  // Bound before parsing so pathological links never expand into huge date arrays.
  if (search.length > 50000) return { availability: null, invalid: true };
  const params = new URLSearchParams(search);
  const payload = params.get(PARTNER_PARAM);
  if (payload !== null) {
    const availability = decodePartnerAvailability(payload);
    return { availability, invalid: availability === null };
  }
  if (params.has('ov')) {
    if ((params.get('ov')?.length ?? 0) > MAX_PARTNER_PAYLOAD) return { availability: null, invalid: true };
    const days = readOverlapPayloadFromURL(search);
    if (!days.length || days.length > MAX_PARTNER_DAYS) return { availability: null, invalid: true };
    return { availability: { days, freeDays: null, status: 'proposed' }, invalid: false };
  }
  return { availability: null, invalid: false };
}

export function buildPartnerShareURL(origin: string, _pathname: string, availability: PartnerAvailability): string {
  const days = normalizedDays(availability.days);
  const params = new URLSearchParams();
  params.set(PARTNER_PARAM, encodePartnerAvailability(availability));
  // The shared date bounds are already disclosed by the payload. Set only these
  // neutral coordinates, never the sender's country, budget, or private preferences.
  params.set('s', days[0]);
  params.set('e', days[days.length - 1]);
  return `${origin}/pto?${params.toString()}`;
}

export interface JointOpportunity {
  kind: 'long-weekend' | 'week' | 'longer';
  break: Break;
  yourPtoDays: string[];
  partnerPtoCost: number | null;
  bothFree: number;
  onlyYouNeedPto: number | null;
  onlyPartnerNeedsPto: number | null;
  bothNeedPto: number | null;
}

function recipientPtoDays(input: SolveInput, days: string[]): string[] {
  const off = new Set(input.offDays);
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  return days.filter(day => workWeek[mondayIndexedDow(day)] && !off.has(day));
}

/** Each card is an independently feasible alternative. It is not a second allocation of
 * the same PTO budget, and no undisclosed source date can enter a joint opportunity. */
export function findJointOpportunities(input: SolveInput, availability: PartnerAvailability, minimumBreakLength = 3): JointOpportunity[] {
  if (!isValidISODate(input.rangeStart) || !isValidISODate(input.rangeEnd) || input.rangeEnd < input.rangeStart) return [];
  const minLength = Math.max(3, Math.min(MAX_PARTNER_DAYS, Math.floor(minimumBreakLength) || 3));
  const blackouts = new Set(input.blackouts ?? []);
  let disclosed: string[];
  try { disclosed = normalizedDays(availability.days); } catch { return []; }
  const days = disclosed.filter(day => day >= input.rangeStart && day <= input.rangeEnd && !blackouts.has(day));
  const runs: string[][] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (last && addDays(last[last.length - 1], 1) === day) last.push(day);
    else runs.push([day]);
  }
  const partnerFree = availability.freeDays === null ? null : new Set(availability.freeDays);
  const yourPtoSet = new Set(recipientPtoDays(input, days));
  const requiredAlready = [...new Set(input.mustIncludeDays ?? [])].filter(day => day >= input.rangeStart && day <= input.rangeEnd);
  const categories = [
    { kind: 'long-weekend' as const, min: Math.max(3, minLength), max: minLength > 4 && minLength < 7 ? 6 : 4 },
    { kind: 'week' as const, min: Math.max(7, minLength), max: 9 },
    { kind: 'longer' as const, min: Math.max(10, minLength), max: MAX_PARTNER_DAYS },
  ];
  const result: JointOpportunity[] = [];
  for (const category of categories) {
    if (category.min > category.max) continue;
    let best: JointOpportunity | undefined;
    const possibleMaximum = Math.min(category.max, Math.max(0, ...runs.map(run => run.length)));
    let perfect = false;
    for (const run of runs) {
      if (run.length < category.min) continue;
      const costs = [0];
      for (const day of run) costs.push(costs[costs.length - 1] + Number(yourPtoSet.has(day)));
      for (let start = 0; start + category.min <= run.length; start++) {
        let low = category.min;
        let high = Math.min(category.max, run.length - start);
        let found: string[] | undefined;
        while (low <= high) {
          const length = Math.floor((low + high) / 2);
          if (costs[start + length] - costs[start] > input.budget) { high = length - 1; continue; }
          const candidate = run.slice(start, start + length);
          const pto = candidate.filter(day => yourPtoSet.has(day));
          const required = [...new Set([...requiredAlready, ...pto])];
          const valid = validatePtoDates(input, required).valid;
          if (valid) { found = candidate; low = length + 1; }
          else high = length - 1;
        }
        if (!found) continue;
        const yours = found.filter(day => yourPtoSet.has(day));
        const yourSet = new Set(yours);
        const sourcePto = partnerFree === null ? null : found.filter(day => !partnerFree.has(day)).length;
        const brk: Break = {
          id: `${found[0]}|${found[found.length - 1]}`,
          start: found[0], end: found[found.length - 1], days: found,
          totalDaysOff: found.length, ptoCost: yours.length,
          multiplier: yours.length ? found.length / yours.length : 0,
          tags: ['Overlaps'], meanDemand: 1,
        };
        const opportunity: JointOpportunity = {
          kind: category.kind, break: brk, yourPtoDays: yours, partnerPtoCost: sourcePto,
          bothFree: found.filter(day => !yourSet.has(day) && partnerFree?.has(day)).length,
          onlyYouNeedPto: partnerFree === null ? null : found.filter(day => yourSet.has(day) && partnerFree.has(day)).length,
          onlyPartnerNeedsPto: partnerFree === null ? null : found.filter(day => !yourSet.has(day) && !partnerFree.has(day)).length,
          bothNeedPto: partnerFree === null ? null : found.filter(day => yourSet.has(day) && !partnerFree.has(day)).length,
        };
        const combined = yours.length + (sourcePto ?? 0);
        const bestCombined = best ? best.yourPtoDays.length + (best.partnerPtoCost ?? 0) : Infinity;
        if (!best || found.length > best.break.totalDaysOff || (found.length === best.break.totalDaysOff && (combined < bestCombined || (combined === bestCombined && brk.start < best.break.start)))) best = opportunity;
        // Dates are chronological. No later window can improve a maximum-length,
        // zero-PTO result, even in a maliciously large but valid availability link.
        if (best.break.totalDaysOff === possibleMaximum && best.yourPtoDays.length + (best.partnerPtoCost ?? 0) === 0) { perfect = true; break; }
      }
      if (perfect) break;
    }
    if (best) result.push(best);
  }
  return result;
}
