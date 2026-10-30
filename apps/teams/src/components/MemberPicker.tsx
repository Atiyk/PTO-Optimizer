'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useTransition } from 'react';
import { input, label } from './ui';

/** Person selector that lives in the URL (?member=), so the view reproduces from a link. */
export function MemberPicker({ people, value }: { people: { id: string; name: string }[]; value: string }) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div className="max-w-sm" aria-busy={pending}>
      <label className={label} htmlFor={`${id}-member`}>Person</label>
      <select
        id={`${id}-member`}
        className={`${input} mt-1`}
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set('member', e.target.value);
          start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
      >
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}
