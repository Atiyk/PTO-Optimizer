'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityOutput } from '@/capabilities/registry';
import { Badge, btnPrimary, btnSecondary, input, label } from './ui';

type Preview = CapabilityOutput<'importCsv'>;

/** Upload → map columns → preview with per-row errors → import all or nothing. */
type Kind = 'members' | 'leave' | 'credentials' | 'shifts' | 'hours';
const UNDOABLE: Kind[] = ['credentials', 'shifts', 'hours'];

export function ImportWizard({ samples, coverage = false }: { samples: { name: string; kind: Kind; csv: string }[]; coverage?: boolean }) {
  const id = useId();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('members');
  const [lastBatch, setLastBatch] = useState<{ kind: Kind; batchId: string; count: number } | null>(null);
  const [csv, setCsv] = useState('');
  const [dayFirst, setDayFirst] = useState(true);
  const [mapping, setMapping] = useState<Record<string, number> | undefined>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (stage: 'preview' | 'commit', m = mapping, text = csv, k = kind) =>
    start(async () => {
      const r = await runCapability('importCsv', { stage, kind: k, csv: text, mapping: m, dayFirst });
      if (!r.ok) {
        setMsg(r.error.message);
        setPreview(null);
        return;
      }
      setPreview(r.data);
      setMapping(r.data.mapping);
      if (stage === 'commit') {
        setMsg(r.data.committed ? `Imported ${r.data.committed} rows.` : `Nothing imported: fix the ${r.data.errorCount} errors below first.`);
        if (r.data.committed && r.data.batchId) setLastBatch({ kind: k, batchId: r.data.batchId, count: r.data.committed });
        if (r.data.committed) router.refresh();
      } else setMsg(null);
    });

  const undo = () =>
    lastBatch &&
    start(async () => {
      const r = await runCapability('importCsv', { stage: 'undo', kind: lastBatch.kind, batchId: lastBatch.batchId });
      setMsg(r.ok ? `Undone: ${r.data.undone ?? 0} rows removed.` : r.error.message);
      if (r.ok) {
        setLastBatch(null);
        router.refresh();
      }
    });

  async function onFile(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    setCsv(text);
    setMapping(undefined);
    run('preview', undefined, text);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={label} htmlFor={`${id}-kind`}>What’s in the file</label>
          <select id={`${id}-kind`} className={`${input} mt-1`} value={kind} onChange={(e) => { setKind(e.target.value as Kind); setPreview(null); setMapping(undefined); }}>
            <option value="members">People (and remaining balances)</option>
            <option value="leave">Booked leave</option>
            {coverage && (
              <>
                <option value="credentials">Staff credentials (CPR, permits)</option>
                <option value="shifts">Weekly schedules</option>
                <option value="hours">Hours worked (for sick leave)</option>
              </>
            )}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-file`}>CSV file</label>
          <input id={`${id}-file`} type="file" accept=".csv,text/csv" className="mt-1 block text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={dayFirst} onChange={(e) => setDayFirst(e.target.checked)} /> Dates are day-first (31/12/2026)
        </label>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-muted">Or try a sample:</span>
        {samples.map((s) => (
          <button key={s.name} className="underline" onClick={() => { setKind(s.kind); setCsv(s.csv); setMapping(undefined); run('preview', undefined, s.csv, s.kind); }}>
            {s.name}
          </button>
        ))}
      </div>

      {preview && (
        <>
          <fieldset className="rounded-md border border-line p-3">
            <legend className="px-1 text-sm font-medium text-ink">Columns</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {preview.targets.map((t) => (
                <div key={t}>
                  <label className="text-xs text-muted" htmlFor={`${id}-map-${t}`}>{t}</label>
                  <select
                    id={`${id}-map-${t}`}
                    className={`${input} mt-0.5`}
                    value={mapping?.[t] ?? ''}
                    onChange={(e) => {
                      const next = { ...(mapping ?? {}) };
                      if (e.target.value === '') delete next[t];
                      else next[t] = Number(e.target.value);
                      setMapping(next);
                      run('preview', next);
                    }}
                  >
                    <option value="">(not in file)</option>
                    {preview.header.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="mb-1 text-left text-muted">
                {preview.rows.length} rows · {preview.errorCount === 0 ? 'no problems' : `${preview.errorCount} problems`}
              </caption>
              <thead>
                <tr className="text-left text-muted">
                  <th className="p-1">Line</th>
                  {preview.targets.filter((t) => mapping?.[t] != null).map((t) => <th key={t} className="p-1">{t}</th>)}
                  <th className="p-1">Check</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className="border-t border-line align-top">
                    <td className="p-1 text-muted">{r.line}</td>
                    {preview.targets.filter((t) => mapping?.[t] != null).map((t) => <td key={t} className="p-1">{r.values[t]}</td>)}
                    <td className="p-1">{r.errors.length ? r.errors.map((e) => <div key={e}><Badge tone="bad">!</Badge> {e}</div>) : <Badge>OK</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={pending || preview.errorCount > 0} onClick={() => run('commit')}>Import {preview.rows.length} rows</button>
            <button className={btnSecondary} onClick={() => { setPreview(null); setCsv(''); }}>Start over</button>
          </div>
        </>
      )}
      {msg && <p role="status" className="text-sm font-medium text-ink">{msg}</p>}
      {lastBatch && UNDOABLE.includes(lastBatch.kind) && (
        <button className={btnSecondary} disabled={pending} onClick={undo}>Undo this import ({lastBatch.count} rows)</button>
      )}
    </div>
  );
}
