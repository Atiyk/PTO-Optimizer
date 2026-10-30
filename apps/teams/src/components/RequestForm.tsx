'use client';

import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityOutput } from '@/capabilities/registry';
import { Badge, btnPrimary, fmt, input, label } from './ui';

type Draft = CapabilityOutput<'draftLeaveRequest'>;
type Part = 'full' | 'am' | 'pm' | 'hours';

/**
 * Live validation: every change re-runs draftLeaveRequest (the engine) and shows the
 * result immediately. Submitting is the one explicit step, because it asks a manager.
 */
export function RequestForm({ leaveTypes, today }: { leaveTypes: { key: string; name: string }[]; today: string }) {
  const id = useId();
  const [leaveType, setLeaveType] = useState(leaveTypes[0]?.key ?? 'vacation');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [part, setPart] = useState<Part>('full');
  const [hours, setHours] = useState(4);
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  const effectiveEnd = part === 'full' ? end || start : start;
  const payload = useMemo(
    () => ({ leaveType, start, end: effectiveEnd, part, hours: part === 'hours' ? hours : undefined, note: note.trim() || null }),
    [leaveType, start, effectiveEnd, part, hours, note],
  );

  useEffect(() => {
    if (!start) {
      setDraft(null);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const r = await runCapability('draftLeaveRequest', payload);
      if (!live) return;
      if (r.ok) {
        setDraft(r.data);
        setError(null);
      } else {
        setDraft(null);
        setError(r.error.message);
      }
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [payload, start]);

  function submit() {
    startTransition(async () => {
      const r = await runCapability('submitLeaveRequest', { ...payload, idempotencyKey: idemKey });
      if (r.ok) {
        setResult(r.data.request.status === 'approved' ? 'Booked. It is in your balance already.' : 'Sent to your manager for approval.');
        setStart('');
        setEnd('');
        setNote('');
        setDraft(null);
        setIdemKey(crypto.randomUUID());
      } else setError(r.error.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor={`${id}-type`}>Type</label>
          <select id={`${id}-type`} className={`${input} mt-1`} value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
            {leaveTypes.map((t) => (
              <option key={t.key} value={t.key}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-part`}>Length</label>
          <select id={`${id}-part`} className={`${input} mt-1`} value={part} onChange={(e) => setPart(e.target.value as Part)}>
            <option value="full">Full days</option>
            <option value="am">Morning (half day)</option>
            <option value="pm">Afternoon (half day)</option>
            <option value="hours">Hours</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-start`}>{part === 'full' ? 'First day' : 'Day'}</label>
          <input id={`${id}-start`} type="date" className={`${input} mt-1`} value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        {part === 'full' ? (
          <div>
            <label className={label} htmlFor={`${id}-end`}>Last day</label>
            <input id={`${id}-end`} type="date" className={`${input} mt-1`} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </div>
        ) : part === 'hours' ? (
          <div>
            <label className={label} htmlFor={`${id}-hours`}>Hours</label>
            <input id={`${id}-hours`} type="number" step="0.25" min="0.25" max="24" className={`${input} mt-1`} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </div>
        ) : null}
      </div>
      <div>
        <label className={label} htmlFor={`${id}-note`}>Note for your manager <span className="font-normal text-muted">(optional)</span></label>
        <input id={`${id}-note`} className={`${input} mt-1`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {!start && <p className="text-muted">Pick dates to see exactly what this costs. Today is {today}.</p>}
        {error && <p className="font-medium text-ink">{error}</p>}
        {draft && <DraftSummary d={draft} />}
        {result && <p className="font-medium text-ink">{result}</p>}
      </div>
      <button className={btnPrimary} disabled={!draft?.canSubmit || pending} onClick={submit}>
        {pending ? 'Sending…' : 'Request'}
      </button>
    </div>
  );
}

function DraftSummary({ d }: { d: Draft }) {
  const holidays = d.excluded.filter((e) => e.reason === 'holiday');
  return (
    <div className="space-y-2 rounded-md border border-line bg-surface p-3">
      <p className="text-ink">
        Uses <strong>{fmt(d.deducts, d.unit)}</strong>
        {d.countsAgainstBalance && d.balanceAfter != null && (
          <>
            {' '}· leaves <strong>{fmt(d.balanceAfter, d.unit)}</strong>
          </>
        )}
        {!d.countsAgainstBalance && <> · does not use your balance</>}
      </p>
      {holidays.length > 0 && (
        <p className="text-muted">
          Includes {holidays.map((h) => h.name).join(', ')} (not deducted).
        </p>
      )}
      {d.yearEndAfter && d.yearEndAfter.wouldForfeit > 0 && (
        <p className="text-muted">You would still forfeit {fmt(d.yearEndAfter.wouldForfeit, d.unit)} at the end of the plan year ({d.yearEndAfter.yearEnd}).</p>
      )}
      {d.problems.map((p) => (
        <p key={p}><Badge tone="bad">Blocked</Badge> {p}</p>
      ))}
      {d.warnings.map((w) => (
        <p key={w}><Badge tone="warn">Heads-up</Badge> {w}</p>
      ))}
    </div>
  );
}
