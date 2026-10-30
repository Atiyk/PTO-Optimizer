'use client';

import { useId, useState, useTransition } from 'react';
import type { DemoCallOff, DemoRuleDraft } from '@/demo/coverageDemo';
import { Badge, btnPrimary, btnSecondary, input, label } from './ui';

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch('/api/demo/coverage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? 'That did not work. Please try again.');
  return json as T;
}

const FIELD: Record<string, string> = { ageGroup: 'Age group', childrenPerStaff: 'Children per teacher', maxGroupSize: 'Largest group' };

/** Step 1 of the public coverage demo: regulation text → cited rule draft (never saved). */
export function DemoRules({ sample }: { sample: string }) {
  const id = useId();
  const [text, setText] = useState(sample);
  const [result, setResult] = useState<DemoRuleDraft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const read = () =>
    start(async () => {
      setMsg(null);
      try {
        setResult(await post<DemoRuleDraft>({ step: 'rules', text }));
      } catch (e) {
        setMsg((e as Error).message);
      }
    });
  const kept = result?.rules.filter((r) => r.status === 'verified') ?? [];
  const dropped = result?.rules.filter((r) => r.status === 'rejected') ?? [];
  return (
    <div className="space-y-4">
      <div>
        <label className={label} htmlFor={`${id}-text`}>A regulation excerpt (edit it or paste your own)</label>
        <textarea id={`${id}-text`} className={`${input} mt-1 h-56 font-mono text-xs`} value={text} maxLength={20_000} onChange={(e) => setText(e.target.value)} />
        <p className="mt-1 text-xs text-muted">The text is sent to Anthropic&apos;s API to be read, so don&apos;t paste anything confidential. Nothing here is saved.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={busy || text.trim().length < 20} onClick={read}>{busy ? 'Reading…' : 'Read the rules'}</button>
          {text !== sample && <button className={btnSecondary} onClick={() => setText(sample)}>Back to the sample</button>}
        </div>
      </div>
      <div aria-live="polite" className="space-y-3">
        {msg && <p className="text-sm font-medium text-ink">{msg}</p>}
        {result && (
          <>
            <p className="text-sm text-muted">{result.label} Every kept rule quotes the sentence it came from and stays &ldquo;needs verification&rdquo; until someone adds the official citation.</p>
            <ul className="space-y-2">
              {kept.map((r, i) => (
                <li key={i} className="rounded-md border border-line p-2 text-sm">
                  <p className="flex flex-wrap items-center gap-2 text-ink">
                    {Object.entries(r.values).map(([k, v]) => <span key={k}><span className="text-muted">{FIELD[k] ?? k}:</span> <strong>{String(v)}</strong></span>)}
                    <Badge tone="warn">needs verification</Badge>
                  </p>
                  {r.quote && <blockquote className="mt-1 border-l-2 border-line pl-2 text-muted">&ldquo;{r.quote.untrusted_text}&rdquo;</blockquote>}
                </li>
              ))}
            </ul>
            {dropped.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-ink">Not used ({dropped.length})</summary>
                <ul className="mt-1 space-y-1 text-muted">{dropped.map((r, i) => <li key={i}>{r.reason}</li>)}</ul>
              </details>
            )}
            {result.questions.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-ink">{result.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Step 3: a staff member calls off; cover is ranked, offered and accepted; then all of it is rolled back. */
export function DemoCallOffRun({ caller }: { caller: string }) {
  const [r, setR] = useState<DemoCallOff | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const go = () =>
    start(async () => {
      setMsg(null);
      try {
        setR(await post<DemoCallOff>({ step: 'calloff' }));
      } catch (e) {
        setMsg((e as Error).message);
      }
    });
  const top = r?.ranking?.candidates.filter((c) => c.eligible).slice(0, 3) ?? [];
  const out = r?.ranking?.candidates.filter((c) => !c.eligible) ?? [];
  const reasons = [...new Set(out.map((c) => c.checks.find((x) => !x.passed)?.detail).filter(Boolean))].slice(0, 4);
  return (
    <div className="space-y-3">
      <button className={btnPrimary} disabled={busy} onClick={go}>{busy ? 'Running…' : `${caller} calls in sick for Monday`}</button>
      <div aria-live="polite" className="space-y-3 text-sm">
        {msg && <p className="font-medium text-ink">{msg}</p>}
        {r && (
          <ol className="space-y-3">
            <li>
              <p className="font-medium text-ink">1. Two taps in the staff app</p>
              <p className="text-muted">Sick leave recorded for {r.date} with no reason. It opens {r.callOff.coverRequests.length} cover request{r.callOff.coverRequests.length === 1 ? '' : 's'}: {r.callOff.coverRequests.map((c) => `${c.roomName} ${c.start}–${c.end}`).join(', ')}.</p>
            </li>
            {r.ranking && (
              <li>
                <p className="font-medium text-ink">2. Ranked cover for {r.ranking.window.roomName} {r.ranking.window.start}–{r.ranking.window.end}</p>
                {r.ranking.gap && <p className="text-muted">{r.ranking.gap.label}{r.ranking.gap.citation ? ` (${r.ranking.gap.citation})` : ''}: {r.ranking.gap.short} short.</p>}
                <ol className="mt-1 list-decimal pl-5 text-ink">
                  {top.map((c) => <li key={c.memberId}>{c.name?.untrusted_text}: passes every rule{c.scoreParts && c.scoreParts.fairness > 0 ? `, fairness ${c.scoreParts.fairness}` : ', no recent covers'}{c.costBand === 'overtime' ? ', would be overtime' : ''}</li>)}
                </ol>
                {reasons.length > 0 && <p className="mt-1 text-muted">Left out ({out.length}): {reasons.join(' · ')}</p>}
              </li>
            )}
            {r.accepted && (
              <li>
                <p className="font-medium text-ink">3. {r.accepted.name} accepts</p>
                <p className="text-muted">Every rule is checked again at that moment; the first eligible acceptance wins. Status: {r.accepted.status}.</p>
              </li>
            )}
            <li>
              <p className="font-medium text-ink">4. Coverage for {r.date} now</p>
              {r.gapsAfter.length === 0 ? (
                <p className="text-muted">In ratio all day.</p>
              ) : (
                <ul className="text-muted">{r.gapsAfter.map((g, i) => <li key={i}>{g.roomName ?? 'Whole site'} {g.start}–{g.end}: {g.present} of {g.required} staff ({g.label})</li>)}</ul>
              )}
            </li>
          </ol>
        )}
        {r && <p className="text-xs text-muted">The real workflow ran, then was rolled back: nothing was saved and nobody was messaged.</p>}
      </div>
    </div>
  );
}
