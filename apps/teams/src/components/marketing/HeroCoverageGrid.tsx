'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { SourceChip } from '@/components/SourceChip';
import type { HeroExampleData } from './heroExample';

/*
 * The hero's interactive coverage grid: rooms × half hours, each cell "staff counted /
 * required". All numbers arrive precomputed by the engine (heroExample.ts, on the server);
 * this component only plays the scripted call-off and shows the result.
 *
 * - State is never carried by colour alone: gap cells get the alert fill, a hatch pattern, a
 *   heavy border and bold text, and screen readers hear "below ratio".
 * - Plays once on load only without prefers-reduced-motion; otherwise it renders the end
 *   state. CSS transitions only, no animation library.
 */

const EVENT_DELAY = 700;
const CELL_DELAY = 420;

type Step = number; // -1: before the call-off; 0: call-off shown; k: first k gap cells shown.

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function HeroCoverageGrid({ data }: { data: HeroExampleData }) {
  const { gap } = data;
  const gapRoom = data.rooms.find((r) => r.id === gap.roomId)!;
  const gapMinutes = gapRoom.cells.filter((c) => c.after < c.required).map((c) => c.minute);
  const total = gapMinutes.length;

  const [step, setStep] = useState<Step>(-1);
  const [selected, setSelected] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [overflowing, setOverflowing] = useState(false);
  const timers = useRef<number[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const cellButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const detailsId = useId();
  const done = step >= total;

  const play = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setSelected(false);
    if (reducedMotion()) {
      setStep(total);
      return;
    }
    setStep(-1);
    timers.current.push(window.setTimeout(() => setStep(0), EVENT_DELAY));
    for (let k = 1; k <= total; k++) timers.current.push(window.setTimeout(() => setStep(k), EVENT_DELAY + 500 + k * CELL_DELAY));
  }, [total]);

  useEffect(() => {
    play();
    return () => timers.current.forEach((t) => window.clearTimeout(t));
  }, [play]);

  // Announce the gap once it is fully shown (once per play, never per cell).
  useEffect(() => {
    if (done) setAnnounce(`${data.event.name} called in sick at ${data.event.time}. ${gap.roomName} is below ratio from ${gap.from} to ${gap.to}: ${gap.present} of ${gap.required} staff.`);
    else setAnnounce('');
  }, [done, data.event, gap]);

  // Show the scroll cue only when the table really overflows its box.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isGap = (roomId: string, minute: number) => {
    if (roomId !== gap.roomId) return false;
    const i = gapMinutes.indexOf(minute);
    return i >= 0 && i < step;
  };

  const onCellKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? total - 1 : null;
    if (next == null) return;
    e.preventDefault();
    cellButtons.current[Math.max(0, Math.min(total - 1, next))]?.focus();
  };

  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5" aria-labelledby={`${detailsId}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${detailsId}-title`} className="font-semibold text-ink">
          {data.dayLabel}, by room <span className="font-normal text-muted">· {data.centre}</span>
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-sm text-muted">Example</span>
          <button type="button" onClick={play} className="rounded-md border border-line px-2.5 py-1 text-sm font-medium text-ink hover:bg-surface">
            Replay
          </button>
        </div>
      </div>

      <p className={`mt-3 flex min-h-8 items-center gap-2 text-sm transition-opacity duration-300 ${step >= 0 ? 'opacity-100' : 'opacity-0'}`} aria-hidden={step < 0}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-ink">
          <PhoneIcon />
          <span>
            <strong className="font-semibold">{data.event.name} called in sick</strong>, {data.event.time}
          </span>
        </span>
      </p>

      <div className="relative mt-2">
        <div ref={scroller} className="overflow-x-auto pb-1" tabIndex={overflowing ? 0 : -1} role={overflowing ? 'region' : undefined} aria-label={overflowing ? 'Coverage grid, scrolls sideways' : undefined}>
          <table className="border-separate border-spacing-1 text-center text-sm tabular-nums">
            <caption className="sr-only">
              Example: staff counted in ratio against staff required, per room and half hour, {data.gridFrom} to {data.gridTo}.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-card pr-2 text-left font-medium text-muted">
                  Room
                </th>
                {gapRoom.cells.map((c) => (
                  <th key={c.minute} scope="col" className="min-w-11 px-0.5 font-medium text-muted">
                    {c.time}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((room) => (
                <tr key={room.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-card pr-2 text-left font-medium whitespace-nowrap text-ink">
                    {room.name}
                  </th>
                  {room.cells.map((c) => {
                    const gapNow = isGap(room.id, c.minute);
                    const staff = gapNow ? c.after : c.before;
                    const label = `${room.name}, ${c.time}, ${staff} of ${c.required} staff, ${gapNow ? 'below ratio' : 'in ratio'}`;
                    if (gapNow) {
                      const i = gapMinutes.indexOf(c.minute);
                      return (
                        <td key={c.minute} className="h-10 p-0">
                          <button
                            ref={(el) => {
                              cellButtons.current[i] = el;
                            }}
                            type="button"
                            tabIndex={i === 0 ? 0 : -1}
                            aria-expanded={selected}
                            aria-controls={detailsId}
                            onClick={() => setSelected(true)}
                            onKeyDown={(e) => onCellKey(e, i)}
                            className="hero-gap-cell h-10 w-full min-w-11 rounded-md border-2 border-gap-line font-bold text-gap-text"
                          >
                            <span aria-hidden="true">
                              {staff}/{c.required}
                            </span>
                            <span className="sr-only">{label}. Show the rule and who can cover.</span>
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={c.minute} className="h-10 min-w-11 rounded-md border border-ok-line bg-ok-bg text-ok-text transition-colors duration-300">
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
        {overflowing && (
          <p className="mt-1 flex items-center justify-end gap-1 text-sm text-muted" aria-hidden="true">
            Scroll for later times <span>→</span>
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-4 w-5 rounded-sm border border-ok-line bg-ok-bg" aria-hidden="true" />
          In ratio
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="hero-gap-cell inline-block h-4 w-5 rounded-sm border-2 border-gap-line" aria-hidden="true" />
          Below ratio
        </span>
        <span>Each cell: staff counted / staff required</span>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <div className={`mt-4 transition-opacity duration-300 ${done ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={!done}>
        <button
          type="button"
          tabIndex={done ? 0 : -1}
          aria-expanded={selected}
          aria-controls={detailsId}
          onClick={() => setSelected((s) => !s)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border-l-4 border-gap-line bg-gap-bg px-3 py-2.5 text-left"
        >
          <span>
            <span className="block font-semibold text-gap-text">
              {gap.roomName}, {gap.from}–{gap.to}: {gap.required - gap.present} staff short
            </span>
            <span className="block text-sm text-ink">{selected ? 'Hide the rule and cover options' : 'See the rule and who can cover'}</span>
          </span>
          <span aria-hidden="true" className={`text-gap-text transition-transform duration-200 ${selected ? 'rotate-90' : ''}`}>
            ›
          </span>
        </button>
      </div>

      <div id={detailsId} hidden={!selected || !done} className="mt-3 space-y-4 text-sm">
        <div>
          <h3 className="font-semibold text-ink">The rule</h3>
          <p className="mt-1 text-ink">
            {gap.rule} <SourceChip source={gap.source} />
          </p>
          <p className="mt-1 text-muted">
            {gap.children} toddlers ÷ {gap.childrenPerStaff} per teacher = {gap.required} needed; {gap.present} here after the call-off.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-ink">Who can cover, ranked</h3>
          <ol className="mt-1 space-y-1.5">
            {data.options.map((o) => (
              <li key={o.name} className="flex gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-strong" aria-hidden="true">
                  {o.rank}
                </span>
                <span>
                  <span className="sr-only">{o.rank}. </span>
                  <span className="font-semibold text-ink">{o.name}</span> <span className="text-muted">· {o.reason}</span>
                </span>
              </li>
            ))}
          </ol>
          {data.skipped && (
            <p className="mt-2 text-muted">
              <span className="font-semibold text-ink">Skipped: {data.skipped.name}</span> · {data.skipped.reason}.
              {data.busy > 0 && ` ${data.busy} others are already working then.`}
            </p>
          )}
        </div>
        <p className="border-t border-line pt-3 text-muted">
          Example with made-up people. Counts and ranking come from the same engine the app uses, with {data.state}’s toddler ratio. Not legal advice.
        </p>
      </div>
    </figure>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" focusable="false">
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 12.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
