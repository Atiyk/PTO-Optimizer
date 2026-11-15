import { useEffect, useState, type ReactNode } from 'react';
import { buttonClasses } from './Button';
import { PlusMinus } from './Chevron';
import { SaveConfirmation } from './SaveConfirmation';
import { PLAN_SAVED_MESSAGE } from './pinnedPlanStore';
import { copyText } from './requestText';
import { PRIMARY_ACTION_LABEL, type PrimaryActionKind } from './primaryAction';

interface PlanActionsProps {
  /** Phones and tablets: one full-width primary button and a "More" disclosure. Desktop: one
   * primary button beside the page's jump links. */
  layout: 'narrow' | 'wide';
  /** null: no primary action (a 0-day balance has nothing to keep); "More" still shows. */
  kind: PrimaryActionKind | null;
  disabled?: boolean;
  disabledTitle?: string;
  onKeep: () => void;
  /** The email draft for the next break still to ask for (kind "copy-request"). */
  request?: { text: string; range: string };
  pinMessage: string;
  /** The plan was just kept: the save confirmation (Add to calendar, Back up) takes the
   * primary button's place, so the same action is never offered twice side by side. */
  justKept: boolean;
  moreOpen?: boolean;
  onMoreOpenChange?: (open: boolean) => void;
  /** Narrow: everything else (export, share, subscribe, image, partner). Wide: jump links. */
  children?: ReactNode;
}

/** Clicks the one calendar download the export panel owns (it tracks "ICS downloaded"), so
 * this button and the panel's never drift apart. */
function addToCalendar(openMore?: () => void): boolean {
  const download = document.getElementById('shortcut-download-ics');
  if (download instanceof HTMLButtonElement && !download.disabled) {
    download.click();
    return true;
  }
  openMore?.();
  return false;
}

export function PlanActions({ layout, kind, disabled = false, disabledTitle, onKeep, request, pinMessage, justKept, moreOpen = false, onMoreOpenChange, children }: PlanActionsProps) {
  // Feedback belongs to the action that produced it: a new primary action (the plan changed,
  // or was just kept) never shows the old one's message.
  const [result, setResult] = useState<{ kind: PrimaryActionKind | null; text: string } | null>(null);
  const feedback = result && result.kind === kind ? result.text : null;
  const setFeedback = (text: string | null) => setResult(text ? { kind, text } : null);
  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(() => setResult(null), 2500);
    return () => window.clearTimeout(timer);
  }, [result]);

  const onPrimary = async () => {
    if (kind === 'keep') { onKeep(); return; }
    if (kind === 'calendar') { setFeedback(addToCalendar(() => onMoreOpenChange?.(true)) ? 'Downloaded' : null); return; }
    if (request) setFeedback(await copyText(request.text) ? 'Request copied' : 'Couldn’t copy. Try again');
  };
  const label = feedback ?? (kind ? PRIMARY_ACTION_LABEL[kind] : '');
  const hint = kind === 'copy-request' && request ? `An email draft for your next break, ${request.range}.`
    : kind === 'calendar' ? 'A calendar file of your PTO days, with a reminder to request them.'
    : kind === 'keep' ? 'Saved in this browser. No account needed.' : undefined;
  const otherMessage = pinMessage && pinMessage !== PLAN_SAVED_MESSAGE ? pinMessage : '';

  const primary = kind && (
    <>
      <button
        type="button"
        data-primary-action={kind ?? undefined}
        onClick={onPrimary}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        className={buttonClasses('primary', 'md', layout === 'narrow' ? 'h-12! w-full text-base!' : 'px-4! text-sm!')}
      >
        {label}
      </button>
      <span className="sr-only" role="status">{feedback ?? ''}</span>
    </>
  );

  if (layout === 'wide') {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {justKept && <SaveConfirmation message={pinMessage} />}
        {otherMessage && <SaveConfirmation message={otherMessage} />}
        <div className="flex flex-wrap items-center gap-2">
          {!justKept && primary}
          {children}
        </div>
      </div>
    );
  }

  return (
    <section id="plan-actions" aria-labelledby="plan-actions-heading" className="flex min-w-0 scroll-mt-16 flex-col gap-2">
      <h2 id="plan-actions-heading" className="sr-only">Use this plan</h2>
      {justKept ? <SaveConfirmation message={pinMessage} /> : (
        <>
          {primary}
          {hint && <p className="text-center text-sm text-muted">{hint}</p>}
        </>
      )}
      {otherMessage && <SaveConfirmation message={otherMessage} />}
      <details
        id="more-actions"
        open={moreOpen}
        onToggle={(event) => onMoreOpenChange?.(event.currentTarget.open)}
        className="scroll-mt-16 rounded-[10px] border border-line bg-surface"
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 text-[15px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
          <span>More: download, share, subscribe</span>
          <PlusMinus open={moreOpen} />
        </summary>
        <div className="flex min-w-0 flex-col gap-5 border-t border-line px-4 pb-4 pt-4">{children}</div>
      </details>
    </section>
  );
}
