'use client';

import { useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';

type OptIn = 'yes' | 'no' | 'ask';
const OPTIONS: [OptIn, string, string][] = [
  ['yes', 'Yes, send me offers', 'You’re asked a little earlier than others.'],
  ['ask', 'Sometimes', 'You get offers in the normal order.'],
  ['no', 'No offers', 'You won’t be asked to cover.'],
];

/** Whether you want cover offers, and (only when your employer turned texts on) a number for texts. */
export function CoverPrefs({ optIn, smsAvailable, smsOptIn, smsPhoneSet }: { optIn: OptIn; smsAvailable: boolean; smsOptIn: boolean; smsPhoneSet: boolean }) {
  const [value, setValue] = useState(optIn);
  const [sms, setSms] = useState(smsOptIn);
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (input: Parameters<typeof runCapability<'setMyCoverPrefs'>>[1], ok: string) =>
    start(async () => {
      const r = await runCapability('setMyCoverPrefs', input);
      setMsg(r.ok ? ok : r.error.message);
    });
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm text-ink">Do you want to be asked to cover shifts?</legend>
        {OPTIONS.map(([v, label, hint]) => (
          <label key={v} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-md border p-3 ${value === v ? 'border-2 border-ink' : 'border-line'}`}>
            <input
              type="radio"
              name="optIn"
              value={v}
              checked={value === v}
              onChange={() => {
                setValue(v);
                save({ optIn: v }, 'Saved.');
              }}
              className="mt-1 h-5 w-5"
            />
            <span>
              <span className="block text-base text-ink">{label}</span>
              <span className="block text-sm text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {smsAvailable && (
        <div className="space-y-2 border-t border-line pt-3">
          <label className="flex min-h-12 items-center gap-3 text-base text-ink">
            <input
              type="checkbox"
              checked={sms}
              onChange={(e) => {
                setSms(e.target.checked);
                save({ smsOptIn: e.target.checked }, e.target.checked ? 'Texts on.' : 'Texts off.');
              }}
              className="h-5 w-5"
            />
            Also text me offers
          </label>
          {sms && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save({ smsPhone: phone.trim() || null }, 'Number saved.');
                setPhone('');
              }}
              className="space-y-2"
            >
              <label htmlFor="phone" className="block text-sm text-ink">
                Mobile number {smsPhoneSet && <span className="text-muted">(one is saved; enter a new one to replace it)</span>}
              </label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" className="min-h-12 w-full rounded-md border border-line bg-page px-3 text-base text-ink" />
              <button type="submit" disabled={pending || !phone.trim()} className="min-h-12 w-full rounded-md border border-line text-base text-ink disabled:opacity-50">
                Save number
              </button>
            </form>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm text-ink">
          {msg}
        </p>
      )}
    </div>
  );
}
