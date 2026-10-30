'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityOutput } from '@/capabilities/registry';
import { Badge, btnPrimary, btnSecondary, input, label } from './ui';

type Draft = CapabilityOutput<'draftRulePackFromText'>;
const KIND: Record<string, string> = {
  ratio: 'Ratio', role_present: 'Required role', min_rest_between_shifts: 'Rest between shifts', max_hours_per_day: 'Hours per day',
  max_hours_per_week: 'Hours per week', max_consecutive_days: 'Days in a row', overtime_flag: 'Overtime', sick_accrual: 'Sick leave',
};
const FIELD: Record<string, string> = {
  ageGroup: 'group', childrenPerStaff: 'per staff member', maxGroupSize: 'max group', credential: 'credential', min: 'at least', scope: 'per',
  hours: 'hours', days: 'days', dailyHours: 'over hours/day', weeklyHours: 'over hours/week', hoursPerUnit: 'hours worked per hour earned',
  annualUseCap: 'use cap/year', balanceCap: 'balance cap', annualAccrualCap: 'earn cap/year', usableFromDay: 'usable from day',
};
const SOURCE = { ai: 'Read by AI', demo: 'Demo mode (built-in rules stand in for AI)', rules: 'Read by the built-in rules (AI off)' } as const;

/**
 * Paste regulation or policy text; get a draft where every rule shows the sentence it came
 * from. Nothing is saved until the admin presses Save, and law rules stay "needs verification".
 */
export function RuleDraft() {
  const id = useId();
  const router = useRouter();
  const [text, setText] = useState('');
  const [vertical, setVertical] = useState<'childcare' | 'clinic' | 'general'>('childcare');
  const [basis, setBasis] = useState<'law' | 'org_policy'>('law');
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const read = () =>
    start(async () => {
      setMsg(null);
      const r = await runCapability('draftRulePackFromText', { text, vertical, basis, ...(name.trim() ? { name: name.trim() } : {}) });
      if (r.ok) setDraft(r.data);
      else setMsg(r.error.message);
    });
  const save = () =>
    start(async () => {
      const r = await runCapability('saveRulePack', { pack: draft!.pack as Record<string, unknown> });
      if (!r.ok) return setMsg(r.error.message);
      setMsg(`Saved as "${r.data.key}" (version ${r.data.version}). Choose it for a site in step 1.`);
      router.refresh();
    });

  const kept = draft?.rules.filter((r) => r.status === 'verified') ?? [];
  const rejected = draft?.rules.filter((r) => r.status === 'rejected') ?? [];
  return (
    <div className="space-y-3 text-sm">
      <div>
        <label htmlFor={`${id}-text`} className={label}>
          Regulation or policy text
        </label>
        <textarea id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={6} className={`${input} mt-1 font-mono text-xs`} placeholder="Paste the staffing sections here, e.g. the ratio table." />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className={label}>
          Kind of site
          <select value={vertical} onChange={(e) => setVertical(e.target.value as typeof vertical)} className={`${input} mt-1`}>
            <option value="childcare">Childcare</option>
            <option value="clinic">Clinic</option>
            <option value="general">Labour rules only</option>
          </select>
        </label>
        <label className={label}>
          This text is
          <select value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)} className={`${input} mt-1`}>
            <option value="law">A law or regulation</option>
            <option value="org_policy">Our own policy</option>
          </select>
        </label>
        <label className={label}>
          Name (optional)
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} placeholder="e.g. Oregon centres" />
        </label>
      </div>
      <button onClick={read} disabled={pending || text.trim().length < 20} className={btnSecondary}>
        {pending && !draft ? 'Reading…' : 'Read the rules'}
      </button>
      {draft && (
        <div className="space-y-3 border-t border-line pt-3" aria-live="polite">
          <p className="text-muted">{SOURCE[draft.source.used]}. Every rule below quotes the text it came from; check each one before saving.</p>
          {kept.length > 0 && (
            <ul className="space-y-2">
              {kept.map((r, i) => (
                <li key={i} className="rounded-md border border-line p-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-ink">{KIND[r.kind] ?? r.kind}</span>
                    <span className="text-ink">{Object.entries(r.values).map(([k, v]) => `${FIELD[k] ?? k}: ${v}`).join(' · ')}</span>
                    {basis === 'law' && <Badge tone="warn">needs verification</Badge>}
                  </div>
                  {r.quote && <blockquote className="mt-1 border-l-2 border-line pl-2 break-words text-muted [overflow-wrap:anywhere]">“{r.quote.untrusted_text}”</blockquote>}
                </li>
              ))}
            </ul>
          )}
          {rejected.length > 0 && (
            <details>
              <summary className="cursor-pointer text-ink">Not used ({rejected.length})</summary>
              <ul className="mt-1 space-y-1">
                {rejected.map((r, i) => (
                  <li key={i} className="text-muted">
                    {KIND[r.kind] ?? r.kind}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {draft.questions.length > 0 && (
            <div>
              <p className="font-medium text-ink">To decide</p>
              <ul className="list-disc pl-5 text-ink">
                {draft.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">{draft.notice}</p>
          {draft.pack ? (
            <button onClick={save} disabled={pending} className={btnPrimary}>
              Save {kept.length} rule{kept.length === 1 ? '' : 's'} as a rule pack
            </button>
          ) : (
            <p className="text-ink">No rule could be kept, so there is nothing to save.</p>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className="font-medium text-ink">
          {msg}
        </p>
      )}
    </div>
  );
}
