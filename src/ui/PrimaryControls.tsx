import { useEffect, useId } from 'react';
import { localeForCountry } from './locale';
import { CountrySelect } from './CountrySelect';
import { useWholeDayDraft } from './useWholeDayDraft';
import { NumberStepper } from './NumberStepper';

interface PrimaryControlsProps {
  advanced?: boolean;
  country: string;
  onChangeCountry: (code: string) => void;
  rangeStart: string;
  rangeEnd: string;
  onChangeRangeStart: (v: string) => void;
  onChangeRangeEnd: (v: string) => void;
  budget: number;
  onChangeBudget: (v: number) => void;
  budgetSpent: number;
  reserveDays: number;
  onChangeReserveDays: (v: number) => void;
  effectiveBudget: number;
  unlimitedPto: boolean;
  onToggleUnlimitedPto: (v: boolean) => void;
  /** F06: tells the page when the PTO field is blank, so the result can say it is an example. */
  onBudgetBlankChange?: (blank: boolean) => void;
}

const DATE_FIELD_CLASS =
  'h-11 min-w-0 rounded-[6px] border border-line-strong bg-surface px-2.5 text-[15px] font-normal tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';
const LABEL_CLASS = 'text-sm font-semibold text-ink';

/** Always-visible country, date and budget inputs. Dates stack into a shrinkable grid
 * so the native pickers remain usable on 320px screens without page-level overflow.
 * The advanced policy fields remain under More options; the two sliders never do. */
export function PrimaryControls({
  advanced = true,
  country,
  onChangeCountry,
  rangeStart,
  rangeEnd,
  onChangeRangeStart,
  onChangeRangeEnd,
  budget,
  onChangeBudget,
  budgetSpent,
  reserveDays,
  onChangeReserveDays,
  effectiveBudget,
  unlimitedPto,
  onToggleUnlimitedPto,
  onBudgetBlankChange,
}: PrimaryControlsProps) {
  const locale = localeForCountry(country);
  const budgetId = useId();
  const sliderId = useId();
  const budgetHintId = useId();
  const budgetDraft = useWholeDayDraft(budget, onChangeBudget);
  const budgetBlank = budgetDraft.empty;
  useEffect(() => { onBudgetBlankChange?.(budgetBlank); }, [budgetBlank, onBudgetBlankChange]);
  const sliderBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0;
  const maxSliderBudget = Math.max(60, sliderBudget);

  return (
    <>
      {/* PTO days and country share a row when the field group has room (a tablet); they
          stack on a phone and in the narrow desktop rail. F28: PTO days is the same −/+
          stepper as /family and /sabbatical; typing still works, and a blank field still
          means "not entered yet", never 0. */}
      <div className="@container min-w-0">
        <div className="grid min-w-0 grid-cols-1 gap-3.5 @min-[22rem]:grid-cols-[auto_minmax(0,1fr)] @min-[22rem]:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={budgetId} className={LABEL_CLASS}>PTO days available</label>
            <NumberStepper
              id={budgetId}
              value={budgetDraft.text}
              min={0}
              describedBy={budgetDraft.empty ? budgetHintId : undefined}
              onTextChange={budgetDraft.onChange}
              onBlur={budgetDraft.onBlur}
              onDecrement={() => onChangeBudget(Math.max(0, sliderBudget - 1))}
              onIncrement={() => onChangeBudget(sliderBudget + 1)}
              decrementDisabled={sliderBudget <= 0}
              decrementLabel="One fewer PTO day"
              incrementLabel="One more PTO day"
              unit="days"
            />
          </div>
          <CountrySelect country={country} onChangeCountry={onChangeCountry} widthClass="w-full" />
        </div>
        <p id={budgetHintId} role="status" className={budgetDraft.empty ? 'mt-1.5 text-sm text-muted' : 'sr-only'}>
          {budgetDraft.empty ? 'Enter your PTO days. Enter 0 if you have none.' : ''}
        </p>
      </div>

      <div className="min-w-0">
        {/* The value sits on the label row, right above the thumb's travel, so a finger on
            the slider never hides the number it is changing. */}
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={sliderId} className={LABEL_CLASS}>Adjust PTO days</label>
          <span aria-hidden="true" className="text-base font-bold tabular-nums text-ink">{sliderBudget}</span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={maxSliderBudget}
          step={1}
          value={sliderBudget}
          aria-valuetext={`${sliderBudget} PTO ${sliderBudget === 1 ? 'day' : 'days'} available`}
          onChange={(e) => onChangeBudget(Number(e.target.value))}
          className="block h-11 w-full cursor-pointer"
        />
      </div>

      <fieldset className="@container m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className={`${LABEL_CLASS} mb-1.5 p-0`}>Date range</legend>
        {/* Two columns joined by an arrow when the field has room; stacked when it does
            not (a 320px phone, the narrow desktop rail), so the native pickers never clip
            the year. */}
        <div className="grid min-w-0 grid-cols-1 items-center gap-1.5 @min-[18rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <input
            type="date"
            lang={locale}
            aria-label="Start date"
            value={rangeStart}
            onChange={(e) => onChangeRangeStart(e.target.value)}
            className={`${DATE_FIELD_CLASS} w-full max-w-full`}
          />
          <span aria-hidden="true" className="hidden text-muted @min-[18rem]:inline">&rarr;</span>
          <input
            type="date"
            lang={locale}
            aria-label="End date"
            value={rangeEnd}
            onChange={(e) => onChangeRangeEnd(e.target.value)}
            className={`${DATE_FIELD_CLASS} w-full max-w-full`}
          />
        </div>
      </fieldset>

      {advanced && (
        <ReserveControls budget={budget} reserveDays={reserveDays} onChangeReserveDays={onChangeReserveDays} unlimitedPto={unlimitedPto} onToggleUnlimitedPto={onToggleUnlimitedPto} />
      )}
      {/* Phase 3.1: compared against the budget actually available to the solver (after
          reserve), never the raw total, so a deliberate reserve never reads as a failure. */}
      {budgetSpent < effectiveBudget && (
        <p className="flex gap-2 text-sm text-ink">
          <span aria-hidden="true" className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-[2px] bg-accent" />
          <span>
            Using {budgetSpent} of {effectiveBudget} planned day{effectiveBudget === 1 ? '' : 's'} &mdash; the remaining{' '}
            {effectiveBudget - budgetSpent} day{effectiveBudget - budgetSpent === 1 ? '' : 's'} remain unplanned under your current constraints.
          </span>
        </p>
      )}
    </>
  );
}

/** Reserve days and unlimited PTO: balance settings that live with the other advanced
 * options in More options (PrimaryControls still renders them inline when `advanced`). */
export function ReserveControls({ budget, reserveDays, onChangeReserveDays, unlimitedPto, onToggleUnlimitedPto }: {
  budget: number;
  reserveDays: number;
  onChangeReserveDays: (v: number) => void;
  unlimitedPto: boolean;
  onToggleUnlimitedPto: (v: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLASS}>Keep in reserve</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={budget}
          step={1}
          value={reserveDays}
          onChange={(e) => onChangeReserveDays(Number(e.target.value))}
          aria-label="Days to keep in reserve"
          className={`${DATE_FIELD_CLASS} w-24`}
        />
      </label>
      {/* Phase 3.2: unlimited-PTO workers still self-cap, so this seeds a concrete starting
          number; the budget field stays fully editable either way. */}
      <label htmlFor="unlimited-pto" className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          id="unlimited-pto"
          checked={unlimitedPto}
          onChange={(e) => onToggleUnlimitedPto(e.target.checked)}
        />
        I have unlimited PTO
      </label>
      {unlimitedPto && (
        <span className="text-sm text-muted">
          Most people with unlimited PTO take 15 days or fewer. Adjust if yours differs.
        </span>
      )}
    </div>
  );
}
