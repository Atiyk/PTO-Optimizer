import type { TimeOffPolicy } from '../policy/model';
import { forecastWithRequests } from './forecast';
import type { PtoRequest } from './requestLedger';

/**
 * Consumer-only, local-first company-policy payout scenarios.
 * This module makes NO claim about legally required payout. Mandatory-law scenarios
 * must be added only through a separately reviewed, source-backed jurisdiction registry.
 */
export type LeaveCategory = 'vacation' | 'sick' | 'personal' | 'other';
export type CompanyPayoutRule =
  | { kind: 'pays-all' }
  | { kind: 'pays-none' }
  | { kind: 'pays-up-to'; cap: number }
  | { kind: 'unknown' };

export type GrossPayInput =
  | { kind: 'hourly'; hourlyRate: number }
  | { kind: 'annual'; annualSalary: number; annualWorkHours: number };

export interface PayoutLineInput {
  category: LeaveCategory;
  /** One independent policy/balance per leave category; never pool sick and vacation. */
  policy: TimeOffPolicy;
  /** Ledger entries must be scoped to THIS category by the caller. The current ledger
   * has no leave-category field, so never reuse an unfiltered ledger for multiple lines. */
  requests?: readonly PtoRequest[];
  /** Explicit employer assumption, not an assertion of enforceable entitlement. */
  companyRule: CompanyPayoutRule;
}

export interface DeparturePayoutInput {
  departureDate: string;
  /** Work location for later source-backed legal review, not an inferred legal rule. */
  workJurisdiction: string;
  currency: string;
  pay: GrossPayInput;
  lines: readonly PayoutLineInput[];
  separation?: 'voluntary' | 'involuntary' | 'unknown';
}

export interface PayoutLineResult {
  category: LeaveCategory;
  unit: 'days' | 'hours';
  projectedBalance: number;
  /** Positive unused bank; a negative forecast is not a payable balance. */
  unusedUnits: number;
  unusedHours: number;
  payableUnits: number | null;
  payableHours: number | null;
  companyGrossCents: number | null;
  companyRule: CompanyPayoutRule;
  status: 'estimated' | 'company-rule-unknown' | 'unsupported-unlimited';
  forecast: {
    accrued: number;
    scheduled: number;
    expired: number;
    lostAccrual: number;
    unfunded: number;
  };
  /** Explicitly unresolved until applicable primary sources have been reviewed. */
  legal: { status: 'not-verified'; mandatoryGrossCents: null };
}

export interface DeparturePayoutResult {
  departureDate: string;
  workJurisdiction: string;
  currency: string;
  hourlyRate: number;
  lines: PayoutLineResult[];
  /** Null when ANY leave category has unknown or unsupported payout. */
  totalCompanyGrossCents: number | null;
  /** Partial sum is not an estimate for unknown categories. */
  knownCompanyGrossCents: number;
  unresolvedCategories: LeaveCategory[];
  legal: { status: 'not-verified'; mandatoryGrossCents: null; comparisonCents: null };
  warnings: string[];
}

const MAX_LINES = 4;
const MAX_AMOUNT = 1_000_000_000;
const MAX_UNITS = 1_000_000;
const CATEGORIES: readonly LeaveCategory[] = ['vacation', 'sick', 'personal', 'other'];

function validNumber(value: number, max: number, allowZero = true): boolean {
  return Number.isFinite(value) && value <= max && (allowZero ? value >= 0 : value > 0);
}

function hourlyRate(input: GrossPayInput): number | null {
  if (input.kind === 'hourly') {
    return validNumber(input.hourlyRate, MAX_AMOUNT, false) ? input.hourlyRate : null;
  }
  if (input.kind === 'annual') {
    if (!validNumber(input.annualSalary, MAX_AMOUNT, false)
      || !validNumber(input.annualWorkHours, 10_000, false)) return null;
    return input.annualSalary / input.annualWorkHours;
  }
  return null;
}

function centsForHours(hours: number, rate: number): number | null {
  const cents = Math.round(hours * rate * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

/**
 * Forecast is delegated to the existing policy/ledger engine. Approved and completed
 * leave already reflected in the as-of balance is NOT deducted again; tentative leave
 * remains separate. No calendar, salary or policy text is persisted or added to a URL.
 */
export function estimateDeparturePayout(input: DeparturePayoutInput): DeparturePayoutResult | null {
  if (!input || !Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > MAX_LINES
    || typeof input.workJurisdiction !== 'string' || !input.workJurisdiction.trim()
    || input.workJurisdiction.length > 120
    || !/^[A-Z]{3}$/.test(input.currency)
    || (input.separation !== undefined && !['voluntary', 'involuntary', 'unknown'].includes(input.separation))) return null;

  const rate = hourlyRate(input.pay);
  if (rate === null) return null;

  const seen = new Set<LeaveCategory>();
  const lines: PayoutLineResult[] = [];
  const warnings: string[] = [];
  for (const line of input.lines) {
    if (!line || !CATEGORIES.includes(line.category) || seen.has(line.category)
      || !line.policy || !line.companyRule || !['pays-all', 'pays-none', 'pays-up-to', 'unknown'].includes(line.companyRule.kind)
      || (line.companyRule.kind === 'pays-up-to' && !validNumber(line.companyRule.cap, MAX_UNITS))
      || !validNumber(line.policy.hoursPerDay, 24, false)
      || (line.requests !== undefined && !Array.isArray(line.requests))) return null;
    seen.add(line.category);
    const forecast = forecastWithRequests(line.policy, input.departureDate, line.requests ?? []);
    if (!forecast) return null;
    const confirmed = forecast.confirmed;
    const projectedBalance = confirmed.balance;
    const unlimited = projectedBalance === null;
    if (!unlimited && !validNumber(Math.abs(projectedBalance), MAX_UNITS)) return null;

    const unusedUnits = unlimited ? 0 : Math.max(0, projectedBalance);
    const unusedHours = line.policy.unit === 'days' ? unusedUnits * line.policy.hoursPerDay : unusedUnits;
    const companyRule = line.companyRule;
    const payableUnits = unlimited || companyRule.kind === 'unknown' ? null
      : companyRule.kind === 'pays-none' ? 0
      : companyRule.kind === 'pays-up-to' ? Math.min(unusedUnits, companyRule.cap)
      : unusedUnits;
    const payableHours = payableUnits === null ? null
      : line.policy.unit === 'days' ? payableUnits * line.policy.hoursPerDay : payableUnits;
    const companyGrossCents = payableHours === null ? null : centsForHours(payableHours, rate);
    if (companyGrossCents === null && payableHours !== null) return null;
    const status: PayoutLineResult['status'] = unlimited ? 'unsupported-unlimited'
      : companyRule.kind === 'unknown' ? 'company-rule-unknown' : 'estimated';

    if (unlimited) warnings.push(`${line.category}: unlimited leave has no banked cash balance to estimate.`);
    if (companyRule.kind === 'unknown') warnings.push(`${line.category}: employer payout policy is unknown.`);
    if (confirmed.unfunded > 0) warnings.push(`${line.category}: planned leave exceeds available projected balance.`);

    lines.push({
      category: line.category, unit: line.policy.unit, projectedBalance: projectedBalance ?? 0,
      unusedUnits, unusedHours, payableUnits, payableHours, companyGrossCents, companyRule, status,
      forecast: {
        accrued: confirmed.accrued, scheduled: confirmed.scheduled, expired: confirmed.expired,
        lostAccrual: confirmed.lostAccrual, unfunded: confirmed.unfunded,
      },
      legal: { status: 'not-verified', mandatoryGrossCents: null },
    });
  }
  const unresolvedCategories = lines.filter((line) => line.companyGrossCents === null).map((line) => line.category);
  const knownCompanyGrossCents = lines.reduce((sum, line) => sum + (line.companyGrossCents ?? 0), 0);
  if (!Number.isSafeInteger(knownCompanyGrossCents)) return null;
  warnings.push('Employer-policy scenarios are assumptions, not legal entitlement or guaranteed payroll. Confirm leave type, payout eligibility and separation terms with HR.');
  warnings.push('Mandatory payout law has not been verified for this work jurisdiction. No legal comparison or tax take-home estimate is provided.');
  return {
    departureDate: input.departureDate, workJurisdiction: input.workJurisdiction,
    currency: input.currency, hourlyRate: rate, lines,
    totalCompanyGrossCents: unresolvedCategories.length ? null : knownCompanyGrossCents,
    knownCompanyGrossCents, unresolvedCategories,
    legal: { status: 'not-verified', mandatoryGrossCents: null, comparisonCents: null },
    warnings,
  };
}
