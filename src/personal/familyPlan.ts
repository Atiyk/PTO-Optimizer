import { isoToSerial, mondayIndexedDow, serialToISO } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate } from '../ui/urlState';
import { MAX_SCHOOL_CALENDAR_DAYS } from './schoolCalendar';

/**
 * Family planner math for /family. Pure and date-only: no child, school or event names
 * enter or leave, and nothing is read from storage or the network. A school-off date that
 * is not listed is never inferred, so coverage is always reported as partial.
 */
export const MAX_FAMILY_PTO = 60;
/** Inclusive window cap, the same three-year limit as the request ledger. */
export const MAX_FAMILY_WINDOW_DAYS = 1096;
const MAX_LABEL_LENGTH = 200;

export interface FamilyPlanInput {
  /** Inclusive planning window, at most 1096 days. */
  start: string;
  end: string;
  /** School closure dates (from buildSchoolCalendar().offDays). Weekends need not be listed. */
  schoolOffDays: readonly string[];
  /** Public preset labels, date -> label. Optional. */
  schoolLabels?: Readonly<Record<string, string>>;
  /** Dates the parent is already off: weekends per their workweek + public/employer holidays. */
  parentFreeDays: readonly string[];
  /** PTO days the parent is willing to spend on school breaks, 0..MAX_FAMILY_PTO. */
  ptoBudget: number;
  /** Dates another adult (co-parent, grandparent) shared as available. Childcare cover only. */
  otherAdultDays?: readonly string[];
  /** Proposed coverage remains unverified. Absent preserves the prior date-only input contract. */
  otherAdultConfirmed?: boolean;
  /** Cover listed school closures before maximizing contiguous time off. */
  prioritizeCoverage?: boolean;
  /** Break ids (= break start date) the user switched off. */
  excludedBreaks?: readonly string[];
}

export interface SchoolBreak {
  id: string;
  start: string;
  end: string;
  label?: string;
  schoolOffWeekdays: string[];
  /** Days in the break the parent works (not in parentFreeDays). For a Mon-Fri workweek
   * these are exactly the weekdays; a parent who works Saturdays can also PTO those. */
  parentWorkdays: string[];
}

export interface FamilyBreakPlan {
  breakId: string;
  ptoDays: string[];
  togetherStart: string | null;
  togetherEnd: string | null;
  togetherDays: number;
  /** The parent is off for the whole break (every parent workday is PTO). */
  fullyCovered: boolean;
  excluded: boolean;
}

export type GapCover = 'you-off' | 'pto' | 'other-adult' | 'other-adult-proposed' | 'uncovered';

export interface FamilyPlanResult {
  breaks: SchoolBreak[];
  plans: FamilyBreakPlan[];
  ptoUsed: number;
  ptoLeft: number;
  /** Sum of togetherDays over breaks that are not excluded. */
  togetherDaysTotal: number;
  gaps: { date: string; cover: GapCover }[];
  uncoveredDays: string[];
  coverage: 'partial';
}

function validDateList(dates: unknown): dates is readonly string[] {
  return Array.isArray(dates) && dates.length <= MAX_SCHOOL_CALENDAR_DAYS
    && dates.every(date => typeof date === 'string' && isValidISODate(date));
}

function validLabels(labels: unknown): boolean {
  if (labels === undefined) return true;
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return false;
  const entries = Object.entries(labels);
  return entries.length <= MAX_SCHOOL_CALENDAR_DAYS && entries.every(([date, label]) =>
    isValidISODate(date) && typeof label === 'string' && label.length <= MAX_LABEL_LENGTH);
}

/** One per-break option: spend `cost` PTO days for `together` consecutive days together. */
interface BreakOption {
  cost: number;
  together: number;
  /** Indices into the break's day list. */
  ptoFrom: number; // index into workday positions, -1 when cost is 0
  runStart: number;
  runEnd: number; // inclusive; -1 when together is 0
}

/**
 * For each k, the best contiguous choice of k parent workdays. Workdays split the break
 * into free segments; taking workdays i..i+k-1 joins segments i..i+k into one run. The
 * longest run is that joined run or the best untouched segment, whichever is longer.
 * Ties keep the earliest choice, so dates stay deterministic. O(m^2) for m workdays.
 */
function breakOptions(length: number, workPositions: number[], maxCost: number): BreakOption[] {
  const m = workPositions.length;
  // seg[j] spans (workPositions[j-1], workPositions[j]) exclusive, with sentinels -1 and length.
  const segStart: number[] = [];
  const segLen: number[] = [];
  for (let j = 0; j <= m; j++) {
    const from = j === 0 ? 0 : workPositions[j - 1] + 1;
    const to = j === m ? length : workPositions[j];
    segStart.push(from);
    segLen.push(to - from);
  }
  // Earliest-longest segment over prefixes and suffixes, for "best untouched segment".
  const bestPrefix: number[] = []; // index of best segment in seg[0..j]
  for (let j = 0; j <= m; j++) {
    const prev = j === 0 ? -1 : bestPrefix[j - 1];
    bestPrefix.push(prev === -1 || segLen[j] > segLen[prev] ? j : prev);
  }
  const bestSuffix: number[] = new Array(m + 1);
  for (let j = m; j >= 0; j--) {
    const next = j === m ? -1 : bestSuffix[j + 1];
    bestSuffix[j] = next === -1 || segLen[j] >= segLen[next] ? j : next;
  }
  const options: BreakOption[] = [];
  const zero = bestPrefix[m];
  options.push({
    cost: 0, together: segLen[zero], ptoFrom: -1,
    runStart: segLen[zero] ? segStart[zero] : 0, runEnd: segLen[zero] ? segStart[zero] + segLen[zero] - 1 : -1,
  });
  const segPrefixSum = [0];
  for (const len of segLen) segPrefixSum.push(segPrefixSum[segPrefixSum.length - 1] + len);
  for (let k = 1; k <= Math.min(m, maxCost); k++) {
    let best: BreakOption | undefined;
    for (let i = 0; i + k <= m; i++) {
      const joined = segPrefixSum[i + k + 1] - segPrefixSum[i] + k;
      let together = joined;
      let runStart = segStart[i];
      let runEnd = runStart + joined - 1;
      const left = i > 0 ? bestPrefix[i - 1] : -1;
      const right = i + k + 1 <= m ? bestSuffix[i + k + 1] : -1;
      // An untouched segment wins only if strictly longer; on equal length the earlier run wins.
      for (const other of [left, right]) {
        if (other === -1) continue;
        const len = segLen[other];
        if (len > together || (len === together && segStart[other] < runStart)) {
          together = len; runStart = segStart[other]; runEnd = runStart + len - 1;
        }
      }
      if (!best || together > best.together) best = { cost: k, together, ptoFrom: i, runStart, runEnd };
    }
    options.push(best!);
  }
  return options;
}

/** Lexicographic compare of two date lists where a shorter prefix sorts after the longer
 * one: in a fixed-total-PTO tie, the shorter list's next date comes from a later break. */
function compareEarlier(a: string[], b: string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return b.length - a.length;
}

/**
 * Deterministic. Returns null on invalid input. Breaks are maximal runs of days the child is
 * off (school-off dates joined through Sat/Sun) containing at least one school-off weekday.
 * Allocation is a multiple-choice knapsack over non-excluded breaks (per break, the best
 * contiguous k-day PTO choice for each k), maximising total together days; ties prefer fewer
 * PTO days, then earlier PTO dates. With coverage priority, PTO goes to the earliest
 * listed school closures that still need childcare.
 */
export function planFamilyTime(input: FamilyPlanInput): FamilyPlanResult | null {
  if (!input || typeof input !== 'object') return null;
  const { start, end, ptoBudget } = input;
  if (typeof start !== 'string' || typeof end !== 'string' || !isValidISODate(start) || !isValidISODate(end)) return null;
  const startSerial = isoToSerial(start);
  const endSerial = isoToSerial(end);
  if (endSerial < startSerial || endSerial - startSerial + 1 > MAX_FAMILY_WINDOW_DAYS) return null;
  if (!Number.isInteger(ptoBudget) || ptoBudget < 0 || ptoBudget > MAX_FAMILY_PTO) return null;
  if (!validDateList(input.schoolOffDays) || !validDateList(input.parentFreeDays)) return null;
  if (input.otherAdultDays !== undefined && !validDateList(input.otherAdultDays)) return null;
  if (input.excludedBreaks !== undefined && !validDateList(input.excludedBreaks)) return null;
  if (!validLabels(input.schoolLabels)) return null;

  const schoolOff = new Set(input.schoolOffDays);
  const parentFree = new Set(input.parentFreeDays);
  const otherAdult = new Set(input.otherAdultDays ?? []);
  const excludedIds = new Set(input.excludedBreaks ?? []);
  const labels = input.schoolLabels ?? {};

  const breaks: SchoolBreak[] = [];
  const breakDays: string[][] = [];
  let run: string[] = [];
  let runHasSchoolWeekday = false;
  const closeRun = () => {
    if (run.length && runHasSchoolWeekday) {
      const schoolOffWeekdays = run.filter(day => schoolOff.has(day) && mondayIndexedDow(day) < 5);
      const counts = new Map<string, number>();
      for (const day of run) {
        const label = labels[day];
        if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      let label: string | undefined;
      for (const [candidate, count] of counts) if (!label || count > counts.get(label)!) label = candidate;
      breaks.push({
        id: run[0], start: run[0], end: run[run.length - 1], ...(label ? { label } : {}),
        schoolOffWeekdays, parentWorkdays: run.filter(day => !parentFree.has(day)),
      });
      breakDays.push(run);
    }
    run = [];
    runHasSchoolWeekday = false;
  };
  for (let serial = startSerial; serial <= endSerial; serial++) {
    const day = serialToISO(serial);
    const weekday = mondayIndexedDow(day) < 5;
    if (schoolOff.has(day) || !weekday) {
      run.push(day);
      if (weekday) runHasSchoolWeekday = true;
    } else closeRun();
  }
  closeRun();

  const confirmedAdult = input.otherAdultConfirmed !== false;
  const finish = (plans: FamilyBreakPlan[]): FamilyPlanResult => {
    const chosenPto = new Set(plans.flatMap(plan => plan.ptoDays));
    const gaps: FamilyPlanResult['gaps'] = [];
    for (const brk of breaks) {
      for (const date of brk.schoolOffWeekdays) {
        const cover: GapCover = parentFree.has(date) ? 'you-off' : chosenPto.has(date) ? 'pto'
          : otherAdult.has(date) ? (confirmedAdult ? 'other-adult' : 'other-adult-proposed') : 'uncovered';
        gaps.push({ date, cover });
      }
    }
    return {
      breaks, plans, ptoUsed: chosenPto.size, ptoLeft: ptoBudget - chosenPto.size,
      togetherDaysTotal: plans.reduce((total, plan) => total + (plan.excluded ? 0 : plan.togetherDays), 0),
      gaps,
      uncoveredDays: gaps.filter(gap => gap.cover === 'uncovered' || gap.cover === 'other-adult-proposed').map(gap => gap.date),
      coverage: 'partial',
    };
  };

  if (input.prioritizeCoverage) {
    let remaining = ptoBudget;
    return finish(breaks.map((brk, index) => {
      const excluded = excludedIds.has(brk.id);
      const ptoDays = excluded ? [] : brk.schoolOffWeekdays.filter(date =>
        !parentFree.has(date) && (!confirmedAdult || !otherAdult.has(date)),
      ).slice(0, remaining);
      remaining -= ptoDays.length;
      const pto = new Set(ptoDays);
      const days = breakDays[index];
      let togetherDays = 0;
      let togetherStart: string | null = null;
      let togetherEnd: string | null = null;
      let runStart = 0;
      for (let i = 0; i < days.length; i++) {
        if (!parentFree.has(days[i]) && !pto.has(days[i])) {
          runStart = i + 1;
        } else if (i - runStart + 1 > togetherDays) {
          togetherDays = i - runStart + 1;
          togetherStart = days[runStart];
          togetherEnd = days[i];
        }
      }
      return {
        breakId: brk.id, ptoDays, togetherStart, togetherEnd, togetherDays, excluded,
        fullyCovered: ptoDays.length === brk.parentWorkdays.length,
      };
    }));
  }

  const options = breaks.map((brk, index) => {
    const days = breakDays[index];
    const positions: number[] = [];
    days.forEach((day, position) => { if (!parentFree.has(day)) positions.push(position); });
    const isExcluded = excludedIds.has(brk.id);
    return { positions, list: breakOptions(days.length, positions, isExcluded ? 0 : ptoBudget), isExcluded };
  });

  // Suffix DP: best[b][c] = { together, cost } for breaks b.. with c PTO left.
  // Max together first, then min cost. Earlier dates are settled during the forward pass.
  const n = breaks.length;
  const bestTogether: Int32Array[] = [];
  const bestCost: Int32Array[] = [];
  for (let b = 0; b <= n; b++) {
    bestTogether.push(new Int32Array(ptoBudget + 1));
    bestCost.push(new Int32Array(ptoBudget + 1));
  }
  for (let b = n - 1; b >= 0; b--) {
    const { list, isExcluded } = options[b];
    for (let c = 0; c <= ptoBudget; c++) {
      let together = -1;
      let cost = 0;
      for (const option of list) {
        if (option.cost > c) break;
        const t = (isExcluded ? 0 : option.together) + bestTogether[b + 1][c - option.cost];
        const k = option.cost + bestCost[b + 1][c - option.cost];
        if (t > together || (t === together && k < cost)) { together = t; cost = k; }
      }
      bestTogether[b][c] = together;
      bestCost[b][c] = cost;
    }
  }

  const plans: FamilyBreakPlan[] = [];
  let remaining = ptoBudget;
  for (let b = 0; b < n; b++) {
    const { list, positions, isExcluded } = options[b];
    const days = breakDays[b];
    const target = bestTogether[b][remaining];
    const targetCost = bestCost[b][remaining];
    let chosen: BreakOption | undefined;
    let chosenDates: string[] = [];
    for (const option of list) {
      if (option.cost > remaining) break;
      const t = (isExcluded ? 0 : option.together) + bestTogether[b + 1][remaining - option.cost];
      const k = option.cost + bestCost[b + 1][remaining - option.cost];
      if (t !== target || k !== targetCost) continue;
      const dates = option.cost ? positions.slice(option.ptoFrom, option.ptoFrom + option.cost).map(p => days[p]) : [];
      if (!chosen || compareEarlier(dates, chosenDates) < 0) { chosen = option; chosenDates = dates; }
    }
    const option = chosen!;
    remaining -= option.cost;
    plans.push({
      breakId: breaks[b].id,
      ptoDays: chosenDates,
      togetherStart: option.together ? days[option.runStart] : null,
      togetherEnd: option.together ? days[option.runEnd] : null,
      togetherDays: option.together,
      fullyCovered: option.cost === positions.length,
      excluded: isExcluded,
    });
  }

  return finish(plans);
}
