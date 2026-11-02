import { useState, useRef, useEffect, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import { formatWorkingDaysList, formatManagerEmailShort, formatManagerEmailDetailed, copyText } from './requestText';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { requestByText, isContested } from '@daysoff/engine/calendar/requestDeadline';

interface BreakCardProps {
  brk: Break;
  onTrack?: (brk: Break) => void;
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
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const initialFocusIndex = useRef(0);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    // A menu is not keyboard-operable until focus enters its items.
    itemRefs.current[initialFocusIndex.current]?.focus();
    function onPointerOutside(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onFocusOutside(e: FocusEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerOutside);
    document.addEventListener('focusin', onFocusOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onPointerOutside);
      document.removeEventListener('focusin', onFocusOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  function openAt(index: number) {
    initialFocusIndex.current = index;
    setOpen(true);
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Tab') {
      // Let the browser continue normal tab order rather than trapping focus.
      setOpen(false);
      return;
    }
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    let next: number;
    switch (e.key) {
      case 'ArrowDown': next = (current + 1) % options.length; break;
      case 'ArrowUp': next = (current + options.length - 1) % options.length; break;
      case 'Home': next = 0; break;
      case 'End': next = options.length - 1; break;
      default: return;
    }
    e.preventDefault();
    itemRefs.current[next]?.focus();
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? setOpen(false) : openAt(0)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          openAt(e.key === 'ArrowDown' ? 0 : options.length - 1);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {feedback === 'copied' ? 'Copied' : feedback === 'failed' ? 'Copy unavailable' : 'Copy request ▾'}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Copy request format"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 z-20 mt-1 min-w-[12rem] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-300 bg-white py-1 shadow-lg"
        >
          {options.map((option, index) => (
            <button
              key={option.label}
              ref={(element) => { itemRefs.current[index] = element; }}
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpen(false);
                triggerRef.current?.focus();
                const ok = await copyText(option.text);
                setFeedback(ok ? 'copied' : 'failed');
              }}
              className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {feedback && (
        <span role="status" className="sr-only">
          {feedback === 'copied' ? 'Request copied to clipboard.' : 'Copy unavailable. Check clipboard permissions.'}
        </span>
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
  onTrack,
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
      {onTrack && <button type="button" onClick={() => onTrack(brk)} className="min-h-11 self-start rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-alt">Track this PTO request</button>}

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
