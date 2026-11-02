import { useState, useRef, useEffect } from 'react';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import { formatWorkingDaysList, formatManagerEmailShort, formatManagerEmailDetailed, copyText } from './requestText';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { requestByText, isContested } from '@daysoff/engine/calendar/requestDeadline';

interface BreakCardProps {
  brk: Break;
  /** 1-based, chronological - the same number its calendar badge shows (see
   * useAppState's `orderedBreaks`, the one shared source for both). */
  index: number;
  highlighted?: boolean;
  isPtoDay: (iso: string) => boolean;
  onHover: (id: string | null) => void;
  /** Phase 4.2: this card's break is the single most-contested one in the whole plan. */
  isMostContested: boolean;
  /** Phase 3 step 4: one plain-language sentence on why this break is a good pick - from
   * breakReason.ts, computed in App.tsx (it needs holidayNameFor, which BreakCard doesn't
   * otherwise touch). Always present, for every card, not just the low-value ones. */
  reason: string;
  today: string;
  noticePeriodDays: number;
  workWeek: WorkWeek;
  /** UI density pass: whether the request tools (request-by line + copy dropdown) start
   * expanded. Only the first rendered card defaults to true, "so the pattern is
   * discoverable" - every other card starts collapsed to the compact summary row. */
  defaultExpanded?: boolean;
}

interface CopyOption {
  label: string;
  text: string;
}

/**
 * UI density pass: a 10-break plan used to render 30 identical copy buttons (3 per card,
 * always visible). One dropdown trigger per card instead - "Copy request", opening a small
 * menu with the same three options it always had. Closes on an outside click so it never
 * lingers open over the next card's controls.
 */
function CopyRequestDropdown({ options }: { options: CopyOption[] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        {copied ? 'Copied' : 'Copy request ▾'}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 z-10 mt-1 min-w-[12rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                const ok = await copyText(o.text);
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A break at or below 1.0x gains NO extra days off beyond the PTO day(s) spent - a
 * legitimate trade at a weighting that favours quieter travel, never a bug, but it looks
 * broken with no explanation on screen. Verified empirically (not assumed) that this is a
 * budget-maximization effect independent of w, not a demand-scaling bug - see NOTES.md.
 * Still used for the multiplier badge's styling; the explanatory text itself now comes from
 * breakReason.ts (Phase 3's unified "why" line), which covers this exact case too. */
function isLowValue(brk: Break): boolean {
  return brk.multiplier <= 1.0;
}

export function BreakCard({
  brk,
  index,
  highlighted = false,
  isPtoDay,
  onHover,
  isMostContested,
  reason,
  today,
  noticePeriodDays,
  workWeek,
  defaultExpanded = false,
}: BreakCardProps) {
  // BUG FOUND: a plain `useState(defaultExpanded)` captures its initial value once, at
  // mount, and never again - but holidays load asynchronously (see useAppState.ts), so the
  // very first render solves without them, producing a different/smaller break set than
  // the final one. Whichever break happened to be "position 0" in that transient first
  // render got defaultExpanded=true locked in permanently, even after it moved away from
  // position 0 once the real holiday-aware plan settled a moment later - while the TRUE
  // final position-0 break, being a newly-mounted instance, ALSO got defaultExpanded=true,
  // leaving two cards expanded instead of one. Confirmed empirically: logging each render
  // pass showed a different break at position 0 on the first pass than on every pass after
  // holidays finished loading. Fixed by tracking only an EXPLICIT user choice locally
  // (`userExpanded`, null until they click); absent that, `expanded` mirrors the current
  // `defaultExpanded` prop every render, so it stays correct as the plan settles instead of
  // freezing a one-time snapshot.
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const expanded = userExpanded ?? defaultExpanded;
  const lowValue = isLowValue(brk);
  const dayWord = brk.totalDaysOff === 1 ? 'day' : 'days';
  const ptoWord = brk.ptoCost === 1 ? 'day' : 'days';
  const contested = isContested(brk);
  const requestLine = requestByText(brk.start, noticePeriodDays, workWeek, today);

  return (
    <div
      onMouseEnter={() => onHover(brk.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(brk.id)}
      onBlur={() => onHover(null)}
      className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors duration-150 ease-out ${
        // A darker, heavier neutral than the resting border/surface - not a new hue. The
        // accent is reserved for suggested PTO, the primary action, and focus rings only.
        highlighted ? 'border-slate-300 bg-slate-100' : 'border-slate-200 bg-slate-50'
      }`}
    >
      {/* Phase 2: wraps instead of truncating - this card now lives in a ~40%-width
          recommendations column, not the full page width, so the date/badges row needs to
          become two lines gracefully rather than clipping the date range. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-600 text-[11px] font-semibold leading-none tabular-nums text-white">
            {index}
          </span>
          <span className="font-medium text-slate-900">
            {formatCardDateRange(brk.start, brk.end)} &middot;{' '}
            <span className="tabular-nums">{brk.totalDaysOff}</span> {dayWord} off for{' '}
            <span className="tabular-nums">{brk.ptoCost}</span> PTO {ptoWord}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Multiplier: weight and tone carry "this one's good," not a new colour - a
              category tag needs the same hue every time it appears, which stops being true
              the moment the hue also means "strong result" here. */}
          <span
            className={
              lowValue
                ? 'rounded-full bg-slate-100 px-3 py-1 text-sm font-medium tabular-nums text-slate-500'
                : 'rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold tabular-nums text-white'
            }
          >
            {brk.multiplier.toFixed(2)}x
          </span>
          {/* Every tag - including "Popular dates" below - is the same neutral pill. These
              are categories, not states: the design system reserves colour for suggested
              PTO, the primary action, focus rings, and genuine warning/error states, never
              for labelling a kind of thing. The label text alone carries the meaning. */}
          {brk.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {tag}
            </span>
          ))}
          {contested && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">Popular dates</span>
          )}
        </div>
      </div>

      {/* Phase 3 step 4: visible on the card, not a tooltip - every recommendation states
          its own reasoning, not just the low-value ones. */}
      <p className="text-sm text-slate-600">{reason}</p>

      {/* Layout fix: this used to be a full-width red bar, which reads as an error - it's
          advice, not a problem with the plan. Red is reserved for actual problems (an
          infeasible setting, a passed deadline); this is now inline text at normal size,
          directly beneath the card header, in the same neutral/subtle tone the low-value
          explanation above already uses. */}
      {isMostContested && (
        <p className="text-sm text-slate-600">
          Estimated popular vacation dates based on public travel demand, not coworkers&apos; calendars.
        </p>
      )}

      {/* UI density pass: collapsed by default (every card past the first) down to just the
          summary row and any warning above - the request-by date and the copy tools are
          "the request tools," revealed on expand, not permanent chrome on every card. */}
      {expanded ? (
        <>
          <p className="text-xs text-slate-500">{requestLine}</p>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-400">Request this time off:</span>
            <CopyRequestDropdown
              options={[
                { label: 'Copy date list', text: formatWorkingDaysList(brk, isPtoDay) },
                { label: 'Copy email draft', text: formatManagerEmailShort(brk, isPtoDay) },
                { label: 'Copy detailed email draft', text: formatManagerEmailDetailed(brk, isPtoDay, noticePeriodDays, workWeek) },
              ]}
            />
            <button
              type="button"
              onClick={() => setUserExpanded(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Hide ↑
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setUserExpanded(true)}
          className="self-start border-t border-slate-100 pt-3 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          Request this time off ↓
        </button>
      )}
    </div>
  );
}
