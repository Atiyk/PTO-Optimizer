import { useState, useRef, useEffect, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Break, WorkWeek } from '@daysoff/engine/solver/types';
import { formatWorkingDaysList, formatManagerEmailShort, formatManagerEmailDetailed, copyText } from './requestText';
import { formatCardDateRange } from '@daysoff/engine/calendar/dateFormat';
import { requestByText, isContested } from '@daysoff/engine/calendar/requestDeadline';
import { buttonClasses } from './Button';
import { Chevron } from './Chevron';

interface BreakCardProps {
  brk: Break;
  /** Returns false when the request could not be added (the card then says so). */
  onTrack?: (brk: Break) => boolean | void;
  /** Lets the compact summary above the calendar link straight to this card. */
  anchorId?: string;
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
        className={buttonClasses('secondary', 'md', 'min-h-11 px-4')}
      >
        {feedback === 'copied' ? 'Copied' : feedback === 'failed' ? 'Copy unavailable' : <>Copy request <Chevron direction={open ? 'up' : 'down'} /></>}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Copy request format"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 z-20 mt-1 min-w-[13rem] max-w-[calc(100vw-2rem)] rounded-[4px] border border-line-strong bg-surface py-1 shadow-lg"
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
              className="flex min-h-11 w-full items-center px-3 py-2 text-left text-sm text-ink hover:bg-surface-alt focus-visible:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
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
  anchorId,
}: BreakCardProps) {
  // Tracking confirms in place; the page no longer jumps to the tracker.
  const [tracked, setTracked] = useState<'yes' | 'no' | null>(null);
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
      id={anchorId}
      onMouseEnter={() => onHover(brk.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(brk.id)}
      onBlur={() => onHover(null)}
      className={`grid grid-cols-1 gap-x-3 rounded-[4px] px-3 py-4 sm:grid-cols-[auto_minmax(0,1fr)] transition-colors duration-150 ease-[var(--ease-out)] sm:gap-x-4 sm:px-4 ${
        // The hovered break gets one tone step (chrome never takes the marker; its days get
        // the stronger marker pass on the calendar at the same moment).
        highlighted ? 'bg-surface-alt' : 'bg-transparent'
      }`}
    >
      {/* The same number its calendar badge shows: one shared, chronological index. */}
      <span aria-hidden="true" className="mt-0.5 hidden h-7 min-w-7 items-center justify-center rounded-[3px] bg-ink px-1 text-sm font-bold tabular-nums text-white sm:flex">
        {index}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="text-xl font-bold leading-7 text-ink type-condensed">
          <span className="sr-only">Break {index}: </span>
          <span aria-hidden="true" className="mr-2 inline-flex h-6 min-w-6 -translate-y-0.5 items-center justify-center rounded-[3px] bg-ink px-1 align-middle text-sm font-bold tabular-nums text-white sm:hidden">{index}</span>
          {formatCardDateRange(brk.start, brk.end)}
        </h3>
        {/* What it costs and what it buys, in words; the multiplier figure is kept beside
            its plain reading ("each PTO day buys 2.25 days off"). */}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] tabular-nums text-ink">
          <span>
            <span className="mark font-semibold">{brk.totalDaysOff} {dayWord} off</span> for {brk.ptoCost} PTO {ptoWord}
          </span>
          <span className="text-sm text-muted">
            {brk.multiplier.toFixed(2)}× · {lowValue ? 'no extra days beyond the PTO itself' : `each PTO day buys ${brk.multiplier.toFixed(2)} days off`}
          </span>
          {brk.tags.map((tag) => (
            <span key={tag} className="rounded-[3px] bg-surface-alt px-2 py-0.5 text-xs font-medium text-ink">
              {tag}
            </span>
          ))}
          {contested && (
            <span className="rounded-[3px] bg-surface-alt px-2 py-0.5 text-xs font-medium text-ink">Popular dates</span>
          )}
        </p>

        {/* Every recommendation states its own reasoning, visibly, not in a tooltip. */}
        <p className="text-sm text-muted">{reason}</p>

        {/* Advice, not an error: the single most contested break in the plan. */}
        {isMostContested && (
          <p className="text-sm text-muted">
            Estimated popular vacation dates based on public travel demand, not coworkers&apos; calendars.
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {onTrack && tracked !== 'yes' && (
            <button
              type="button"
              onClick={() => setTracked(onTrack(brk) === false ? 'no' : 'yes')}
              className={buttonClasses('secondary', 'md', 'min-h-11 px-4')}
            >
              Track this PTO request
            </button>
          )}
          {tracked === 'yes' && (
            <p className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>
              <span className="font-semibold">Tracked</span>
              <a href="#requests" className="link-mark">See My PTO requests</a>
            </p>
          )}
          {tracked !== null && <span role="status" className="sr-only">{tracked === 'yes' ? 'Request tracked in My PTO requests.' : 'This request could not be added. See My PTO requests.'}</span>}
          {tracked === 'no' && <a href="#requests" className="link-mark flex min-h-11 items-center text-sm">Not added: see My PTO requests</a>}
          {/* The request tools (request-by date and the copy menu) open per break, so a
              ten-break plan does not repeat ten menus. */}
          {!expanded && (
            <button type="button" aria-expanded="false" onClick={() => setUserExpanded(true)} className={buttonClasses('quiet', 'md', 'min-h-11')}>
              Request this time off <Chevron />
            </button>
          )}
        </div>
        {expanded && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <p className="text-sm text-muted">{requestLine}</p>
            <div className="flex flex-wrap items-center gap-2">
              <CopyRequestDropdown
                options={[
                  { label: 'Copy date list', text: formatWorkingDaysList(brk, isPtoDay) },
                  { label: 'Copy email draft', text: formatManagerEmailShort(brk, isPtoDay) },
                  { label: 'Copy detailed email draft', text: formatManagerEmailDetailed(brk, isPtoDay, noticePeriodDays, workWeek) },
                ]}
              />
              <button type="button" aria-expanded="true" onClick={() => setUserExpanded(false)} className={buttonClasses('quiet', 'md', 'min-h-11')}>
                Hide request tools <Chevron direction="up" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
