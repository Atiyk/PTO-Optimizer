import { z } from 'zod';
import { validatePolicy, type LeavePolicy } from '@daysoff/engine/leave/policy';

const monthDay = z.object({
  month: z.number().int().min(1).max(12).describe('1-12'),
  day: z.number().int().min(1).max(31).describe('1-31; Feb 29 clamps to Feb 28 in non-leap years'),
});
const payPeriod = z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly']);
const amount = z.number().min(0).max(10_000);

/** zod mirror of the engine's LeavePolicy (SPEC §3), with model-readable descriptions. */
export const policySchema = z
  .object({
    unit: z.enum(['days', 'hours']).describe('Whether allowances and balances are in days or hours.'),
    accrual: z.discriminatedUnion('method', [
      z.object({
        method: z.literal('front_loaded'),
        annualAllowance: amount.describe('Granted in full at the start of each plan year.'),
        proRateFirstYear: z.boolean().optional().describe('Pro-rate the first, partial year (default true).'),
      }),
      z.object({ method: z.literal('per_pay_period'), annualAllowance: amount, payPeriod }),
      z.object({ method: z.literal('per_hour_worked'), ratePerHour: z.number().min(0).max(1), payPeriod }),
      z.object({ method: z.literal('unlimited') }),
    ]),
    planYear: z.discriminatedUnion('type', [
      z.object({ type: z.literal('calendar') }),
      z.object({ type: z.literal('anniversary') }),
      z.object({ type: z.literal('custom'), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
    ]),
    accrualCap: amount.nullable().optional().describe('Maximum balance; accrual pauses at the cap.'),
    carryover: z.discriminatedUnion('type', [
      z.object({ type: z.literal('none') }),
      z.object({ type: z.literal('all'), useBy: monthDay.optional() }),
      z.object({ type: z.literal('upTo'), max: amount, useBy: monthDay.optional() }),
    ]),
    waitingPeriod: z
      .object({ days: z.number().int().min(0).max(3650), mode: z.enum(['no_accrual', 'locked']) })
      .nullable()
      .optional(),
    negativeAllowance: amount.optional(),
  })
  .superRefine((p, ctx) => {
    for (const message of validatePolicy(p as LeavePolicy)) ctx.addIssue({ code: 'custom', message });
  });

export type PolicyInput = z.infer<typeof policySchema>;

/** Default for new orgs: 20 days front-loaded, calendar year, carry up to 5. */
export const DEFAULT_VACATION_POLICY: LeavePolicy = {
  unit: 'days',
  accrual: { method: 'front_loaded', annualAllowance: 20, proRateFirstYear: true },
  planYear: { type: 'calendar' },
  carryover: { type: 'upTo', max: 5 },
  negativeAllowance: 0,
};

/** Sick leave: tracked, not limited by a balance (counts_against_balance = false). */
export const DEFAULT_SICK_POLICY: LeavePolicy = {
  unit: 'days',
  accrual: { method: 'unlimited' },
  planYear: { type: 'calendar' },
  carryover: { type: 'none' },
};
