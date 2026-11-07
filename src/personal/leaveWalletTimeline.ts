import type { ISODate } from '@daysoff/engine/solver/types';
import type { PolicyEvent } from '../policy/projection';
import { forecastWithRequests } from './forecast';
import { projectLeaveWallet, type LeaveBank } from './leaveWallet';
import type { PtoRequest } from './requestLedger';

export type WalletEventCategory = 'opening' | 'earned' | 'approved-debit' | 'carryover' | 'expiration' | 'cap-loss' | 'reset' | 'waiting-period-ended';
export interface WalletEvent {
  id: string;
  leaveBankId: string;
  effectiveDate: ISODate;
  category: WalletEventCategory;
  amount: number;
  unit: 'days' | 'hours';
  sourceRef: string;
  provenance: 'policy-projection' | 'opening-balance';
}
export interface WalletTimelinePoint {
  date: ISODate;
  bankId: string;
  confirmedBalance: number | null;
  tentativeBalance: number | null;
  tentativeAdditionalDebit: number;
}
export interface WalletTimeline {
  through: ISODate;
  events: WalletEvent[];
  points: WalletTimelinePoint[];
  nextEvents: Record<string, WalletEvent | null>;
}
function classify(event: PolicyEvent): WalletEventCategory {
  switch (event.kind) {
    case 'accrual-credited': return 'earned';
    case 'planned-day-taken': return 'approved-debit';
    case 'carryover-applied': return 'carryover';
    case 'forfeited': case 'carried-days-expiring': return 'expiration';
    case 'cap-reached': return 'cap-loss';
    case 'reset': return 'reset';
    case 'waiting-period-ended': return 'waiting-period-ended';
  }
}
function value(event: PolicyEvent, spend: number): number {
  switch (event.kind) {
    case 'accrual-credited': return event.amount;
    case 'planned-day-taken': return -spend;
    case 'carryover-applied': return event.carried;
    case 'forfeited': case 'carried-days-expiring': return -event.amount;
    case 'cap-reached': return -event.lost;
    default: return 0;
  }
}
/** Deterministic date-specific balances and event trace; canonical forecast owns all arithmetic. */
export function projectWalletTimeline(
  banks: readonly LeaveBank[], through: ISODate, requests: readonly PtoRequest[] = [],
): WalletTimeline | null {
  const wallet = projectLeaveWallet(banks, through, requests);
  if (!wallet) return null;
  const events: WalletEvent[] = [];
  const points: WalletTimelinePoint[] = [];
  const nextEvents: Record<string, WalletEvent | null> = {};
  for (const snapshot of wallet.banks) {
    const bank = banks.find((candidate) => candidate.id === snapshot.id);
    if (!bank) return null;
    const linked = requests.filter((request) => bank.requestIds.includes(request.id));
    const forecast = forecastWithRequests(bank.policy, through, linked);
    if (!forecast) return null;
    const spend = bank.policy.unit === 'hours' ? bank.policy.hoursPerDay : 1;
    events.push({
      id: bank.id + ':opening:' + snapshot.asOf, leaveBankId: bank.id,
      effectiveDate: snapshot.asOf, category: 'opening',
      amount: snapshot.openingBalance ?? 0, unit: snapshot.unit,
      sourceRef: 'policy:balanceAsOf', provenance: 'opening-balance',
    });
    forecast.confirmed.events.forEach((event, index) => {
      events.push({
        id: bank.id + ':' + event.date + ':' + index, leaveBankId: bank.id,
        effectiveDate: event.date, category: classify(event), amount: value(event, spend),
        unit: snapshot.unit, sourceRef: 'policy:' + event.kind, provenance: 'policy-projection',
      });
    });
    const tentativeByDate = new Map(forecast.tentative.series.map((point) => [point.date, point.balance]));
    for (const point of forecast.confirmed.series) {
      const tentative = tentativeByDate.get(point.date);
      if (tentative === undefined) return null;
      points.push({
        date: point.date, bankId: bank.id,
        confirmedBalance: bank.policy.accrual.kind === 'unlimited' ? null : point.balance,
        tentativeBalance: bank.policy.accrual.kind === 'unlimited' ? null : tentative,
        tentativeAdditionalDebit: bank.policy.accrual.kind === 'unlimited' ? 0 : Math.max(0, point.balance - tentative),
      });
    }
    nextEvents[bank.id] = events.find((event) =>
      event.leaveBankId === bank.id && event.effectiveDate > snapshot.asOf && event.category !== 'opening') ?? null;
  }
  events.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)
    || a.leaveBankId.localeCompare(b.leaveBankId) || a.id.localeCompare(b.id));
  points.sort((a, b) => a.date.localeCompare(b.date) || a.bankId.localeCompare(b.bankId));
  return { through, events, points, nextEvents };
}

function validSelectorDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/**
 * Read an exact date-only snapshot from an already projected timeline.
 * Never interpolate a missing day or add balances across different units.
 * Callers must project through the requested date first.
 */
export function selectWalletBalancesAsOf(
  timeline: WalletTimeline,
  asOf: ISODate,
): WalletTimelinePoint[] | null {
  if (!validSelectorDate(asOf) || asOf > timeline.through) return null;
  const selected = timeline.points.filter((point) => point.date === asOf);
  if (!selected.length) return null;
  const bankIds = new Set<string>();
  for (const point of selected) {
    if (bankIds.has(point.bankId)) return null;
    bankIds.add(point.bankId);
  }
  return selected.map((point) => ({ ...point }));
}

/** The next *actual* canonical event strictly after a chosen date, per bank. */
export function selectWalletNextEvents(
  timeline: WalletTimeline,
  after: ISODate,
): Record<string, WalletEvent | null> | null {
  if (!validSelectorDate(after) || after > timeline.through) return null;
  const next: Record<string, WalletEvent | null> = Object.create(null) as Record<string, WalletEvent | null>;
  for (const bankId of Object.keys(timeline.nextEvents)) next[bankId] = null;
  for (const event of timeline.events) {
    if (event.effectiveDate <= after || event.category === 'opening') continue;
    if (Object.prototype.hasOwnProperty.call(next, event.leaveBankId) && next[event.leaveBankId] === null) {
      next[event.leaveBankId] = { ...event };
    }
  }
  return next;
}
