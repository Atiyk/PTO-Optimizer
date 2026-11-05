import type { ISODate, SolveInput, WorkWeek } from '@daysoff/engine/solver/types';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { formatShort, formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { solveLegacyConsumer } from '../planning/optimizer';
import { solveWithPinFallback } from '../ui/pinPreview';
import { isValidISODate, readFullStateFromURL } from '../ui/urlState';
import { policyFromLegacyPtoState, toLegacySolverFields, waitingPeriodEnd, type TimeOffPolicy } from '../policy/model';
import { expirationRisks, type ExpirationRisk, type ReminderSuggestion } from './expiration';
import { forecastWithRequests } from './forecast';
import { requestDatesForScenario, type PtoRequest, type RequestCalendar } from './requestLedger';

/**
 * F3 expiry rescue: a ready-made plan for one expiration risk. Nothing here is a second
 * policy calculator or a second solver:
 * - the window and budget come from expirationRisks() (planning start, deadline, the
 *   whole days actually earned and free after scheduled leave);
 * - the dates come from the same consumer optimizer call the /pto planner makes for the
 *   risk's own /pto link (readFullStateFromURL -> SolveInput -> solveLegacyConsumer);
 * - "days rescued" is measured by re-running expirationRisks() with the suggested dates
 *   scheduled, so the figure is whatever the policy projection says, not an estimate.
 * Pure and deterministic for a given `today`; holidays arrive through `calendar`.
 */

export type RescueShortfallReason = 'deadline' | 'not-earned' | 'blackout' | 'waiting-period' | 'partial-day' | 'no-placement';

export interface RescueBreak {
  start: ISODate;
  end: ISODate;
  /** Working days in the break that cost PTO, chronological. */
  ptoDates: ISODate[];
  ptoDays: number;
  /** Calendar days off in a row, including weekends and holidays. */
  totalDaysOff: number;
}

export interface RescueShortfall {
  /** Days (in day units, even for an hours policy) the plan cannot keep. */
  days: number;
  reason: RescueShortfallReason;
  message: string;
}

export interface RescuePlan {
  riskId: string;
  kind: ExpirationRisk['kind'];
  deadline: ISODate;
  /** Inclusive planning window the optimizer searched, or null when nothing could be searched. */
  window: { start: ISODate; end: ISODate } | null;
  breaks: RescueBreak[];
  ptoDates: ISODate[];
  ptoDays: number;
  totalDaysOff: number;
  /** What the risk puts at stake, in days. */
  daysAtRisk: number;
  /** daysAtRisk minus what the policy projection still loses with the plan scheduled. */
  daysRescued: number;
  daysStillAtRisk: number;
  shortfall?: RescueShortfall;
  /** /pto link that opens the same window, budget and reserved dates in the planner. */
  ptoHref: string;
  /** The policy's own unit, so text can say "40 hours" for an hours policy. */
  unit: 'days' | 'hours';
  hoursPerDay: number;
}

export interface RescueContext {
  policy: TimeOffPolicy;
  /** The /policy page's country. */
  country: string;
  requests?: readonly PtoRequest[];
  /** Employer work week and observed days off (public holidays etc.) covering the window. */
  calendar: RequestCalendar & { subdivision?: string };
  today: ISODate;
}

const EPS = 1e-9;
const sameWorkWeek = (a: WorkWeek, b: WorkWeek) => a.every((day, index) => day === b[index]);

function plural(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value);
}

/** "Dec 22–24", "Nov 30–Dec 2", "Dec 30, 2026–Jan 2, 2027", or "Dec 22". `dash` lets
 * calendar text use a plain ASCII hyphen, which keeps RFC 5545 line folding byte-safe. */
export function formatRescueRange(start: ISODate, end: ISODate, dash = '–'): string {
  if (start === end) return formatShort(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${formatShortWithYear(start)}${dash}${formatShortWithYear(end)}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${formatShort(start)}${dash}${Number(end.slice(8, 10))}`;
  return `${formatShort(start)}${dash}${formatShort(end)}`;
}

/** The SolveInput the /pto planner builds from this link, with the caller's calendar as
 * its holidays. Mirrors useAppState's construction for the params a rescue link carries. */
function solveInputFromPtoSearch(search: string, calendar: RequestCalendar, country: string, deadline: ISODate): { input: SolveInput; state: ReturnType<typeof readFullStateFromURL> } {
  const state = readFullStateFromURL(search, { rangeStart: deadline, rangeEnd: deadline, budget: 0, country });
  const fields = toLegacySolverFields(policyFromLegacyPtoState({
    budget: state.budget, accrualEnabled: state.accrualEnabled, accrualPerMonth: state.accrualPerMonth,
    expiryEnabled: state.expiryEnabled, expiryDate: state.expiryDate, carryoverCap: state.carryoverCap, rangeStart: state.rangeStart,
  }), state.rangeStart);
  const offDays = [...new Set(calendar.offDays)].filter((date) => date >= state.rangeStart && date <= state.rangeEnd).sort();
  const input: SolveInput = {
    offDays,
    rangeStart: state.rangeStart,
    rangeEnd: state.rangeEnd,
    budget: Math.max(0, state.budget - state.reserveDays),
    accrualPerMonth: fields.accrualPerMonth,
    expiryDate: fields.expiryDate,
    carryoverCap: fields.carryoverCap,
    blackouts: [...new Set([...state.blackouts, ...state.ruledOutDays])],
    mustIncludeDays: state.pinnedDays,
    overlapDays: state.overlapDays,
    workWeek: state.workWeek,
    country: state.country,
    w: state.w,
    breakCount: state.breakCount,
  };
  return { input, state };
}

function emptyPlan(risk: ExpirationRisk, policy: TimeOffPolicy, ptoHref: string, window: RescuePlan['window'], shortfall?: RescueShortfall): RescuePlan {
  return {
    riskId: risk.id, kind: risk.kind, deadline: risk.deadline, window, breaks: [], ptoDates: [], ptoDays: 0, totalDaysOff: 0,
    daysAtRisk: risk.daysAtStake, daysRescued: 0, daysStillAtRisk: risk.daysAtStake, ...(shortfall ? { shortfall } : {}), ptoHref,
    unit: policy.unit, hoursPerDay: policy.hoursPerDay,
  };
}

/** "3 days" or, for an hours policy, "24 hours". Values are always passed in days. */
export function rescueAmount(plan: Pick<RescuePlan, 'unit' | 'hoursPerDay'>, days: number): string {
  if (plan.unit === 'hours') {
    const hours = Math.round(days * plan.hoursPerDay * 100) / 100;
    return `${formatAmount(hours)} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${formatAmount(days)} ${days === 1 ? 'day' : 'days'}`;
}

function shortfallMessage(reason: RescueShortfallReason, detail: { deadline: ISODate; workingDays: number; waitingEnds?: ISODate; availableFrom?: ISODate }): string {
  const deadline = formatShortWithYear(detail.deadline);
  switch (reason) {
    case 'deadline':
      return detail.workingDays === 0
        ? `The deadline is too close: no working days are left to book before ${deadline}.`
        : `The deadline is too close: only ${plural(detail.workingDays, 'working day is', 'working days are')} left to book before ${deadline}.`;
    case 'not-earned':
      return detail.availableFrom
        ? `This PTO is only earned on ${formatShortWithYear(detail.availableFrom)}, leaving ${plural(detail.workingDays, 'working day', 'working days')} to book before ${deadline}.`
        : `Not enough of this PTO is earned and free before ${deadline} once your scheduled leave is reserved.`;
    case 'blackout':
      return `Your scheduled leave and unavailable days already fill the working days left before ${deadline}.`;
    case 'waiting-period':
      return `Your waiting period ends ${detail.waitingEnds ? formatShortWithYear(detail.waitingEnds) : 'too late'}, after the last day to use this PTO.`;
    case 'partial-day':
      return 'Less than one whole day is left, and plans book whole PTO days only.';
    case 'no-placement':
      return `The planner could not place these days before ${deadline} under your holidays and work week.`;
  }
}

/** Matching risk after the plan is scheduled. A cap that moves to a later date is a new
 * risk, not this one, so only the same id counts as still at risk. */
function remainingAtRisk(risk: ExpirationRisk, ctx: RescueContext, extraDates: readonly ISODate[]): number {
  if (extraDates.length === 0) return risk.daysAtStake;
  const scheduled = { ...ctx.policy, plannedDays: [...new Set([...ctx.policy.plannedDays, ...extraDates])].sort() };
  const after = expirationRisks(scheduled, ctx.country, ctx.requests ?? [], ctx.today).find((next) => next.id === risk.id);
  return after ? Math.max(0, after.daysAtStake) : 0;
}

export function rescuePlan(risk: ExpirationRisk, ctx: RescueContext): RescuePlan {
  const { calendar, today } = ctx;
  const requests = ctx.requests ?? [];
  const workWeek = calendar.workWeek ?? DEFAULT_WORK_WEEK;
  const params = new URLSearchParams(risk.ptoHref.split('?')[1] ?? '');
  // Pending (planned or requested) leave is not spent in the confirmed forecast, but a
  // rescue must not double-book those dates. Reserve them as unavailable in the link too.
  const tentative = requestDatesForScenario(requests, today, risk.deadline, true);
  const blackouts = [...new Set([...(params.get('bo')?.split(',').filter(isValidISODate) ?? []), ...tentative])].sort();
  if (blackouts.length) params.set('bo', blackouts.join(',')); else params.delete('bo');
  if (!sameWorkWeek(workWeek, DEFAULT_WORK_WEEK)) params.set('ww', workWeek.map((day) => day ? '1' : '0').join(''));
  if (calendar.subdivision) params.set('sd', calendar.subdivision);
  const ptoHref = `/pto?${params.toString()}`;

  const perDay = ctx.policy.unit === 'hours' ? ctx.policy.hoursPerDay : 1;
  const wanted = risk.kind === 'cap' ? Math.max(1, Math.ceil(risk.daysAtStake - EPS)) : Math.floor(risk.daysAtStake + EPS);
  const windowStart = params.get('s') && isValidISODate(params.get('s')!) ? params.get('s')! : today;
  const window = windowStart <= risk.deadline ? { start: windowStart, end: risk.deadline } : null;
  const off = new Set(calendar.offDays);
  const blocked = new Set(blackouts);
  const workingDays = window ? rangeISO(window.start, window.end).filter((date) => workWeek[mondayIndexedDow(date)] && !off.has(date)) : [];
  const freeDays = workingDays.filter((date) => !blocked.has(date));
  const waitingEnds = waitingPeriodEnd(ctx.policy);
  // A window that opens after today because the balance is earned later (not because a
  // carried bank only exists after its reset) is an earning problem, not a close deadline.
  const lateEarning = risk.kind !== 'carryover' && windowStart > today;
  const workingFromToday = today <= risk.deadline
    ? rangeISO(today, risk.deadline).filter((date) => workWeek[mondayIndexedDow(date)] && !off.has(date) && !blocked.has(date)).length : 0;
  const detail = { deadline: risk.deadline, workingDays: freeDays.length, waitingEnds, ...(lateEarning ? { availableFrom: windowStart } : {}) };

  const classify = (missingWhole: number, remaining: number, spent: number): RescueShortfallReason => {
    if (waitingEnds && waitingEnds > risk.deadline) return 'waiting-period';
    if (missingWhole <= 0 && remaining > EPS) return 'partial-day';
    const needed = spent + missingWhole;
    if (lateEarning && workingDays.length < needed && workingFromToday >= needed) return 'not-earned';
    if (workingDays.length < needed) return 'deadline';
    if (freeDays.length < needed) return 'blackout';
    if (risk.planningBudget < wanted) return 'not-earned';
    return 'no-placement';
  };
  const shortfallFor = (remaining: number, spent: number): RescueShortfall => {
    const missingWhole = Math.max(0, wanted - spent);
    const reason = classify(missingWhole, remaining, spent);
    return { days: remaining, reason, message: shortfallMessage(reason, detail) };
  };

  if (!risk.canPlan || !window || risk.planningBudget < 1) {
    return emptyPlan(risk, ctx.policy, ptoHref, window, shortfallFor(risk.daysAtStake, 0));
  }

  const { input, state } = solveInputFromPtoSearch(params.toString(), calendar, ctx.country, risk.deadline);
  // The rescue spends at most the risk's own budget, in the planner's own whole-day units.
  input.budget = Math.min(input.budget, risk.planningBudget);
  input.blackouts = [...new Set([...(input.blackouts ?? []), ...blackouts])];
  input.workWeek = workWeek;
  let outcome;
  try {
    outcome = state.planningVersion === 2
      ? solveWithPinFallback(input, { minimumBreakDays: state.minimumBreakDays, style: state.planningStyle })
      : solveLegacyConsumer(input);
  } catch {
    return emptyPlan(risk, ctx.policy, ptoHref, window, shortfallFor(risk.daysAtStake, 0));
  }

  const costsPto = (date: ISODate) => workWeek[mondayIndexedDow(date)] && !off.has(date);
  const breaks: RescueBreak[] = outcome.result.primary
    .map((brk) => {
      const ptoDates = [...new Set(brk.days)].filter(costsPto).sort();
      return { start: brk.start, end: brk.end, ptoDates, ptoDays: ptoDates.length, totalDaysOff: brk.totalDaysOff };
    })
    .filter((brk) => brk.ptoDays > 0)
    .sort((a, b) => a.start.localeCompare(b.start))
    // The solver can return touching breaks (Dec 29, Dec 30, Dec 31). They are one
    // stretch of time off on a real calendar, so present them as one.
    .reduce<RescueBreak[]>((merged, brk) => {
      const last = merged.at(-1);
      if (last && addDays(last.end, 1) >= brk.start) {
        merged[merged.length - 1] = {
          start: last.start, end: brk.end > last.end ? brk.end : last.end,
          ptoDates: [...new Set([...last.ptoDates, ...brk.ptoDates])].sort(),
          ptoDays: 0, totalDaysOff: 0,
        };
        const joined = merged[merged.length - 1];
        joined.ptoDays = joined.ptoDates.length;
        joined.totalDaysOff = rangeISO(joined.start, joined.end).length;
      } else merged.push(brk);
      return merged;
    }, []);
  const ptoDates = [...new Set(breaks.flatMap((brk) => brk.ptoDates))].sort();

  // Safety: the suggestion must stay funded under the exact policy projection, and must
  // never touch a reserved date. Otherwise show nothing rather than an unsafe plan.
  const scheduled = { ...ctx.policy, plannedDays: [...new Set([...ctx.policy.plannedDays, ...ptoDates])].sort() };
  const funded = forecastWithRequests(scheduled, risk.deadline, requests)?.confirmed;
  if (ptoDates.length === 0 || ptoDates.some((date) => blocked.has(date) || date < window.start || date > window.end)
    || !funded || funded.unfunded > EPS * perDay) {
    return emptyPlan(risk, ctx.policy, ptoHref, window, shortfallFor(risk.daysAtStake, 0));
  }

  const stillAtRisk = remainingAtRisk(risk, ctx, ptoDates);
  const daysStillAtRisk = Math.round(stillAtRisk * 1e6) / 1e6;
  const daysRescued = Math.max(0, Math.round((risk.daysAtStake - stillAtRisk) * 1e6) / 1e6);
  return {
    riskId: risk.id, kind: risk.kind, deadline: risk.deadline, window, breaks, ptoDates, ptoDays: ptoDates.length,
    totalDaysOff: breaks.reduce((sum, brk) => sum + brk.totalDaysOff, 0),
    daysAtRisk: risk.daysAtStake, daysRescued, daysStillAtRisk,
    ...(daysStillAtRisk > EPS ? { shortfall: shortfallFor(daysStillAtRisk, ptoDates.length) } : {}),
    ptoHref, unit: ctx.policy.unit, hoursPerDay: ctx.policy.hoursPerDay,
  };
}

/**
 * Plans every risk in deadline order. A later risk is re-read with the earlier plans
 * scheduled, so two rescues never book the same day or count the same balance twice;
 * a risk an earlier plan already resolves gets no dates of its own.
 */
export function rescuePlans(risks: readonly ExpirationRisk[], ctx: RescueContext): Map<string, RescuePlan> {
  const plans = new Map<string, RescuePlan>();
  const booked: ISODate[] = [];
  for (const risk of [...risks].sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id))) {
    if (booked.length === 0) {
      const plan = rescuePlan(risk, ctx);
      plans.set(risk.id, plan);
      booked.push(...plan.ptoDates);
      continue;
    }
    const policy = { ...ctx.policy, plannedDays: [...new Set([...ctx.policy.plannedDays, ...booked])].sort() };
    const current = expirationRisks(policy, ctx.country, ctx.requests ?? [], ctx.today).find((next) => next.id === risk.id);
    if (!current) {
      plans.set(risk.id, { ...emptyPlan(risk, ctx.policy, risk.ptoHref, null), daysRescued: risk.daysAtStake, daysStillAtRisk: 0 });
      continue;
    }
    const plan = rescuePlan(current, { ...ctx, policy });
    // Report against the risk as the person sees it: earlier plans' effect counts too.
    const daysRescued = Math.max(0, Math.round((risk.daysAtStake - plan.daysStillAtRisk) * 1e6) / 1e6);
    plans.set(risk.id, { ...plan, daysAtRisk: risk.daysAtStake, daysRescued });
    booked.push(...plan.ptoDates);
  }
  return plans;
}

function joinList(parts: readonly string[]): string {
  return parts.length <= 1 ? parts[0] ?? '' : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function keepText(plan: RescuePlan): string {
  if (plan.daysStillAtRisk > EPS) {
    const of = rescueAmount(plan, plan.daysAtRisk);
    return `keep ${plan.unit === 'hours' ? formatAmount(Math.round(plan.daysRescued * plan.hoursPerDay * 100) / 100) : formatAmount(plan.daysRescued)} of ${of}`;
  }
  if (plan.unit === 'days' && plan.daysAtRisk === 1) return 'keep that day';
  if (plan.unit === 'days' && plan.daysAtRisk === 2) return 'keep both days';
  return `keep all ${rescueAmount(plan, plan.daysAtRisk)}`;
}

/** One sentence for the expiration guard:
 * "Take Dec 22–24 (3 PTO days) for 9 days off and keep all 3 days." */
export function rescueSentence(plan: RescuePlan): string {
  if (plan.breaks.length === 0) return '';
  const capDone = plan.daysStillAtRisk <= EPS;
  if (plan.breaks.length === 1) {
    const [brk] = plan.breaks;
    const lead = `Take ${formatRescueRange(brk.start, brk.end)} (${plural(brk.ptoDays, 'PTO day', 'PTO days')}) for ${plural(brk.totalDaysOff, 'day', 'days')} off`;
    if (plan.kind === 'cap') return `${lead} to make room under your accrual cap${capDone ? ' and keep earning' : ''}.`;
    return `${lead} and ${keepText(plan)}.`;
  }
  const parts = plan.breaks.map((brk) => `${formatRescueRange(brk.start, brk.end)} (${plural(brk.ptoDays, 'PTO day', 'PTO days')}, ${plural(brk.totalDaysOff, 'day', 'days')} off)`);
  if (plan.kind === 'cap') return `Take ${joinList(parts)} to make room under your accrual cap${capDone ? ' and keep earning' : ''}.`;
  return `Take ${joinList(parts)} to ${keepText(plan)}.`;
}

/** Calendar text per break: "Dec 22-24 (3 PTO days)". ASCII only, for byte-safe folding. */
export function rescueSuggestionParts(plan: RescuePlan): ReminderSuggestion[] {
  return plan.breaks.map((brk) => ({ start: brk.start, text: `${formatRescueRange(brk.start, brk.end, '-')} (${plural(brk.ptoDays, 'PTO day', 'PTO days')})` }));
}

/** "Suggested: take Dec 22-24 (3 PTO days)." */
export function rescueSuggestionText(plan: RescuePlan): string {
  const parts = rescueSuggestionParts(plan).map((part) => part.text);
  return parts.length ? `Suggested: take ${joinList(parts)}.` : '';
}

/** Map for expirationReminders(): risk id -> suggested breaks. */
export function rescueSuggestions(plans: ReadonlyMap<string, RescuePlan>): Record<string, ReminderSuggestion[]> {
  const result: Record<string, ReminderSuggestion[]> = {};
  for (const [id, plan] of plans) if (plan.breaks.length) result[id] = rescueSuggestionParts(plan);
  return result;
}
