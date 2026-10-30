'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { input, label } from './ui';

/** Site, date and "count pending leave" live in the URL; the page recomputes on every change. */
export function CoverageControls({ sites, site, date, likely }: { sites: { id: string; name: string }[]; site: string; date: string; likely: boolean }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [day, setDay] = useState(date);
  const [seen, setSeen] = useState(date);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (date !== seen) {
    setSeen(date);
    setDay(date);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v == null) next.delete(k);
    else next.set(k, v);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-busy={pending}>
      {sites.length > 1 && (
        <div>
          <label className={label} htmlFor={`${id}-site`}>Site</label>
          <select id={`${id}-site`} className={`${input} mt-1`} value={site} onChange={(e) => set('site', e.target.value)}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={label} htmlFor={`${id}-date`}>Week from</label>
        <input
          id={`${id}-date`}
          type="date"
          className={`${input} mt-1`}
          value={day}
          onChange={(e) => {
            const v = e.target.value;
            setDay(v);
            if (timer.current) clearTimeout(timer.current);
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) timer.current = setTimeout(() => set('date', v), 400);
          }}
        />
      </div>
      <div className="flex items-center gap-2 sm:pt-6">
        <input id={`${id}-likely`} type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={likely} onChange={(e) => set('likely', e.target.checked ? '1' : null)} />
        <label className={label} htmlFor={`${id}-likely`}>Count pending leave as out</label>
      </div>
    </div>
  );
}
