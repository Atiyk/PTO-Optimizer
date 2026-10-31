'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnPrimary, btnSecondary, input, label } from './ui';

type PunchRow = { id: string; kind: string; breakKind: string | null; date: string; time: string; source: string; note: { untrusted_text: string } | null };

const KIND: Record<string, string> = { in: 'Clock in', out: 'Clock out', break_start: 'Break start', break_end: 'Break end' };

/** Correct a person's punches: remove a wrong one and/or add the right one, with a reason. */
export function PunchFix({ memberId, punches, defaultDate }: { memberId: string; punches: PunchRow[]; defaultDate: string }) {
  const router = useRouter();
  const [voidId, setVoidId] = useState('');
  const [kind, setKind] = useState('out');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('17:00');
  const [add, setAdd] = useState(true);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await runCapability('manageTimesheets', {
        op: 'correct',
        memberId,
        ...(voidId ? { voidPunchId: voidId } : {}),
        ...(add ? { add: { kind, date, time } } : {}),
        note,
      });
      if (r.ok) {
        setMsg('Saved. Hours and the timesheet are updated.');
        setVoidId('');
        setNote('');
        router.refresh();
      } else setMsg(r.error.message);
    });

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line text-sm">
        {punches.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span className="text-ink tabular-nums">
              {p.date} {p.time} · {KIND[p.kind] ?? p.kind}
              {p.breakKind ? ` (${p.breakKind})` : ''}
              {p.source === 'correction' && <span className="text-muted"> · corrected{p.note ? `: ${p.note.untrusted_text}` : ''}</span>}
            </span>
            <label className="inline-flex items-center gap-1 text-muted">
              <input type="radio" name="void" checked={voidId === p.id} onChange={() => setVoidId(p.id)} /> Remove this
            </label>
          </li>
        ))}
      </ul>
      {voidId && (
        <button className={btnSecondary} onClick={() => setVoidId('')}>
          Keep every punch
        </button>
      )}
      <fieldset className="grid gap-2 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-medium text-ink">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={add} onChange={(e) => setAdd(e.target.checked)} /> Add a punch
          </label>
        </legend>
        <label className={label}>
          Kind
          <select className={`${input} mt-1`} value={kind} onChange={(e) => setKind(e.target.value)} disabled={!add}>
            {Object.entries(KIND).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          Date
          <input type="date" className={`${input} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} disabled={!add} />
        </label>
        <label className={label}>
          Time (site)
          <input type="time" className={`${input} mt-1`} value={time} onChange={(e) => setTime(e.target.value)} disabled={!add} />
        </label>
      </fieldset>
      <label className={label}>
        Reason (kept in the audit trail)
        <input className={`${input} mt-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Forgot to clock out; left at 5 pm" />
      </label>
      <button className={btnPrimary} disabled={pending || note.trim().length < 3 || (!voidId && !add)} onClick={save}>
        {pending ? 'Saving…' : 'Save correction'}
      </button>
      {msg && <p role="status" className="text-sm text-ink">{msg}</p>}
    </div>
  );
}
