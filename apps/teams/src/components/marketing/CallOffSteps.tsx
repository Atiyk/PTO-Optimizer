'use client';

import { useId, useState, type ReactNode } from 'react';
import { SourceChip } from '@/components/SourceChip';
import type { CallOffStepsData } from './heroExample';

/*
 * Landing page section 2: a call-off, step by step. The hero's example centre again, driven by
 * buttons (no autoplay, so it is reduced-motion safe by construction): the sick call, the gap
 * with its rule, the ranked offers, the accepted cover. Every count arrives from the engine
 * (heroExample.ts on the server); this component only chooses which state to show.
 */

type Phase = 'before' | 'after' | 'filled';

export function CallOffSteps({ data }: { data: CallOffStepsData }) {
  const { hero, rooms, accepted } = data;
  const { gap } = hero;
  const [step, setStep] = useState(0);
  const id = useId();

  const steps: { title: string; short: string; phase: Phase; body: ReactNode }[] = [
    {
      title: `${hero.event.name} calls in sick from her phone`,
      short: 'Sick call',
      phase: 'before',
      body: (
        <div className="space-y-3">
          <p className="text-ink">
            Two taps in the staff app: <strong className="font-semibold">I can’t come in</strong>, then <strong className="font-semibold">Yes, tell my manager</strong>. No reason is
            asked, and none is stored.
          </p>
          <PhoneCallOff />
        </div>
      ),
    },
    {
      title: `The gap appears, with the rule behind it`,
      short: 'Gap and rule',
      phase: 'after',
      body: (
        <div className="space-y-2">
          <p className="font-semibold text-gap-text">
            {gap.roomName}, {gap.from}–{gap.to}: {gap.present} of {gap.required} staff
          </p>
          <p className="text-ink">
            {gap.rule} <SourceChip source={gap.source} />
          </p>
          <p className="text-muted">
            {gap.children} toddlers ÷ {gap.childrenPerStaff} per teacher = {gap.required} needed. The manager sees this the moment the call comes in, not at 09:00.
          </p>
        </div>
      ),
    },
    {
      title: `Cover offers go to the top ${hero.options.length}`,
      short: 'Offers sent',
      phase: 'after',
      body: (
        <div className="space-y-2">
          <p className="text-ink">Ranked by who may legally take it, then by fairness. Each gets an offer with Take it and Can’t.</p>
          <ol className="space-y-1.5">
            {hero.options.map((o) => (
              <li key={o.name} className="flex gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-strong" aria-hidden="true">
                  {o.rank}
                </span>
                <span>
                  <span className="sr-only">{o.rank}. </span>
                  <span className="font-semibold text-ink">{o.name}</span> <span className="text-muted">· {o.reason}</span>
                  <span className="ml-1 rounded border border-line bg-surface px-1.5 py-0.5 text-sm text-ink">Offer sent</span>
                </span>
              </li>
            ))}
          </ol>
          {hero.skipped && (
            <p className="text-muted">
              <span className="font-semibold text-ink">Not offered: {hero.skipped.name}</span> · {hero.skipped.reason}.
            </p>
          )}
        </div>
      ),
    },
    {
      title: `${accepted.name} accepts, and the room is back in ratio`,
      short: 'Accepted',
      phase: 'filled',
      body: (
        <div className="space-y-2">
          <p className="text-ink">
            <strong className="font-semibold">{accepted.name}</strong> taps Take it. Before it counts, every rule is checked again (credentials, rest, hours), and the other offers are
            withdrawn. The grid is recomputed with {accepted.name} in {gap.roomName}.
          </p>
          <p className="rounded-lg border-l-4 border-ok-line bg-ok-bg px-3 py-2 font-semibold text-ok-text">
            {gap.roomName}, {gap.from}–{gap.to}: {gap.required} of {gap.required} staff, in ratio
          </p>
        </div>
      ),
    },
  ];
  const current = steps[step]!;
  const last = steps.length - 1;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
      <ol className="space-y-2" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.short}>
            <button
              type="button"
              aria-current={i === step ? 'step' : undefined}
              aria-controls={`${id}-panel`}
              onClick={() => setStep(i)}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${i === step ? 'border-accent bg-card shadow-sm' : 'border-transparent hover:border-line hover:bg-card'}`}
            >
              <span
                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${i === step ? 'bg-accent text-white' : 'bg-accent-soft text-accent-strong'}`}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span>
                <span className="sr-only">Step {i + 1}: </span>
                <span className={`block font-semibold ${i === step ? 'text-ink' : 'text-ink'}`}>{s.title}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <figure id={`${id}-panel`} className="min-w-0 rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5" aria-labelledby={`${id}-title`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p id={`${id}-title`} className="font-semibold text-ink">
            Step {step + 1} of {steps.length}: {current.short}
          </p>
          <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-sm text-muted">Example</span>
        </div>
        <p className="sr-only" aria-live="polite">
          Step {step + 1} of {steps.length}: {current.title}
        </p>
        <StepGrid rooms={rooms} phase={current.phase} gapRoomId={gap.roomId} caption={`${hero.dayLabel}, ${current.phase === 'before' ? 'before the call-off' : current.phase === 'after' ? 'after the call-off' : `after ${accepted.name} accepted`}`} />
        <div className="mt-4 text-sm">{current.body}</div>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50">
            Previous
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => (s === last ? 0 : s + 1))}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-strong"
          >
            {step === last ? 'Start again' : 'Next step'}
          </button>
        </div>
      </figure>
    </div>
  );
}

/** The hero grid's cells (same look, same labels), read-only, for the hours around the gap. */
function StepGrid({ rooms, phase, gapRoomId, caption }: { rooms: CallOffStepsData['rooms']; phase: Phase; gapRoomId: string; caption: string }) {
  const times = rooms[0]?.cells ?? [];
  return (
    <div className="relative mt-3 overflow-x-auto pb-1" tabIndex={0} role="region" aria-label={`Coverage grid, ${caption}`}>
      <table className="border-separate border-spacing-1 text-center text-sm tabular-nums">
        <caption className="sr-only">Example: staff counted in ratio against staff required, per room and half hour, {caption}.</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-card pr-2 text-left font-medium text-muted">
              Room
            </th>
            {times.map((c) => (
              <th key={c.minute} scope="col" className="min-w-11 px-0.5 font-medium text-muted">
                {c.time}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id}>
              <th scope="row" className="sticky left-0 z-10 bg-card pr-2 text-left font-medium whitespace-nowrap text-ink">
                {room.name}
              </th>
              {room.cells.map((c) => {
                const staff = phase === 'before' ? c.before : phase === 'after' ? c.after : c.filled;
                const short = staff < c.required;
                const label = `${room.name}, ${c.time}, ${staff} of ${c.required} staff, ${short ? 'below ratio' : 'in ratio'}`;
                const changed = room.id === gapRoomId && c.after < c.required && phase === 'filled';
                return (
                  <td
                    key={c.minute}
                    className={`h-10 min-w-11 rounded-md motion-safe:transition-colors motion-safe:duration-300 ${short ? 'hero-gap-cell border-2 border-gap-line font-bold text-gap-text' : `border bg-ok-bg text-ok-text ${changed ? 'border-2 border-ok-line font-bold' : 'border-ok-line'}`}`}
                  >
                    <span aria-hidden="true">
                      {staff}/{c.required}
                    </span>
                    <span className="sr-only">{label}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The staff app's call-off confirmation, drawn from the real mobile component's pattern. */
function PhoneCallOff() {
  return (
    <div className="mx-auto w-full max-w-64 rounded-[1.75rem] border-4 border-ink/80 bg-page p-3 shadow-sm" aria-hidden="true">
      <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" />
      <div className="space-y-2 rounded-lg border-2 border-ink bg-page p-3">
        <p className="text-sm font-semibold text-ink">Tell your manager you can’t come in?</p>
        <div className="grid grid-cols-2 gap-1.5 text-sm">
          <span className="rounded-md border-2 border-ink py-1.5 text-center font-semibold text-ink">Today</span>
          <span className="rounded-md border border-line py-1.5 text-center text-ink">Tomorrow</span>
        </div>
        <p className="text-sm text-muted">You don’t have to give a reason.</p>
        <span className="block rounded-md bg-accent py-2 text-center text-sm font-semibold text-white">Yes, tell my manager</span>
      </div>
    </div>
  );
}
