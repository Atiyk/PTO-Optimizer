'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityName } from '@/capabilities/registry';
import { btnPrimary, input, label } from './ui';

export type Field =
  | { name: string; label: string; type: 'text' | 'date' | 'number'; required?: boolean; placeholder?: string; step?: string; defaultValue?: string | number }
  | { name: string; label: string; type: 'select'; options: { value: string; label: string }[]; defaultValue?: string; nullable?: boolean }
  | { name: string; label: string; type: 'checkbox'; defaultValue?: boolean }
  | { name: string; label: string; type: 'tags'; placeholder?: string };

/**
 * A small declarative form that runs one capability. Field values are typed (numbers,
 * booleans, nulls); `fixed` fields (e.g. { op: 'addTeam' }) are merged in.
 */
export function CapabilityForm({
  capability,
  fixed = {},
  fields,
  submitLabel,
  onDoneMessage,
  showResultField,
}: {
  capability: CapabilityName;
  fixed?: Record<string, unknown>;
  fields: Field[];
  submitLabel: string;
  onDoneMessage?: string;
  /** Show this key of the result after success (e.g. an invite token). */
  showResultField?: { key: string; prefix?: string; label: string };
}) {
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      const raw = fd.get(f.name);
      if (f.type === 'checkbox') payload[f.name] = raw === 'on';
      else if (f.type === 'number') payload[f.name] = raw === '' || raw == null ? undefined : Number(raw);
      else if (f.type === 'tags') payload[f.name] = String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      else if (f.type === 'select' && f.nullable && raw === '') payload[f.name] = null;
      else payload[f.name] = raw === '' ? undefined : String(raw);
    }
    const form = e.currentTarget;
    start(async () => {
      const r = await runCapability(capability, payload);
      if (r.ok) {
        setMsg(onDoneMessage ?? 'Saved.');
        if (showResultField) {
          const v = (r.data as Record<string, unknown>)[showResultField.key];
          setShown(typeof v === 'string' ? `${showResultField.prefix ?? ''}${v}` : null);
        }
        form.reset();
        router.refresh();
      } else setMsg(r.error.message);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.name} className={f.type === 'checkbox' ? 'flex items-center gap-2 pt-6' : ''}>
            {f.type === 'checkbox' ? (
              <>
                <input id={`${id}-${f.name}`} name={f.name} type="checkbox" defaultChecked={f.defaultValue} className="h-4 w-4 accent-[var(--accent)]" />
                <label className={label} htmlFor={`${id}-${f.name}`}>{f.label}</label>
              </>
            ) : (
              <>
                <label className={label} htmlFor={`${id}-${f.name}`}>{f.label}</label>
                {f.type === 'select' ? (
                  <select id={`${id}-${f.name}`} name={f.name} defaultValue={f.defaultValue} className={`${input} mt-1`}>
                    {f.nullable && <option value="">—</option>}
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`${id}-${f.name}`}
                    name={f.name}
                    type={f.type === 'tags' ? 'text' : f.type}
                    step={f.type === 'number' ? (f.step ?? 'any') : undefined}
                    required={'required' in f ? f.required : undefined}
                    placeholder={'placeholder' in f ? f.placeholder : undefined}
                    defaultValue={'defaultValue' in f ? (f.defaultValue as string | number | undefined) : undefined}
                    className={`${input} mt-1`}
                  />
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnPrimary} disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        {msg && <span role="status" className="text-sm text-ink">{msg}</span>}
      </div>
      {shown && showResultField && (
        <div className="rounded-md border border-line bg-surface p-3 text-sm">
          <div className="font-medium text-ink">{showResultField.label}</div>
          <input readOnly value={shown} onFocus={(e) => e.currentTarget.select()} className={`${input} mt-1 font-mono`} aria-label={showResultField.label} />
        </div>
      )}
    </form>
  );
}
