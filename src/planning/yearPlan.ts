/**
 * Year-round planning styles (`ps=year`, `ps=max`, `ps=season`).
 *
 * The existing styles hand the whole range to one deterministic solve(). Its DP ranks
 * spend first and length second, so on a 12-month range starting in November it spends
 * most of the balance on the most efficient bridges, which cluster around Christmas and
 * New Year: a new visitor saw 15 days of PTO all used between Dec 24 and Feb 15.
 *
 * `year` instead:
 * 1. keeps a small reserve (parameter; default 0/1/2 days by balance size);
 * 2. starts no recommended break inside a lead window (max(notice, 14) + 7 days from the
 *    plan start) - pinned dates there are kept;
 * 3. splits the rest of the range into calendar seasons and solves each season with the
 *    same consumer solver (solveConsumer), for every budget it could receive;
 * 4. picks the per-season budget split with a small DP (seasons x budget) that maximises
 *    total days off, subject to breaks in at least `minSeasons` seasons and no season
 *    taking more than `maxWindowShare` of the spendable balance;
 * 5. validates the union with validatePtoDates (accrual, expiry, peak cap, blackouts,
 *    required dates). Anything it can't satisfy degrades to a simpler plan with a note.
 *
 * `season` is the same, with one season (hemisphere-aware) given a single big break of at
 * least `seasonShare` of the spendable balance. `max` is the plain solve at w=0, no
 * break-count target (most days off; it may bunch breaks).
 *
 * Every function here is pure and deterministic: the same input always gives the same plan.
 */
import { addDays, isoToSerial, mondayIndexedDow, monthsElapsed, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { Alternative, Break, SolveInput, SolveResult } from '@daysoff/engine/solver/types';
import { solveConsumer, validatePtoDates, type ConsumerSolveOptions, type PlanningStyle } from './optimizer';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'fall', 'winter'];
export const DEFAULT_SEASON: Season = 'summer';

/** Countries whose seasons are reversed (mainland mostly south of the equator). */
export const SOUTHERN_HEMISPHERE_COUNTRIES: ReadonlySet<string> = new Set([
  'AU', 'NZ', 'ZA', 'AR', 'BR', 'CL', 'UY', 'PY', 'BO', 'PE', 'NA', 'BW', 'LS', 'SZ', 'MZ', 'MG', 'MU', 'ZW', 'ZM', 'FJ',
]);

export function isSouthernHemisphere(country: string | undefined): boolean {
  return !!country && SOUTHERN_HEMISPHERE_COUNTRIES.has(country.toUpperCase());
}

/** Meteorological season of a month (1-12) for a country. */
export function seasonOfMonth(month: number, country?: string): Season {
  const north: Season = month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'fall';
  if (!isSouthernHemisphere(country)) return north;
  return ({ winter: 'summer', summer: 'winter', spring: 'fall', fall: 'spring' } as const)[north];
}

export function seasonOfDate(iso: string, country?: string): Season {
  return seasonOfMonth(Number(iso.slice(5, 7)), country);
}

export interface YearPlanOptions {
  /** Days held back from the plan. 'auto': 0 below 8 days, 1 for 8-14, 2 from 15. */
  reserveDays: number | 'auto';
  /** Reserve the person already set aside (subtracted before `input.budget`); the auto
   * reserve only adds what is missing, so the two never double up. */
  heldReserveDays: number;
  /** Request notice in calendar days. Lead window = max(notice, minLeadDays) + leadBufferDays. */
  noticeDays: number;
  minLeadDays: number;
  leadBufferDays: number;
  /** Breaks should land in at least this many season windows... */
  minSeasons: number;
  /** ...when at least this many PTO days are spendable. */
  minBudgetForSpread: number;
  /** No season window takes more than this share of a year's spendable balance (rounded up),
   * unless fewer windows make that impossible. */
  maxWindowShare: number;
  /** A season window shorter than this merges into its neighbour. */
  minWindowDays: number;
  /** Travel weighting and per-window break-count target handed to the engine. */
  w: number;
  windowBreakCount: number;
  /** `season` style only. */
  season: Season;
  seasonShare: number;
}

export const DEFAULT_YEAR_PLAN_OPTIONS: YearPlanOptions = {
  reserveDays: 'auto',
  heldReserveDays: 0,
  noticeDays: 14,
  minLeadDays: 14,
  leadBufferDays: 7,
  minSeasons: 3,
  minBudgetForSpread: 6,
  maxWindowShare: 0.5,
  minWindowDays: 21,
  w: 30,
  windowBreakCount: 1,
  season: DEFAULT_SEASON,
  seasonShare: 0.4,
};

/** What the planner kept back and how the plan was shaped, for the UI to explain. */
export interface PlanStyleMeta {
  style: 'year' | 'max' | 'season';
  /** PTO days intentionally left unplanned ("2 days kept for surprises"). */
  reserveKept: number;
  /** First date a recommended break may start; earlier dates only hold pinned days. */
  leadUntil?: string;
  windows: { label: string; season: Season; start: string; end: string; budget: number; daysOff: number }[];
  /** Distinct seasons the plan's breaks touch, in plan order. */
  seasonsTouched: Season[];
  /** Plain-language reason when the plan had to be simpler than the style asks for. */
  note?: string;
}

/** Options a caller may pass through ConsumerSolveOptions (all JSON-serialisable). */
export type PlanStyleOptions = Partial<YearPlanOptions>;

export interface StyledSolveOptions extends ConsumerSolveOptions {
  plan?: PlanStyleOptions;
}

export interface StyledOutcome {
  result: SolveResult;
  issue?: string;
  meta?: PlanStyleMeta;
}

export function autoReserveDays(totalBudget: number): number {
  if (totalBudget >= 15) return 2;
  if (totalBudget >= 8) return 1;
  return 0;
}

interface Window {
  label: string;
  season: Season;
  start: string;
  end: string;
  /** Only pinned dates may be planned here (the lead window). */
  pinsOnly: boolean;
  pins: string[];
  pinCost: number;
  big?: boolean;
}

interface WindowSolve {
  daysOff: number;
  spent: number;
  result: SolveResult;
}

function emptyResult(input: SolveInput): SolveResult {
  return { primary: [], alternatives: [], budgetSpent: 0, breakCountActual: 0, breakCountRequested: input.breakCount ?? 0, peakCapApplied: false };
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function nextSeasonStart(iso: string): string {
  // Season boundaries are the first of Mar, Jun, Sep, Dec (both hemispheres).
  let [y, m] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7))];
  do {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  } while (![3, 6, 9, 12].includes(m));
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** Calendar season windows covering [start, end]; short fragments merge into a neighbour. */
export function seasonWindows(start: string, end: string, country: string | undefined, minDays: number): { season: Season; start: string; end: string }[] {
  const out: { season: Season; start: string; end: string }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const next = nextSeasonStart(monthStart(cursor));
    const windowEnd = addDays(next, -1) < end ? addDays(next, -1) : end;
    out.push({ season: seasonOfDate(cursor, country), start: cursor, end: windowEnd });
    cursor = next;
  }
  const length = (w: { start: string; end: string }) => isoToSerial(w.end) - isoToSerial(w.start) + 1;
  for (let i = 0; i < out.length && out.length > 1;) {
    if (length(out[i]) >= minDays) { i++; continue; }
    // Merge a short fragment into the longer neighbour, keeping that neighbour's season.
    if (i === 0) { out[1] = { ...out[1], start: out[0].start }; out.splice(0, 1); }
    else if (i === out.length - 1) { out[i - 1] = { ...out[i - 1], end: out[i].end }; out.splice(i, 1); }
    else if (length(out[i - 1]) >= length(out[i + 1])) { out[i - 1] = { ...out[i - 1], end: out[i].end }; out.splice(i, 1); }
    else { out[i + 1] = { ...out[i + 1], start: out[i].start }; out.splice(i, 1); }
  }
  return out;
}

function windowLabel(season: Season, start: string, end: string): string {
  const name = season[0].toUpperCase() + season.slice(1);
  const y1 = start.slice(0, 4);
  const y2 = end.slice(0, 4);
  return y1 === y2 ? `${name} ${y1}` : `${name} ${y1}-${y2.slice(2)}`;
}

function costsPtoFn(input: SolveInput) {
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  const off = new Set(input.offDays);
  return (date: string) => workWeek[mondayIndexedDow(date)] && !off.has(date);
}

function leadDays(options: YearPlanOptions): number {
  const notice = Number.isFinite(options.noticeDays) ? Math.max(0, options.noticeDays) : 0;
  return Math.max(notice, options.minLeadDays) + options.leadBufferDays;
}

/** A break reported up to a window edge may stop partway into a weekend; report the whole
 * absence (free days only, never blackouts), then join breaks that touch. */
function normalizeBreaks(input: SolveInput, breaks: Break[]): Break[] {
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK;
  const off = new Set(input.offDays);
  const blackouts = new Set(input.blackouts ?? []);
  const free = (d: string) => d >= input.rangeStart && d <= input.rangeEnd && !blackouts.has(d)
    && (!workWeek[mondayIndexedDow(d)] || off.has(d));
  const sorted = [...breaks].sort((a, b) => a.start.localeCompare(b.start));
  const out: Break[] = [];
  for (const brk of sorted) {
    let start = brk.start;
    let end = brk.end;
    while (free(addDays(start, -1))) start = addDays(start, -1);
    while (free(addDays(end, 1))) end = addDays(end, 1);
    const extended = start === brk.start && end === brk.end ? brk : rebuild(brk, [brk], start, end);
    const last = out[out.length - 1];
    if (last && extended.start <= addDays(last.end, 1)) {
      const mergedEnd = extended.end > last.end ? extended.end : last.end;
      out[out.length - 1] = rebuild(last, [last, extended], last.start, mergedEnd);
    } else {
      out.push(extended);
    }
  }
  return out;
}

function rebuild(base: Break, parts: Break[], start: string, end: string): Break {
  const days = rangeISO(start, end);
  const ptoCost = parts.reduce((sum, part) => sum + part.ptoCost, 0);
  const demandSum = parts.reduce((sum, part) => sum + part.meanDemand * part.totalDaysOff, 0);
  const demandDays = parts.reduce((sum, part) => sum + part.totalDaysOff, 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ...base,
    id: `${start}|${end}`,
    start,
    end,
    days,
    totalDaysOff: days.length,
    ptoCost,
    multiplier: ptoCost > 0 ? round(days.length / ptoCost) : base.multiplier,
    tags: [...new Set(parts.flatMap((part) => part.tags))],
    meanDemand: demandDays > 0 ? round(demandSum / demandDays) : base.meanDemand,
  };
}

function earnedBy(input: SolveInput, date: string): number {
  return input.accrualPerMonth !== undefined
    ? Math.min(input.budget, monthsElapsed(input.rangeStart, date) * input.accrualPerMonth)
    : input.budget;
}

const NEG = -1;

/**
 * Solve `year` / `season` for a consumer input (budget already net of the person's own
 * reserve). Returns the union plan plus metadata; never throws on bad input.
 */
export function solveYearPlan(input: SolveInput, minimumBreakDays: number, style: 'year' | 'season', overrides: PlanStyleOptions = {}): StyledOutcome {
  const options: YearPlanOptions = { ...DEFAULT_YEAR_PLAN_OPTIONS, ...overrides };
  const base: SolveInput = { ...input, w: options.w, breakCount: 0, minimumBreakDays };
  const fallbackStyle: ConsumerSolveOptions = { minimumBreakDays, style: 'balanced' };
  if (!(input.rangeStart <= input.rangeEnd) || !Number.isFinite(input.budget) || input.budget < 0) {
    return solveConsumer(input, fallbackStyle);
  }
  const costsPto = costsPtoFn(input);
  const required = [...new Set(input.mustIncludeDays ?? [])].filter((d) => d >= input.rangeStart && d <= input.rangeEnd).sort();
  const requiredCost = required.filter(costsPto).length;
  const total = Math.floor(input.budget);
  const autoReserve = options.reserveDays === 'auto'
    ? Math.max(0, autoReserveDays(total + Math.max(0, options.heldReserveDays)) - Math.max(0, options.heldReserveDays))
    : Math.max(0, Math.floor(options.reserveDays));
  // A pinned day always wins over the reserve.
  const reserveKept = Math.max(0, Math.min(autoReserve, total - requiredCost));
  const spendable = Math.max(0, total - reserveKept);
  const notes: string[] = [];

  // Lead window: recommendations start no earlier than this date.
  let leadUntil: string | undefined = addDays(input.rangeStart, leadDays(options));
  if (isoToSerial(input.rangeEnd) - isoToSerial(leadUntil) + 1 < options.minWindowDays) {
    leadUntil = undefined;
    notes.push('The date range is too short to leave time to request leave, so breaks may start right away.');
  }
  const planStart = leadUntil ?? input.rangeStart;
  const seasonal = seasonWindows(planStart, input.rangeEnd, input.country, options.minWindowDays);
  const windows: Window[] = [];
  if (leadUntil && leadUntil > input.rangeStart) {
    const end = addDays(leadUntil, -1);
    windows.push({ label: 'Lead time', season: seasonOfDate(input.rangeStart, input.country), start: input.rangeStart, end, pinsOnly: true, pins: [], pinCost: 0 });
  }
  for (const w of seasonal) windows.push({ ...w, label: windowLabel(w.season, w.start, w.end), pinsOnly: false, pins: [], pinCost: 0 });
  for (const win of windows) {
    win.pins = required.filter((d) => d >= win.start && d <= win.end);
    win.pinCost = win.pins.filter(costsPto).length;
  }

  if (style === 'season') {
    const preferred = windows.filter((w) => !w.pinsOnly && w.season === options.season);
    const length = (w: Window) => isoToSerial(w.end) - isoToSerial(w.start) + 1;
    const big = preferred.find((w) => length(w) >= 45) ?? [...preferred].sort((a, b) => length(b) - length(a))[0];
    if (big) big.big = true;
    else notes.push(`Your dates don't include ${options.season}, so the plan is spread across the seasons it does cover.`);
  }

  const recommendable = windows.filter((w) => !w.pinsOnly);
  // The share is of a year's worth of the balance: over a two-year range no season takes
  // more than half of one year's PTO (this also bounds the work for long ranges).
  const rangeDays = isoToSerial(input.rangeEnd) - isoToSerial(planStart) + 1;
  const perYear = spendable * Math.min(1, 365 / Math.max(1, rangeDays));
  const shareCap = Math.max(Math.ceil(options.maxWindowShare * perYear), Math.ceil(spendable / Math.max(1, recommendable.length)));
  const bigMin = Math.ceil(options.seasonShare * spendable);

  // f[k][b]: best plan for window k with exactly-at-most budget b (null = infeasible).
  const solveWindow = (win: Window, budget: number): WindowSolve | null => {
    const windowInput: SolveInput = {
      ...base,
      rangeStart: win.start,
      rangeEnd: win.end,
      budget,
      accrualPerMonth: undefined,
      expiryDate: undefined,
      carryoverCap: undefined,
      mustIncludeDays: win.pins,
      breakCount: win.big ? 1 : options.windowBreakCount,
      peakCap: input.peakCap?.enabled && input.peakCap.endDate >= win.start && input.peakCap.startDate <= win.end ? input.peakCap : undefined,
    };
    const outcome = solveConsumer(windowInput, { minimumBreakDays });
    // "No break of at least N days fits" is a valid empty window, not a failure.
    if (outcome.issue && outcome.result.primary.length > 0) return null;
    if (outcome.issue && win.pins.length > 0) return null;
    const result = outcome.issue ? emptyResult(windowInput) : outcome.result;
    return { daysOff: result.primary.reduce((s, b) => s + b.totalDaysOff, 0), spent: result.budgetSpent, result };
  };

  const table: (WindowSolve | null)[][] = windows.map((win) => {
    const row: (WindowSolve | null)[] = new Array(spendable + 1).fill(null);
    const lo = win.pinCost;
    const hi = win.pinsOnly ? win.pinCost : Math.min(spendable, Math.max(win.pinCost, win.big ? spendable : shareCap));
    let saturated: WindowSolve | null = null;
    for (let b = lo; b <= hi && b <= spendable; b++) {
      if (win.big && b < Math.min(bigMin, hi) && b !== lo) continue;
      if (saturated) { row[b] = saturated; continue; }
      const solved = solveWindow(win, b);
      row[b] = solved;
      // The engine always spends as much as it can: once it leaves budget unspent, more
      // budget cannot change this window's plan.
      if (solved && solved.spent < b) saturated = solved;
    }
    return row;
  });

  const runDp = (minWithBreaks: number, requireBig: boolean) => {
    const K = windows.length;
    const cap = minWithBreaks;
    // dp[k][b][c] = best days off after k windows, b spent (exact budget index), c windows with breaks (capped).
    type Cell = { daysOff: number; spent: number; pick: number; prevB: number; prevC: number };
    const dp: (Cell | null)[][][] = Array.from({ length: K + 1 }, () => Array.from({ length: spendable + 1 }, () => new Array(cap + 1).fill(null)));
    dp[0][0][0] = { daysOff: 0, spent: 0, pick: NEG, prevB: 0, prevC: 0 };
    for (let k = 0; k < K; k++) {
      const win = windows[k];
      const accrualCap = Math.floor(earnedBy(input, win.end) + 1e-9);
      for (let b = 0; b <= spendable; b++) {
        for (let c = 0; c <= cap; c++) {
          const cell = dp[k][b][c];
          if (!cell) continue;
          for (let x = 0; x + b <= spendable; x++) {
            const option = table[k][x];
            if (!option) continue;
            if (requireBig && win.big && option.result.primary.length === 0) continue;
            const nb = b + x;
            if (nb > accrualCap) break;
            const nc = Math.min(cap, c + (option.result.primary.length > 0 && !win.pinsOnly ? 1 : 0));
            const next = { daysOff: cell.daysOff + option.daysOff, spent: cell.spent + option.spent, pick: x, prevB: b, prevC: c };
            const current = dp[k + 1][nb][nc];
            if (!current || next.daysOff > current.daysOff || (next.daysOff === current.daysOff && next.spent > current.spent)) dp[k + 1][nb][nc] = next;
          }
        }
      }
    }
    let bestB = -1;
    for (let b = 0; b <= spendable; b++) {
      const cell = dp[K][b][cap];
      if (!cell) continue;
      const best = bestB < 0 ? null : dp[K][bestB][cap]!;
      if (!best || cell.daysOff > best.daysOff || (cell.daysOff === best.daysOff && cell.spent > best.spent)) bestB = b;
    }
    if (bestB < 0) return null;
    const picks: number[] = new Array(K).fill(0);
    let b = bestB;
    let c = cap;
    for (let k = K; k > 0; k--) {
      const cell = dp[k][b][c]!;
      picks[k - 1] = cell.pick;
      [b, c] = [cell.prevB, cell.prevC];
    }
    return picks;
  };

  const wantSpread = spendable >= options.minBudgetForSpread;
  const maxWindows = recommendable.length;
  let target = wantSpread ? Math.min(options.minSeasons, maxWindows) : 0;
  const hasBig = windows.some((w) => w.big);
  let picks = runDp(target, hasBig);
  let bigDropped = false;
  if (!picks && hasBig) { picks = runDp(target, false); bigDropped = !!picks; }
  while (!picks && target > 0) {
    target -= 1;
    picks = runDp(target, false);
  }
  if (bigDropped) notes.push(`No single ${options.season} break fits your settings, so the plan is spread out instead.`);
  if (!picks) return fallback(input, minimumBreakDays, style, reserveKept, leadUntil, 'Your settings leave no room to spread breaks across the year, so this is the best balanced plan.');
  if (wantSpread && target < options.minSeasons) {
    notes.push(maxWindows < options.minSeasons
      ? `Your dates cover ${maxWindows === 1 ? 'one season' : `${maxWindows} seasons`}${leadUntil ? ' after leaving time to request leave' : ''}, so breaks can't spread across ${options.minSeasons} seasons.`
      : `Your dates and settings only allow breaks in ${target === 1 ? 'one season' : `${target} seasons`}.`);
  } else if (!wantSpread && maxWindows >= options.minSeasons && spendable > 1) {
    notes.push(`With ${spendable} PTO days to plan, the plan uses them where they go furthest rather than spreading them out.`);
  }

  const chosen = picks.map((x, k) => table[k][x]!);
  const primary = normalizeBreaks(input, chosen.flatMap((w) => w.result.primary));
  const days = primary.flatMap((brk) => brk.days);
  const check = validatePtoDates(input, days);
  if (!check.valid) {
    return fallback(input, minimumBreakDays, style, reserveKept, leadUntil, `Your PTO rules (${check.issue?.replace(/\.$/, '').toLowerCase()}) don't allow a spread-out plan, so this is the best balanced plan.`);
  }
  // Alternatives are per-window substitutions; keep only those whose whole replacement plan
  // is still valid and does not collapse into another break.
  const alternatives: Alternative[] = chosen.flatMap((w) => w.result.alternatives).filter((alternative) => {
    const remaining = primary.filter((brk) => !(brk.start <= alternative.replaces.start && brk.end >= alternative.replaces.end));
    if (remaining.length !== primary.length - 1) return false;
    const replacement = [...remaining, alternative];
    if (replacement.some((a) => replacement.some((b) => a !== b && a.start <= addDays(b.end, 1) && b.start <= addDays(a.end, 1)))) return false;
    return validatePtoDates(input, replacement.flatMap((brk) => brk.days)).valid;
  }).map((alternative) => {
    const replaced = primary.find((brk) => brk.start <= alternative.replaces.start && brk.end >= alternative.replaces.end)!;
    return { ...alternative, replaces: { start: replaced.start, end: replaced.end } };
  });
  const budgetSpent = check.ptoDays.length;
  const result: SolveResult = {
    primary,
    alternatives,
    budgetSpent,
    breakCountActual: primary.length,
    breakCountRequested: 0,
    peakCapApplied: chosen.some((w) => w.result.peakCapApplied),
  };
  const meta: PlanStyleMeta = {
    style,
    reserveKept,
    leadUntil,
    windows: windows.map((win, k) => ({ label: win.label, season: win.season, start: win.start, end: win.end, budget: chosen[k].spent, daysOff: chosen[k].daysOff })),
    seasonsTouched: seasonsTouched(primary, input.country),
    ...(notes.length ? { note: notes.join(' ') } : {}),
  };
  if (primary.length === 0 && minimumBreakDays > 1 && spendable >= 1) {
    return { result, meta, issue: `No break of at least ${minimumBreakDays} consecutive days fits your available PTO and dates. Try a shorter minimum or a wider date range.` };
  }
  return { result, meta };
}

export function seasonsTouched(breaks: readonly Break[], country?: string): Season[] {
  const out: Season[] = [];
  for (const brk of breaks) {
    for (const day of brk.days) {
      const season = seasonOfDate(day, country);
      if (!out.includes(season)) out.push(season);
    }
  }
  return out;
}

/** The balanced whole-range solve, with the reserve and lead window still honoured. */
function fallback(input: SolveInput, minimumBreakDays: number, style: 'year' | 'season', reserveKept: number, leadUntil: string | undefined, note: string): StyledOutcome {
  const required = new Set(input.mustIncludeDays ?? []);
  const leadBlackouts = leadUntil ? rangeISO(input.rangeStart, addDays(leadUntil, -1)).filter((d) => !required.has(d)) : [];
  const attempts: SolveInput[] = [
    { ...input, budget: Math.max(0, input.budget - reserveKept), blackouts: [...new Set([...(input.blackouts ?? []), ...leadBlackouts])] },
    { ...input, budget: Math.max(0, input.budget - reserveKept) },
    input,
  ];
  let last: StyledOutcome | undefined;
  for (const [i, attempt] of attempts.entries()) {
    const outcome = solveConsumer(attempt, { minimumBreakDays, style: 'balanced' });
    // Re-check against the real balance (attempts only ever lower it or add blackouts).
    const valid = !outcome.issue && validatePtoDates(input, outcome.result.primary.flatMap((b) => b.days)).valid;
    last = {
      ...outcome,
      meta: {
        style, reserveKept: i < 2 ? reserveKept : 0, leadUntil: i === 0 ? leadUntil : undefined, windows: [],
        seasonsTouched: seasonsTouched(outcome.result.primary, input.country), note,
      },
    };
    if (valid) return last;
  }
  return last!;
}

/** `max`: most days off. Pure solve at w=0 with no break-count target, via the consumer
 * solver so pins, accrual, expiry and caps are validated exactly like every other style. */
export function solveMaxPlan(input: SolveInput, minimumBreakDays: number): StyledOutcome {
  const outcome = solveConsumer(input, { minimumBreakDays, style: 'max' });
  return {
    ...outcome,
    meta: { style: 'max', reserveKept: 0, windows: [], seasonsTouched: seasonsTouched(outcome.result.primary, input.country) },
  };
}

/** One entry point for every planning style: legacy styles go straight to solveConsumer,
 * unchanged; the year-round styles use the solvers above. */
export function solveStyled(input: SolveInput, options: StyledSolveOptions): StyledOutcome {
  const style: PlanningStyle | undefined = options.style;
  const minimum = options.minimumBreakDays ?? input.minimumBreakDays ?? 0;
  if ((style === 'year' || style === 'season' || style === 'max') && (!Number.isInteger(minimum) || minimum < 0 || minimum > 60)) {
    return solveConsumer(input, options);
  }
  if (style === 'year' || style === 'season') return solveYearPlan(input, minimum, style, options.plan);
  if (style === 'max') return solveMaxPlan(input, minimum);
  return solveConsumer(input, { minimumBreakDays: options.minimumBreakDays, style: options.style });
}
