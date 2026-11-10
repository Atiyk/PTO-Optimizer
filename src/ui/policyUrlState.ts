import type { WorkWeek } from '@daysoff/engine/solver/types';
import { isValidISODate, parseDateList } from './urlState';
import { todayISO } from './today';

/**
 * Stage 4A follow-through (PR-C): URL round-trip for every /policy control, using the same
 * conventions as src/ui/urlState.ts (short keys, '1' for an enabled flag, omit a param at
 * its default rather than writing it every time). A /policy link must reproduce the exact
 * policy described, same as every /pto link already does - this was flagged as PR-B's
 * largest gap and is fixed here.
 */

export type AccrualKind = 'front-loaded' | 'per-pay-period' | 'per-hour-worked' | 'unlimited';
export type PayFrequency = 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly';
export type PlanYearKind = 'calendar' | 'anniversary' | 'custom';
export type CarryoverMode = 'none' | 'capped' | 'all';
export type PayoutOnLeaving = 'pays' | 'doesnt' | 'not-sure';

export interface PolicyURLState {
  workWeek?: WorkWeek;
  subdivision?: string;
  altFridayStart?: string;
  forecastDate?: string;
  currentCarriedBalance?: number;
  unit: 'days' | 'hours';
  hoursPerDay: number;
  accrualKind: AccrualKind;
  amount: number;
  frequency: PayFrequency;
  payDateAnchor: string;
  grantDate: string;
  hourlyRate: number;
  typicalWeeklyHours: number;
  expectedDaysPerYear: number;
  planYearKind: PlanYearKind;
  anniversaryStart: string;
  customResetDate: string;
  accrualCapEnabled: boolean;
  accrualCap: number;
  carryoverMode: CarryoverMode;
  carryoverCap: number;
  carryoverUseByEnabled: boolean;
  carryoverUseBy: string;
  waitingPeriodEnabled: boolean;
  waitingPeriodDays: number;
  negativeBalanceAllowance: number;
  payoutOnLeaving: PayoutOnLeaving;
  currentBalance: number;
  /** An explicit zero is a known balance. Omitted keeps legacy programmatic callers compatible. */
  balanceEntered?: boolean;
  balanceIncludesApprovedLeave?: boolean;
  shiftMinutes?: readonly number[];
  balanceAsOf: string;
  plannedDays: string[];
  country: string;
}

const ACCRUAL_KIND_CODE: Record<AccrualKind, string> = { 'front-loaded': 'fl', 'per-pay-period': 'pp', 'per-hour-worked': 'ph', unlimited: 'ul' };
const ACCRUAL_KIND_FROM_CODE: Record<string, AccrualKind> = { fl: 'front-loaded', pp: 'per-pay-period', ph: 'per-hour-worked', ul: 'unlimited' };

const FREQUENCY_CODE: Record<PayFrequency, string> = { weekly: 'w', biweekly: 'b', 'semi-monthly': 's', monthly: 'm' };
const FREQUENCY_FROM_CODE: Record<string, PayFrequency> = { w: 'weekly', b: 'biweekly', s: 'semi-monthly', m: 'monthly' };

const PLAN_YEAR_CODE: Record<PlanYearKind, string> = { calendar: 'c', anniversary: 'a', custom: 'x' };
const PLAN_YEAR_FROM_CODE: Record<string, PlanYearKind> = { c: 'calendar', a: 'anniversary', x: 'custom' };

const CARRYOVER_CODE: Record<CarryoverMode, string> = { none: 'n', capped: 'c', all: 'a' };
const CARRYOVER_FROM_CODE: Record<string, CarryoverMode> = { n: 'none', c: 'capped', a: 'all' };

const PAYOUT_CODE: Record<PayoutOnLeaving, string> = { pays: 'p', doesnt: 'd', 'not-sure': 'n' };
const PAYOUT_FROM_CODE: Record<string, PayoutOnLeaving> = { p: 'pays', d: 'doesnt', n: 'not-sure' };

function num(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function date(raw: string | null, fallback: string): string {
  return raw && isValidISODate(raw) ? raw : fallback;
}

export function defaultPolicyURLState(): PolicyURLState {
  const today = todayISO();
  return {
    unit: 'days',
    hoursPerDay: 8,
    accrualKind: 'per-pay-period',
    amount: 1.25,
    frequency: 'monthly',
    payDateAnchor: today,
    grantDate: today,
    hourlyRate: 0.0577,
    typicalWeeklyHours: 40,
    expectedDaysPerYear: 15,
    planYearKind: 'calendar',
    anniversaryStart: today,
    customResetDate: `${today.slice(0, 4)}-12-31`,
    accrualCapEnabled: true,
    accrualCap: 20,
    carryoverMode: 'capped',
    carryoverCap: 5,
    carryoverUseByEnabled: false,
    carryoverUseBy: `${today.slice(0, 4)}-03-31`,
    waitingPeriodEnabled: false,
    waitingPeriodDays: 90,
    negativeBalanceAllowance: 0,
    payoutOnLeaving: 'not-sure',
    currentBalance: 12,
    balanceEntered: true,
    balanceAsOf: today,
    plannedDays: [],
    country: 'US',
  };
}

export function readPolicyStateFromURL(search: string, defaultCountry: string, preserveBlank = false): PolicyURLState {
  const params = new URLSearchParams(search);
  const d = defaultPolicyURLState();
  const rawBalance = params.get('cb');
  const rawShifts = params.get('shm');
  const shiftMinutes = rawShifts?.split(',').map(Number);
  const validShifts = rawShifts && /^\d{1,4}(,\d{1,4}){6}$/.test(rawShifts)
    && shiftMinutes?.every(minutes => minutes >= 0 && minutes <= 1440);
  const balanceEntered = rawBalance !== null && rawBalance.trim() !== '' && Number.isFinite(Number(rawBalance));
  const accrualKind = ACCRUAL_KIND_FROM_CODE[params.get('ak') ?? ''] ?? d.accrualKind;
  const readNumber = (key: string, fallback: number) => {
    const raw = params.get(key);
    return preserveBlank && raw === '' ? NaN : num(raw, fallback);
  };
  const readDate = (key: string, fallback: string) => {
    const raw = params.get(key);
    return preserveBlank && raw === '' ? '' : date(raw, fallback);
  };
  const forecastDate = params.get('fd');

  return {
    ...(params.get('ww') && /^[01]{7}$/.test(params.get('ww')!) ? { workWeek: [...params.get('ww')!].map(value => value === '1') as WorkWeek } : {}),
    ...(params.get('sd') && /^[A-Z0-9-]{1,16}$/.test(params.get('sd')!) ? { subdivision: params.get('sd')! } : {}),
    ...(params.get('afs') && isValidISODate(params.get('afs')!) ? { altFridayStart: params.get('afs')! } : {}),
    unit: params.get('u') === '1' ? 'hours' : 'days',
    hoursPerDay: readNumber('hpd', d.hoursPerDay),
    accrualKind,
    amount: readNumber('am', preserveBlank && (accrualKind === 'per-hour-worked' || accrualKind === 'unlimited') ? NaN : d.amount),
    frequency: FREQUENCY_FROM_CODE[params.get('fq') ?? ''] ?? d.frequency,
    payDateAnchor: readDate('pda', preserveBlank && accrualKind !== 'per-pay-period' ? '' : d.payDateAnchor),
    grantDate: readDate('gd', preserveBlank && accrualKind !== 'front-loaded' ? '' : d.grantDate),
    hourlyRate: readNumber('hr', preserveBlank && accrualKind !== 'per-hour-worked' ? NaN : d.hourlyRate),
    typicalWeeklyHours: readNumber('twh', preserveBlank && accrualKind !== 'per-hour-worked' ? NaN : d.typicalWeeklyHours),
    expectedDaysPerYear: num(params.get('edy'), d.expectedDaysPerYear),
    planYearKind: PLAN_YEAR_FROM_CODE[params.get('py') ?? ''] ?? d.planYearKind,
    anniversaryStart: readDate('as', d.anniversaryStart),
    customResetDate: readDate('crd', d.customResetDate),
    accrualCapEnabled: params.get('ace') !== '0',
    accrualCap: readNumber('ac', d.accrualCap),
    carryoverMode: CARRYOVER_FROM_CODE[params.get('cm') ?? ''] ?? d.carryoverMode,
    carryoverCap: readNumber('cc', d.carryoverCap),
    carryoverUseByEnabled: params.get('cue') === '1',
    carryoverUseBy: readDate('cub', d.carryoverUseBy),
    waitingPeriodEnabled: params.get('wpe') === '1',
    waitingPeriodDays: readNumber('wpd', d.waitingPeriodDays),
    negativeBalanceAllowance: readNumber('nba', d.negativeBalanceAllowance),
    payoutOnLeaving: PAYOUT_FROM_CODE[params.get('pol') ?? ''] ?? d.payoutOnLeaving,
    ...(forecastDate !== null && (isValidISODate(forecastDate) || (preserveBlank && forecastDate === '')) ? { forecastDate } : {}),
    ...(params.has('car') ? { currentCarriedBalance: num(params.get('car'), 0) } : {}),
    currentBalance: num(rawBalance, d.currentBalance),
    balanceEntered,
    ...(params.get('bap') === '1' ? { balanceIncludesApprovedLeave: true } : {}),
    ...(validShifts ? { shiftMinutes } : {}),
    balanceAsOf: readDate('bao', d.balanceAsOf),
    plannedDays: parseDateList(params.get('pd')),
    country: params.get('c') || defaultCountry,
  };
}

export function writePolicyStateToURL(params: URLSearchParams, state: PolicyURLState): void {
  const d = defaultPolicyURLState();
  const writeNumber = (key: string, value: number) => params.set(key, Number.isFinite(value) ? String(value) : '');
  if (state.workWeek) params.set('ww', state.workWeek.map(value => value ? '1' : '0').join('')); else params.delete('ww');
  if (state.subdivision) params.set('sd', state.subdivision); else params.delete('sd');
  if (state.altFridayStart && isValidISODate(state.altFridayStart)) params.set('afs', state.altFridayStart); else params.delete('afs');

  if (state.unit === 'hours') params.set('u', '1');
  else params.delete('u');
  if (state.hoursPerDay !== d.hoursPerDay) writeNumber('hpd', state.hoursPerDay);
  else params.delete('hpd');

  params.set('ak', ACCRUAL_KIND_CODE[state.accrualKind]);

  if (state.accrualKind === 'front-loaded') {
    writeNumber('am', state.amount);
    params.set('gd', state.grantDate);
    params.delete('fq');
    params.delete('pda');
  } else if (state.accrualKind === 'per-pay-period') {
    writeNumber('am', state.amount);
    params.set('fq', FREQUENCY_CODE[state.frequency]);
    params.set('pda', state.payDateAnchor);
    params.delete('gd');
  } else if (state.accrualKind === 'per-hour-worked') {
    writeNumber('hr', state.hourlyRate);
    writeNumber('twh', state.typicalWeeklyHours);
    params.delete('am');
    params.delete('fq');
    params.delete('pda');
    params.delete('gd');
  } else {
    params.set('edy', String(state.expectedDaysPerYear));
    params.delete('am');
    params.delete('fq');
    params.delete('pda');
    params.delete('gd');
  }
  if (state.accrualKind !== 'per-hour-worked') {
    params.delete('hr');
    params.delete('twh');
  }
  if (state.accrualKind !== 'unlimited') params.delete('edy');

  if (state.planYearKind !== 'calendar') params.set('py', PLAN_YEAR_CODE[state.planYearKind]);
  else params.delete('py');
  if (state.planYearKind === 'anniversary') params.set('as', state.anniversaryStart);
  else params.delete('as');
  if (state.planYearKind === 'custom') params.set('crd', state.customResetDate);
  else params.delete('crd');

  if (state.accrualKind !== 'unlimited') {
    if (!state.accrualCapEnabled) params.set('ace', '0');
    else params.delete('ace');
    if (state.accrualCapEnabled) writeNumber('ac', state.accrualCap);
    else params.delete('ac');
  } else {
    params.delete('ace');
    params.delete('ac');
  }

  if (state.carryoverMode !== 'capped') params.set('cm', CARRYOVER_CODE[state.carryoverMode]);
  else params.delete('cm');
  if (state.carryoverMode === 'capped') writeNumber('cc', state.carryoverCap);
  else params.delete('cc');
  if ((state.carryoverMode !== 'none' || (state.currentCarriedBalance ?? 0) > 0) && state.carryoverUseByEnabled) {
    params.set('cue', '1');
    params.set('cub', state.carryoverUseBy);
  } else {
    params.delete('cue');
    params.delete('cub');
  }

  if (state.waitingPeriodEnabled) {
    params.set('wpe', '1');
    writeNumber('wpd', state.waitingPeriodDays);
  } else {
    params.delete('wpe');
    params.delete('wpd');
  }

  if (state.negativeBalanceAllowance !== 0) writeNumber('nba', state.negativeBalanceAllowance);
  else params.delete('nba');

  if (state.payoutOnLeaving !== 'not-sure') params.set('pol', PAYOUT_CODE[state.payoutOnLeaving]);
  else params.delete('pol');

  if (state.forecastDate !== undefined && (state.forecastDate === '' || isValidISODate(state.forecastDate))) params.set('fd', state.forecastDate);
  else params.delete('fd');
  if (state.currentCarriedBalance) params.set('car', String(state.currentCarriedBalance));
  else params.delete('car');
  if (state.balanceIncludesApprovedLeave) params.set('bap', '1'); else params.delete('bap');
  if (state.shiftMinutes) params.set('shm', state.shiftMinutes.join(',')); else params.delete('shm');
  if (state.balanceEntered !== false) params.set('cb', String(state.currentBalance));
  else params.delete('cb');
  params.set('bao', state.balanceAsOf);
  if (state.plannedDays.length) params.set('pd', state.plannedDays.join(','));
  else params.delete('pd');

  params.set('c', state.country);
}
