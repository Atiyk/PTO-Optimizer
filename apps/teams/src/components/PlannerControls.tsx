'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { input, label } from './ui';

/**
 * Every control lives in the URL, so a plan reproduces from a link and the page recomputes
 * on every change (no "Generate" step).
 */
export function PlannerControls({
  teams,
  leaveTypes,
  team,
  leaveType,
  start,
}: {
  teams: { id: string; name: string }[];
  leaveTypes: { key: string; name: string }[];
  team: string;
  leaveType: string;
  start: string;
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // The date is typed segment by segment (month, day, year). Pushing every keystroke to the URL
  // re-rendered the field mid-typing, so keep it local and follow the URL after a short pause.
  const [from, setFrom] = useState(start);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [seenStart, setSeenStart] = useState(start);
  if (start !== seenStart) {
    // The URL moved (back button, a shared link): show its date.
    setSeenStart(start);
    setFrom(start);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-busy={pending}>
      <div>
        <label className={label} htmlFor={`${id}-team`}>Team</label>
        <select id={`${id}-team`} className={`${input} mt-1`} value={team} onChange={(e) => set('team', e.target.value)}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor={`${id}-type`}>Leave type</label>
        <select id={`${id}-type`} className={`${input} mt-1`} value={leaveType} onChange={(e) => set('type', e.target.value)}>
          {leaveTypes.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </div>
      <div>
        <label className={label} htmlFor={`${id}-from`}>Plan from</label>
        <input
          id={`${id}-from`}
          type="date"
          className={`${input} mt-1`}
          value={from}
          onChange={(e) => {
            const v = e.target.value;
            setFrom(v);
            if (timer.current) clearTimeout(timer.current);
            if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v !== start) timer.current = setTimeout(() => set('from', v), 600);
          }}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            if (/^\d{4}-\d{2}-\d{2}$/.test(from) && from !== start) set('from', from);
          }}
        />
      </div>
      {pending && <p className="text-sm text-muted sm:col-span-3" aria-live="polite">Recomputing…</p>}
    </div>
  );
}
