'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityName } from '@/capabilities/registry';
import { btnPrimary, btnSecondary, input } from './ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type ExtraColumn = { name: string; label: string; type: 'select'; options: { value: string; label: string }[] } | { name: string; label: string; type: 'number'; min?: number };

type Row = { days: boolean[]; start: string; end: string; extra: Record<string, string> };

/**
 * A weekly pattern editor (demand per room, or one person's shifts). Each line picks the
 * weekdays it applies to, so a Mon–Fri pattern is one line. Saving replaces the whole week.
 */
export function WeekRowsEditor({
  capability,
  fixed,
  extra,
  initial,
  saveLabel,
}: {
  capability: CapabilityName;
  fixed: Record<string, unknown>;
  extra: ExtraColumn[];
  initial: { weekday: number; start: string; end: string; [k: string]: string | number }[];
  saveLabel: string;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(() => group(initial, extra));
  const blank = (): Row => ({
    days: [true, true, true, true, true, false, false],
    start: '08:00',
    end: '17:00',
    extra: Object.fromEntries(extra.map((c) => [c.name, c.type === 'select' ? (c.options[0]?.value ?? '') : ''])),
  });
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    const out = rows.flatMap((r) =>
      r.days.flatMap((on, weekday) =>
        on ? [{ weekday, start: r.start, end: r.end, ...Object.fromEntries(extra.map((c) => [c.name, c.type === 'number' ? Number(r.extra[c.name]) : r.extra[c.name]])) }] : [],
      ),
    );
    start(async () => {
      const res = await runCapability(capability, { ...fixed, rows: out });
      setMsg(res.ok ? 'Saved.' : res.error.message);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-sm text-muted">Nothing set yet.</p>}
      {rows.map((r, i) => (
        <fieldset key={i} className="rounded-md border border-line p-2">
          <legend className="sr-only">Line {i + 1}</legend>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
            {DAYS.map((d, wd) => (
              <label key={d} className={`cursor-pointer rounded border px-2 py-1 text-xs ${r.days[wd] ? 'border-ink bg-ink text-page' : 'border-line text-ink'}`}>
                <input type="checkbox" className="sr-only" checked={r.days[wd]} onChange={(e) => update(i, { days: r.days.map((x, k) => (k === wd ? e.target.checked : x)) })} />
                {d}
              </label>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-muted">
              From
              <input type="time" className={`${input} mt-0.5`} value={r.start} onChange={(e) => update(i, { start: e.target.value })} />
            </label>
            <label className="text-xs text-muted">
              To
              <input type="time" className={`${input} mt-0.5`} value={r.end} onChange={(e) => update(i, { end: e.target.value })} />
            </label>
            {extra.map((c) => (
              <label key={c.name} className="text-xs text-muted">
                {c.label}
                {c.type === 'select' ? (
                  <select className={`${input} mt-0.5`} value={r.extra[c.name]} onChange={(e) => update(i, { extra: { ...r.extra, [c.name]: e.target.value } })}>
                    {c.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input type="number" min={c.min ?? 0} className={`${input} mt-0.5`} value={r.extra[c.name]} onChange={(e) => update(i, { extra: { ...r.extra, [c.name]: e.target.value } })} />
                )}
              </label>
            ))}
          </div>
          <button type="button" className="mt-2 text-xs text-muted underline" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
            Remove line
          </button>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" id={`${id}-add`} className={btnSecondary} onClick={() => setRows((rs) => [...rs, blank()])}>Add line</button>
        <button type="button" className={btnPrimary} disabled={pending} onClick={save}>{pending ? 'Saving…' : saveLabel}</button>
        {msg && <span role="status" className="text-sm text-ink">{msg}</span>}
      </div>
    </div>
  );
}

/** Collapse per-weekday rows that share times and values into one line with several days. */
function group(initial: { weekday: number; start: string; end: string; [k: string]: string | number }[], extra: ExtraColumn[]): Row[] {
  const lines = new Map<string, Row>();
  for (const r of initial) {
    const ex = Object.fromEntries(extra.map((c) => [c.name, String(r[c.name] ?? '')]));
    const key = JSON.stringify([r.start, r.end, ex]);
    const line = lines.get(key) ?? { days: [false, false, false, false, false, false, false], start: r.start, end: r.end, extra: ex };
    line.days[r.weekday] = true;
    lines.set(key, line);
  }
  return [...lines.values()];
}
