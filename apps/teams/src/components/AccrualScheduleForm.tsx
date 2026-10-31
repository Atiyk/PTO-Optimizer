'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnPrimary, input, label } from './ui';

const PERIODS = [
  ['monthly', 'Monthly (12 a year)'],
  ['semimonthly', 'Semimonthly (24 a year)'],
  ['biweekly', 'Biweekly (26 a year)'],
  ['weekly', 'Weekly (52 a year)'],
] as const;

/**
 * Accrual schedule editor: a pay-period accrual policy with an optional cap and carryover,
 * validated by the engine on save. Non-monthly schedules are on the Complete plan (sick and other
 * health-related leave is exempt because sick-leave laws require accrual).
 */
export function AccrualScheduleForm({
  leaveTypes,
  teams,
  locations,
  complete,
  today,
}: {
  leaveTypes: { key: string; name: string; isHealthRelated: boolean }[];
  teams: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  complete: boolean;
  today: string;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState(leaveTypes[0]?.key ?? 'vacation');
  const health = leaveTypes.find((t) => t.key === type)?.isHealthRelated ?? false;
  const locked = (p: string) => p !== 'monthly' && !complete && !health;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => (fd.get(k) === '' || fd.get(k) == null ? null : Number(fd.get(k)));
    const unit = String(fd.get('unit')) as 'days' | 'hours';
    const carry = num('carryMax');
    const scope = String(fd.get('scope') ?? 'all');
    const appliesTo = scope.startsWith('team:') ? { teamIds: [scope.slice(5)] } : scope.startsWith('loc:') ? { locationIds: [scope.slice(4)] } : { all: true };
    const payload = {
      op: 'savePolicy',
      leaveType: type,
      name: String(fd.get('name') || 'Accrual schedule'),
      effectiveFrom: String(fd.get('effectiveFrom')),
      appliesTo,
      policy: {
        unit,
        accrual: { method: 'per_pay_period', annualAllowance: num('annual') ?? 0, payPeriod: String(fd.get('payPeriod')) },
        planYear: { type: 'calendar' },
        accrualCap: num('cap'),
        carryover: carry == null ? { type: 'all' } : carry === 0 ? { type: 'none' } : { type: 'upTo', max: carry },
      },
    };
    start(async () => {
      const r = await runCapability('manageOrgSetup', payload);
      setMsg(r.ok ? 'Saved. Balances follow the new schedule from the date you chose.' : r.error.message);
      if (r.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`${id}-type`}>Leave type</label>
          <select id={`${id}-type`} className={`${input} mt-1`} value={type} onChange={(e) => setType(e.target.value)}>
            {leaveTypes.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-scope`}>Applies to</label>
          <select id={`${id}-scope`} name="scope" className={`${input} mt-1`} defaultValue="all">
            <option value="all">Everyone</option>
            {teams.map((t) => <option key={t.id} value={`team:${t.id}`}>Team: {t.name}</option>)}
            {locations.map((l) => <option key={l.id} value={`loc:${l.id}`}>Site: {l.name}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-annual`}>Earned per year</label>
          <input id={`${id}-annual`} name="annual" type="number" step="any" min="0" required defaultValue={20} className={`${input} mt-1`} />
        </div>
        <div>
          <label className={label} htmlFor={`${id}-unit`}>Unit</label>
          <select id={`${id}-unit`} name="unit" className={`${input} mt-1`} defaultValue="days">
            <option value="days">Days</option>
            <option value="hours">Hours</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-period`}>Accrues</label>
          <select id={`${id}-period`} name="payPeriod" className={`${input} mt-1`} defaultValue="monthly">
            {PERIODS.map(([v, l]) => (
              <option key={v} value={v} disabled={locked(v)}>{l}{locked(v) ? ' (Complete plan)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-from`}>From</label>
          <input id={`${id}-from`} name="effectiveFrom" type="date" required defaultValue={today} className={`${input} mt-1`} />
        </div>
        <div>
          <label className={label} htmlFor={`${id}-cap`}>Balance cap (optional)</label>
          <input id={`${id}-cap`} name="cap" type="number" step="any" min="0" placeholder="No cap" className={`${input} mt-1`} />
        </div>
        <div>
          <label className={label} htmlFor={`${id}-carry`}>Carry over at year end (optional)</label>
          <input id={`${id}-carry`} name="carryMax" type="number" step="any" min="0" placeholder="Blank = all, 0 = none" className={`${input} mt-1`} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} name="name" type="text" maxLength={120} placeholder="Accrual schedule" className={`${input} mt-1`} />
        </div>
      </div>
      {!complete && <p className="text-sm text-muted">Monthly accrual works on every plan. Weekly, biweekly and semimonthly are on the Complete plan{health ? ', but this leave type is exempt because sick-leave laws require accrual' : ''}.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending}>{pending ? 'Saving…' : 'Save schedule'}</button>
        {msg && <span role="status" className="text-sm text-ink">{msg}</span>}
      </div>
    </form>
  );
}
