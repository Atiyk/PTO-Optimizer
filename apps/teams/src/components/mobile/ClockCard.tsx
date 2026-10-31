'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { runCapability } from '@/app/actions';
import type { CapabilityOutput } from '@/capabilities/registry';

type Clock = CapabilityOutput<'getMyTimeClock'>;

const dur = (mins: number) => {
  const m = Math.max(0, Math.floor(mins));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
};

/**
 * One big button: clock in, take a meal break, clock out. Times are the server's (no
 * back-dating). At sites with rest-break rules, clocking out asks one yes/no question.
 */
export function ClockCard({ initial }: { initial: Clock }) {
  const router = useRouter();
  const [clock, setClock] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loadedAt] = useState(() => Date.now());
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (clock.state === 'off') return;
    const t = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [clock.state]);

  const punch = (op: 'in' | 'out' | 'break_start' | 'break_end', extra: { restBreaksTaken?: boolean } = {}) =>
    start(async () => {
      setError(null);
      const r = await runCapability('clockPunch', { op, breakKind: 'meal', idempotencyKey: crypto.randomUUID(), ...extra });
      if (r.ok) {
        setClock(r.data);
        setAsking(false);
        router.refresh();
      } else setError(r.error.message);
    });

  const liveMinutes = clock.workedMinutes + (clock.state === 'working' ? (tick - loadedAt) / 60_000 : 0);
  const meal = clock.mealsDue.find((m) => !m.taken) ?? null;
  const big = 'min-h-16 w-full rounded-lg text-lg font-semibold';

  return (
    <section aria-labelledby="clock-h" className="rounded-xl border border-line bg-page p-4 shadow-sm">
      <h2 id="clock-h" className="text-xs font-semibold tracking-wide text-muted uppercase">
        Time clock
      </h2>
      <div role="status" aria-live="polite">
        {clock.state === 'off' && <p className="mt-1 text-base text-ink">You’re clocked out.</p>}
        {clock.state === 'working' && (
          <p className="mt-1 text-base text-ink">
            On the clock since <span className="font-semibold tabular-nums">{clock.since}</span> · <span className="tabular-nums">{dur(liveMinutes)}</span>
          </p>
        )}
        {clock.state === 'on_break' && (
          <p className="mt-1 text-base text-ink">
            On a meal break since <span className="font-semibold tabular-nums">{clock.breakSince}</span>. Worked <span className="tabular-nums">{dur(liveMinutes)}</span> so far.
          </p>
        )}
      </div>
      {clock.state === 'working' && meal && (
        <p className="mt-2 rounded-md border-l-4 border-ink bg-band px-3 py-2 text-sm text-ink">
          Meal break of {meal.minutes} min{meal.dueBy ? ` due by ${meal.dueBy}` : ' due'}.
        </p>
      )}
      <div className="mt-4 space-y-2">
        {clock.state === 'off' && (
          <button onClick={() => punch('in')} disabled={pending} className={`${big} bg-accent text-white`}>
            {pending ? 'Clocking in…' : 'Clock in'}
          </button>
        )}
        {clock.state === 'working' && !asking && (
          <>
            <button onClick={() => punch('break_start')} disabled={pending} className={`${big} border-2 border-ink bg-page text-ink`}>
              Start meal break
            </button>
            <button onClick={() => (clock.askRestAttestation ? setAsking(true) : punch('out'))} disabled={pending} className={`${big} bg-accent text-white`}>
              Clock out
            </button>
          </>
        )}
        {clock.state === 'on_break' && !asking && (
          <>
            <button onClick={() => punch('break_end')} disabled={pending} className={`${big} bg-accent text-white`}>
              End break
            </button>
            <button onClick={() => (clock.askRestAttestation ? setAsking(true) : punch('out'))} disabled={pending} className="min-h-12 w-full rounded-md border border-line text-base text-ink">
              Clock out
            </button>
          </>
        )}
        {asking && (
          <div className="space-y-2 rounded-lg border-2 border-ink p-3">
            <p className="font-semibold text-ink">Did you get your paid rest breaks today?</p>
            <p className="text-sm text-muted">{clock.restBreaksSoFar > 0 ? `${clock.restBreaksSoFar} × 10 min for a shift this long.` : 'Answer for the shift you’re ending.'}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => punch('out', { restBreaksTaken: true })} disabled={pending} className="min-h-14 rounded-md bg-accent text-base font-semibold text-white">
                Yes, clock out
              </button>
              <button onClick={() => punch('out', { restBreaksTaken: false })} disabled={pending} className="min-h-14 rounded-md border-2 border-gap-line bg-gap-bg text-base font-semibold text-gap-text">
                No, clock out
              </button>
            </div>
            <button onClick={() => setAsking(false)} className="min-h-12 w-full rounded-md border border-line text-base text-ink">
              Not yet
            </button>
          </div>
        )}
        {error && <p className="text-sm font-medium text-ink">{error}</p>}
      </div>
      <p className="mt-3 text-sm text-muted">
        This week: <span className="font-semibold text-ink tabular-nums">{clock.week.bands.total} h</span>
        {clock.week.bands.overtime + clock.week.bands.doubleTime > 0
          ? ` · ${clock.week.bands.overtime} h overtime${clock.week.bands.doubleTime ? `, ${clock.week.bands.doubleTime} h double time` : ''}`
          : clock.rules.overtime
            ? ` · ${clock.rules.overtime.split(';')[0]!.replace(/^Overtime /, 'overtime starts ')}`
            : ''}
      </p>
    </section>
  );
}
