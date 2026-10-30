'use client';

import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import { btnSecondary } from './ui';

export function ExportButtons() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const go = (format: 'json' | 'csv') =>
    start(async () => {
      const r = await runCapability('exportData', { format });
      if (!r.ok) return setMsg(r.error.message);
      for (const [name, body] of Object.entries(r.data.files)) {
        const url = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      }
      setMsg(`Downloaded ${Object.keys(r.data.files).length} file(s).`);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btnSecondary} disabled={pending} onClick={() => go('json')}>Download JSON</button>
      <button className={btnSecondary} disabled={pending} onClick={() => go('csv')}>Download CSVs</button>
      {msg && <span role="status" className="text-sm text-ink">{msg}</span>}
    </div>
  );
}
