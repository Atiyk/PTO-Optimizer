import type { LeavePolicy } from '@daysoff/engine/leave/policy';
import type { PayoutPolicy } from '@daysoff/engine/leave/payout';

/** Plain-language one-liner for a policy. Deterministic; no AI. */
export function describePolicy(p: LeavePolicy): string {
  const u = p.unit;
  const parts: string[] = [];
  const a = p.accrual;
  if (a.method === 'unlimited') parts.push('Unlimited');
  else if (a.method === 'front_loaded') parts.push(`${a.annualAllowance} ${u} at the start of each year`);
  else if (a.method === 'per_pay_period') parts.push(`${a.annualAllowance} ${u} a year, earned ${a.payPeriod}`);
  else parts.push(`1 hour per ${Math.round(1 / a.ratePerHour)} hours worked`);
  parts.push(p.planYear.type === 'calendar' ? 'calendar year' : p.planYear.type === 'anniversary' ? 'resets on work anniversary' : `year starts ${p.planYear.month}/${p.planYear.day}`);
  if (a.method !== 'unlimited') {
    const c = p.carryover;
    parts.push(c.type === 'none' ? 'nothing carries over' : c.type === 'all' ? 'all carries over' : `up to ${c.max} ${u} carry over`);
    if (c.type !== 'none' && c.useBy) parts.push(`carried leave expires after ${c.useBy.month}/${c.useBy.day}`);
    if (p.accrualCap != null) parts.push(`max balance ${p.accrualCap}`);
    if (p.negativeAllowance) parts.push(`can go ${p.negativeAllowance} below zero`);
  }
  if (p.waitingPeriod?.days) parts.push(`${p.waitingPeriod.days}-day waiting period`);
  return parts.join(' · ');
}

/** Plain-language one-liner for a PTO payout policy (Gapless Phase 4). Deterministic; no AI. */
export function describePayoutPolicy(p: PayoutPolicy, unit: 'days' | 'hours'): string {
  const s = p.separation;
  const parts = [
    s.mode === 'up_to_cap'
      ? `At separation: paid up to ${s.cap} ${unit} (more where state law requires it)`
      : s.mode === 'state_law'
        ? 'At separation: paid where state law requires it'
        : s.mode === 'yes'
          ? 'At separation: unused balance is paid'
          : 'At separation: not paid (unless state law requires it)',
    p.yearEnd === 'cash_out_excess' ? 'at year end, anything over the carry-over limit is cashed out' : 'at year end, anything over the carry-over limit is lost (where state law allows)',
    p.voluntaryCashOut.allowed
      ? `cash-out on request${p.voluntaryCashOut.minBalanceKept ? `, keeping at least ${p.voluntaryCashOut.minBalanceKept} ${unit}` : ''}${p.voluntaryCashOut.maxPerYear != null ? `, up to ${p.voluntaryCashOut.maxPerYear} ${unit} a year` : ''}`
      : 'no cash-out on request',
  ];
  if (p.excludeSick) parts.push('sick leave is never paid out');
  return parts.join(' · ');
}
