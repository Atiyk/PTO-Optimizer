'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { input, label } from './ui';

/** Site, first day and number of weeks live in the URL; the forecast recomputes on every change. */
export function ForecastControls({ sites, site, start, weeks }: { sites: { id: string; name: string }[]; site: string; start: string; weeks: number }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [day, setDay] = useState(start);
  const [n, setN] = useState(String(weeks));
  const [seen, setSeen] = useState(`${start}|${weeks}`);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (`${start}|${weeks}` !== seen) {
    setSeen(`${start}|${weeks}`);
    setDay(start);
    setN(String(weeks));
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v == null || v === '') next.delete(k);
    else next.set(k, v);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const later = (k: string, v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set(k, v), 400);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-busy={pending}>
      <div>
        <label className={label} htmlFor={`${id}-site`}>Site</label>
        <select id={`${id}-site`} className={`${input} mt-1`} value={site} onChange={(e) => set('site', e.target.value)}>
          <option value="">Every regulated site</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor={`${id}-from`}>From</label>
        <input
          id={`${id}-from`}
          type="date"
          className={`${input} mt-1`}
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) later('from', e.target.value);
          }}
        />
      </div>
      <div>
        <label className={label} htmlFor={`${id}-weeks`}>Weeks ahead</label>
        <input
          id={`${id}-weeks`}
          type="number"
          inputMode="numeric"
          min={1}
          max={12}
          className={`${input} mt-1`}
          value={n}
          onChange={(e) => {
            setN(e.target.value);
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 1 && v <= 12) later('weeks', String(v));
          }}
        />
      </div>
    </div>
  );
}
