'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnPrimary, input, label } from './ui';

/** The policy model as a form (SPEC §3). Phase 3 adds "draft from handbook" next to it. */
export function PolicyForm({ leaveTypes, today }: { leaveTypes: { key: string; name: string }[]; today: string }) {
  const id = useId();
  const router = useRouter();
  const [method, setMethod] = useState<'front_loaded' | 'per_pay_period' | 'per_hour_worked' | 'unlimited'>('front_loaded');
  const [carry, setCarry] = useState<'none' | 'all' | 'upTo'>('upTo');
  const [planYear, setPlanYear] = useState<'calendar' | 'anniversary' | 'custom'>('calendar');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => (f.get(k) === '' || f.get(k) == null ? undefined : Number(f.get(k)));
    const md = (k: string) => {
      const v = String(f.get(k) ?? '');
      const m = /^(\d{1,2})-(\d{1,2})$/.exec(v);
      return m ? { month: Number(m[1]), day: Number(m[2]) } : undefined;
    };
    const unit = String(f.get('unit')) as 'days' | 'hours';
    const accrual =
      method === 'front_loaded'
        ? { method, annualAllowance: n('allowance') ?? 0 }
        : method === 'per_pay_period'
          ? { method, annualAllowance: n('allowance') ?? 0, payPeriod: String(f.get('payPeriod')) }
          : method === 'per_hour_worked'
            ? { method, ratePerHour: (n('rateHours') ? 1 / n('rateHours')! : 0), payPeriod: String(f.get('payPeriod')) }
            : { method };
    const py = planYear === 'custom' ? { type: 'custom', ...(md('planYearStart') ?? { month: 1, day: 1 }) } : { type: planYear };
    const carryover = carry === 'none' ? { type: 'none' } : carry === 'all' ? { type: 'all', useBy: md('useBy') } : { type: 'upTo', max: n('carryMax') ?? 0, useBy: md('useBy') };
    const payload = {
      op: 'savePolicy',
      leaveType: String(f.get('leaveType')),
      name: String(f.get('name') || 'Policy'),
      effectiveFrom: String(f.get('effectiveFrom')),
      policy: { unit, accrual, planYear: py, accrualCap: n('cap') ?? null, carryover, negativeAllowance: n('negative') ?? 0 },
    };
    start(async () => {
      const r = await runCapability('manageOrgSetup', payload);
      setMsg(r.ok ? 'Policy saved. It applies from its effective date onward.' : r.error.message);
      if (r.ok) router.refresh();
    });
  }

  const sel = (name: string, value: string, set: (v: never) => void, opts: [string, string][], text: string) => (
    <div>
      <label className={label} htmlFor={`${id}-${name}`}>{text}</label>
      <select id={`${id}-${name}`} name={name} value={value} onChange={(e) => set(e.target.value as never)} className={`${input} mt-1`}>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
  const field = (name: string, text: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className={label} htmlFor={`${id}-${name}`}>{text}</label>
      <input id={`${id}-${name}`} name={name} className={`${input} mt-1`} {...props} />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`${id}-leaveType`}>Leave type</label>
          <select id={`${id}-leaveType`} name="leaveType" className={`${input} mt-1`}>
            {leaveTypes.map((t) => (
              <option key={t.key} value={t.key}>{t.name}</option>
            ))}
          </select>
        </div>
        {field('name', 'Policy name', { defaultValue: 'Standard' })}
        {field('effectiveFrom', 'Applies from', { type: 'date', required: true, defaultValue: today })}
        <div>
          <label className={label} htmlFor={`${id}-unit`}>Tracked in</label>
          <select id={`${id}-unit`} name="unit" className={`${input} mt-1`}>
            <option value="days">Days</option>
            <option value="hours">Hours</option>
          </select>
        </div>
        {sel('method', method, setMethod, [['front_loaded', 'All at the start of the year'], ['per_pay_period', 'Accrues each pay period'], ['per_hour_worked', 'Accrues per hour worked'], ['unlimited', 'Unlimited']], 'How leave is earned')}
        {(method === 'front_loaded' || method === 'per_pay_period') && field('allowance', 'Allowance per year', { type: 'number', step: 'any', min: 0, required: true, defaultValue: 20 })}
        {method === 'per_hour_worked' && field('rateHours', 'One hour of leave per … hours worked', { type: 'number', step: 'any', min: 1, required: true, defaultValue: 30 })}
        {(method === 'per_pay_period' || method === 'per_hour_worked') && (
          <div>
            <label className={label} htmlFor={`${id}-payPeriod`}>Pay period</label>
            <select id={`${id}-payPeriod`} name="payPeriod" defaultValue="biweekly" className={`${input} mt-1`}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every two weeks</option>
              <option value="semimonthly">Twice a month</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        )}
        {sel('planYear', planYear, setPlanYear, [['calendar', 'Calendar year'], ['anniversary', 'Each person’s work anniversary'], ['custom', 'Custom start date']], 'Year resets on')}
        {planYear === 'custom' && field('planYearStart', 'Year starts (MM-DD)', { placeholder: '04-01', pattern: '\\d{1,2}-\\d{1,2}' })}
        {method !== 'unlimited' && field('cap', 'Maximum balance (optional)', { type: 'number', step: 'any', min: 0 })}
        {method !== 'unlimited' && sel('carry', carry, setCarry, [['none', 'Nothing carries over'], ['upTo', 'Up to a limit carries over'], ['all', 'Everything carries over']], 'At year end')}
        {method !== 'unlimited' && carry === 'upTo' && field('carryMax', 'Carry-over limit', { type: 'number', step: 'any', min: 0, defaultValue: 5 })}
        {method !== 'unlimited' && carry !== 'none' && field('useBy', 'Carried leave must be used by (MM-DD, optional)', { placeholder: '03-31', pattern: '\\d{1,2}-\\d{1,2}' })}
        {method !== 'unlimited' && field('negative', 'Can go negative by (optional)', { type: 'number', step: 'any', min: 0, defaultValue: 0 })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending}>{pending ? 'Saving…' : 'Save policy'}</button>
        {msg && <span role="status" className="text-sm text-ink">{msg}</span>}
      </div>
    </form>
  );
}
