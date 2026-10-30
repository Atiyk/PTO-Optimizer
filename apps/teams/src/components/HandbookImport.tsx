'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityOutput } from '@/capabilities/registry';
import { Badge, btnPrimary, btnSecondary, input, label } from './ui';

type Result = CapabilityOutput<'importHandbook'>;

const LABELS: Record<string, string> = {
  unit: 'Unit', accrualMethod: 'How it is earned', annualAllowance: 'Yearly allowance', payPeriod: 'Pay period',
  hoursWorkedPerHourAccrued: 'Hours worked per hour earned', planYear: 'Leave year', planYearStart: 'Leave year starts',
  carryover: 'Carry-over', carryoverMax: 'Carry-over limit', carryoverUseBy: 'Carried leave used by',
  accrualCap: 'Balance cap', waitingPeriodDays: 'Waiting period (days)',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const VALUE_TEXT: Record<string, string> = {
  front_loaded: 'Full amount at the start of the year', per_pay_period: 'Builds up each pay period', per_hour_worked: 'Per hour worked',
  unlimited: 'Unlimited', calendar: 'Calendar year', anniversary: 'Start-date anniversary', custom: 'Starts on a set date',
  none: 'None', all: 'All of it', upTo: 'Up to a limit', biweekly: 'Every two weeks', semimonthly: 'Twice a month',
};
function show(v: string | number | null): string {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  const md = /^(\d{2})-(\d{2})$/.exec(v);
  if (md) return `${Number(md[2])} ${MONTHS[Number(md[1]) - 1]}`;
  return VALUE_TEXT[v] ?? v;
}

/** The fields read from a handbook, each with the sentence it came from. Shared with the public demo. */
export function HandbookResultView({ result, note, sourceLabel }: { result: Result; note: string; sourceLabel?: string }) {
  return (
    <>
      <p className="text-sm text-muted">
        {sourceLabel ??
          `${result.source.used === 'ai' ? 'Read by AI' : result.source.used === 'demo' ? 'Demo mode: read by the built-in rules' : 'Read by the built-in rules (AI unavailable)'}${result.source.cached ? ' · from cache, no cost' : ''}.`}{' '}
        {note}
      </p>
      <ul className="divide-y divide-line rounded-md border border-line">
        {Object.entries(result.fields).map(([k, f]) => (
          <li key={k} className="space-y-1 p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{LABELS[k] ?? k}</span>
              {f.status === 'verified' && <Badge tone="accent">{show(f.value)}</Badge>}
              {f.status === 'not_stated' && <span className="text-muted">Not stated</span>}
              {f.status === 'rejected' && <><Badge tone="bad">Needs you</Badge> <span className="text-muted">{show(f.value)} not used</span></>}
            </div>
            {f.quote && <blockquote className="border-l-2 border-line pl-2 text-muted break-words">“{f.quote.untrusted_text}”</blockquote>}
            {f.reason && <p className="text-ink">{f.reason}</p>}
          </li>
        ))}
      </ul>
      {result.assumptions.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-ink">Assumed until you change it</p>
          <ul className="list-disc pl-5 text-muted">{result.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {result.questions.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-ink">Questions for you</p>
          <ul className="list-disc pl-5 text-muted">{result.questions.map((q) => <li key={q}>{q}</li>)}</ul>
        </div>
      )}
    </>
  );
}

/** Draft → confirm (R2): reading never saves; the admin checks each quote, then saves. */
export function HandbookImport({ leaveTypes, today }: { leaveTypes: { key: string; name: string }[]; today: string }) {
  const id = useId();
  const router = useRouter();
  const [text, setText] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [leaveType, setLeaveType] = useState(leaveTypes.find((t) => t.key === 'vacation')?.key ?? leaveTypes[0]?.key ?? 'vacation');
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reading, startReading] = useTransition();
  const [saving, startSaving] = useTransition();

  function read() {
    setMsg(null);
    startReading(async () => {
      const r = await runCapability('importHandbook', { text });
      if (r.ok) setResult(r.data);
      else setMsg(r.error.message);
    });
  }

  function save() {
    if (!result?.policy) return;
    startSaving(async () => {
      const r = await runCapability('manageOrgSetup', {
        op: 'savePolicy', leaveType, name: 'From handbook', effectiveFrom, policy: result.policy, citations: result.citations,
      });
      setMsg(r.ok ? 'Saved. The quotes are kept with the policy.' : r.error.message);
      if (r.ok) router.refresh();
    });
  }

  async function loadFile(f: File | undefined) {
    if (f) setText((await f.text()).slice(0, 120_000));
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={label} htmlFor={`${id}-text`}>Paste your handbook&apos;s time-off section</label>
        <textarea id={`${id}-text`} className={`${input} mt-1 h-40 font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className={btnPrimary} disabled={reading || text.trim().length < 20} onClick={read}>
            {reading ? 'Reading…' : 'Read handbook'}
          </button>
          <label className={`${btnSecondary} cursor-pointer`}>
            Open a .txt or .md file
            <input type="file" accept=".txt,.md,text/plain,text/markdown" className="sr-only" onChange={(e) => loadFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          <HandbookResultView result={result} note="Nothing is saved until you press Save." />
          {result.policy ? (
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <div>
                <label className={label} htmlFor={`${id}-type`}>Leave type</label>
                <select id={`${id}-type`} className={`${input} mt-1`} value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                  {leaveTypes.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor={`${id}-from`}>Applies from</label>
                <input id={`${id}-from`} type="date" className={`${input} mt-1`} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </div>
              <button className={btnPrimary} disabled={saving || !effectiveFrom} onClick={save}>{saving ? 'Saving…' : 'Save as policy'}</button>
            </div>
          ) : (
            <p className="text-sm text-ink">Not enough was stated to build a policy. Answer the questions in the policy form on the Setup tab.</p>
          )}
        </div>
      )}
      {msg && <p className="text-sm font-medium text-ink" aria-live="polite">{msg}</p>}
    </div>
  );
}
