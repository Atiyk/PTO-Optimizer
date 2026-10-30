import type { LeavePolicy } from '@daysoff/engine/leave/policy';

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
