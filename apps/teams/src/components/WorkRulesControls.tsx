'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityOutput } from '@/capabilities/registry';
import { Card, input, label } from './ui';

type Rules = CapabilityOutput<'getWorkRules'>;

const POLICIES: { key: Rules['overtimePolicy']; title: string; text: string }[] = [
  { key: 'avoid', title: 'Avoid overtime (recommended)', text: 'People a cover would push into overtime are still offered it, but only after everyone at regular time.' },
  { key: 'exclude', title: 'Never offer overtime', text: 'Leave them out of cover offers entirely. A gap may go unfilled.' },
  { key: 'allow', title: 'Ignore overtime', text: 'Rank on fairness only; overtime is just labelled.' },
];

/** Every control applies as it changes (no save button), then the page refreshes. */
export function WorkRulesControls({ rules }: { rules: Rules }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const apply = (input: unknown, done: string) =>
    start(async () => {
      const r = await runCapability('manageWorkRules', input);
      setMsg(r.ok ? done : r.error.message);
      if (r.ok) router.refresh();
    });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Industry">
        <label className={label}>
          What kind of team is this?
          <select className={`${input} mt-1`} defaultValue={rules.industry} disabled={pending} onChange={(e) => apply({ op: 'setIndustry', industry: e.target.value }, 'Industry saved.')}>
            {rules.industries.map((i) => (
              <option key={i.key} value={i.key}>{i.label}</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-sm text-muted">{rules.industries.find((i) => i.key === rules.industry)?.blurb}</p>
      </Card>
      <Card title="Time clock">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" className="mt-1 h-4 w-4" defaultChecked={rules.timeClockEnabled} disabled={pending} onChange={(e) => apply({ op: 'setTimeClock', enabled: e.target.checked }, e.target.checked ? 'Time clock on.' : 'Time clock off.')} />
          <span>
            <span className="font-medium">Staff clock in and out from their phone</span>
            <span className="block text-muted">Hours go straight into timesheets and hourly sick-leave accrual. No CSV imports.</span>
          </span>
        </label>
      </Card>
      <Card title="Overtime and cover">
        <fieldset>
          <legend className="text-sm text-muted">When someone is out, who gets offered the shift?</legend>
          <div className="mt-2 space-y-2">
            {POLICIES.map((p) => (
              <label key={p.key} className="flex items-start gap-3 text-sm text-ink">
                <input type="radio" name="otpolicy" className="mt-1 h-4 w-4" defaultChecked={rules.overtimePolicy === p.key} disabled={pending} onChange={() => apply({ op: 'setOvertimePolicy', policy: p.key }, 'Overtime policy saved.')} />
                <span>
                  <span className="font-medium">{p.title}</span>
                  <span className="block text-muted">{p.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>
      <Card title="Labour rules per site">
        <div className="space-y-3">
          {rules.sites.map((s) => (
            <label key={s.locationId} className={label}>
              {s.name} <span className="font-normal text-muted">({s.region})</span>
              <select className={`${input} mt-1`} defaultValue={s.laborPackKey ?? ''} disabled={pending} onChange={(e) => apply({ op: 'setSiteLaborPack', locationId: s.locationId, packKey: e.target.value || null }, 'Site rules saved.')}>
                <option value="">Default ({s.region.endsWith('US') ? 'US federal FLSA, or the site’s coverage pack' : 'none'})</option>
                {rules.laborPacks.map((p) => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Card>
      {msg && <p role="status" className="text-sm text-ink lg:col-span-2">{msg}</p>}
    </div>
  );
}
