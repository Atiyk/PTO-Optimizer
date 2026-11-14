import type { ReactNode } from 'react';

/**
 * F28: the one number-input pattern for whole counts (PTO days, weeks): a 44px − button, a
 * typeable field, a 44px + button, joined in one 6px-cornered control. Typing stays free (the
 * field is a real number input, so blank, 0 and any value are the caller's to interpret);
 * the buttons step by one and disable at the bounds. Nothing here submits: every change is
 * applied by the caller as it happens.
 *
 * The field's text is the caller's (e.g. useWholeDayDraft's draft text), so a blank field can
 * mean "not entered yet" rather than 0.
 */
export interface NumberStepperProps {
  id: string;
  /** The field's current text. */
  value: string;
  onTextChange: (text: string) => void;
  onBlur?: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  min?: number;
  max?: number;
  describedBy?: string;
  /** A unit shown after the control ("days", "weeks"); not part of the field's name. */
  unit?: ReactNode;
}

const STEP_BUTTON =
  'flex h-11 w-11 shrink-0 items-center justify-center text-lg font-semibold text-ink transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-surface-alt active:scale-[0.94] active:bg-[var(--border-default)] disabled:cursor-not-allowed disabled:text-[var(--disabled-text)] disabled:hover:bg-transparent disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]';
const FIELD =
  'h-11 w-14 min-w-0 border-x border-y-0 border-line-strong bg-surface text-center text-base font-semibold tabular-nums text-ink [appearance:textfield] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

export function NumberStepper({
  id,
  value,
  onTextChange,
  onBlur,
  onDecrement,
  onIncrement,
  decrementLabel,
  incrementLabel,
  decrementDisabled,
  incrementDisabled,
  min,
  max,
  describedBy,
  unit,
}: NumberStepperProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="inline-flex items-stretch overflow-hidden rounded-[6px] border border-line-strong bg-surface">
        <button type="button" aria-label={decrementLabel} disabled={decrementDisabled} onClick={onDecrement} className={STEP_BUTTON}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 8h9" />
          </svg>
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-describedby={describedBy}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={onBlur}
          className={FIELD}
        />
        <button type="button" aria-label={incrementLabel} disabled={incrementDisabled} onClick={onIncrement} className={STEP_BUTTON}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3.5 8h9M8 3.5v9" />
          </svg>
        </button>
      </div>
      {unit && <span className="text-sm text-muted">{unit}</span>}
    </div>
  );
}
