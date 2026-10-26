import { localeForCountry } from './locale';
import { CountrySelect } from './CountrySelect';

interface PrimaryControlsProps {
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
}

const DATE_FIELD_CLASS =
  'h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm text-slate-800 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500';

/**
 * Always-visible primary inputs - country, date range, PTO days. Only the state
 * (subdivision) picker and the "More options" panel (accrual, expiry, work week, blackout
 * dates, etc) are collapsed behind the "More options" disclosure in App.tsx - the two
 * sliders and "Show alternatives" are always visible too (see `PlanSliders`), since they're
 * how most visitors actually shape the plan, not an advanced/secondary setting.
 *
 * UI density pass: no longer owns its own full-width row - returns its fields directly so
 * App.tsx can lay them out in ONE shared flex row together with PlanSliders' two sliders
 * ("Country · Date range · PTO days · Reserve · What matters more? · How many breaks", all
 * one row, wrapping as it runs out of width) instead of two stacked bands.
 */
export function PrimaryControls({
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
}: PrimaryControlsProps) {
  const locale = localeForCountry(country);

  return (
    <>
      <CountrySelect country={country} onChangeCountry={onChangeCountry} />

      <fieldset className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        <legend className="text-xs font-medium text-slate-600 dark:text-slate-300">Date range</legend>
        <div className="flex items-center gap-2">
          <input
            type="date"
            lang={locale}
            aria-label="Start date"
            value={rangeStart}
            onChange={(e) => onChangeRangeStart(e.target.value)}
            className={DATE_FIELD_CLASS}
          />
          <span className="text-slate-400 dark:text-slate-400">&rarr;</span>
          <input
            type="date"
            lang={locale}
            aria-label="End date"
            value={rangeEnd}
            onChange={(e) => onChangeRangeEnd(e.target.value)}
            className={DATE_FIELD_CLASS}
          />
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        PTO days available
        <input
          type="number"
          min={0}
          max={60}
          step={1}
          value={budget}
          onChange={(e) => onChangeBudget(Number(e.target.value))}
          className={`${DATE_FIELD_CLASS} w-24`}
        />
        {/* Phase 3.2: unlimited-PTO workers still self-cap (66% at 15 or fewer) because the
            expectation is unclear, not because they prefer fewer days - this seeds a
            concrete starting number rather than leaving the field blank/undefined. The
            budget field above stays fully editable either way - this is a default, not a
            lock on the number. */}
        <span className="flex items-center gap-1.5 font-normal normal-case">
          <input
            type="checkbox"
            id="unlimited-pto"
            checked={unlimitedPto}
            onChange={(e) => onToggleUnlimitedPto(e.target.checked)}
          />
          <label htmlFor="unlimited-pto">I have unlimited PTO</label>
        </span>
        {unlimitedPto && (
          <span className="max-w-[16rem] text-xs font-normal normal-case text-slate-500 dark:text-slate-400">
            Most people with unlimited PTO take 15 days or fewer. Adjust if yours differs.
          </span>
        )}
        {/* Phase 3.1: compared against the budget actually available to the solver
            (after reserve), never the raw total - otherwise every deliberately-reserved
            day would misleadingly look like a solver failure ("add no days off at any
            position"), which is exactly what this warning must never say about a reserve. */}
        {budgetSpent < effectiveBudget && (
          <span className="text-xs font-normal normal-case text-amber-700 dark:text-amber-400">
            Using {budgetSpent} of {effectiveBudget} planned day{effectiveBudget === 1 ? '' : 's'} &mdash; the remaining{' '}
            {effectiveBudget - budgetSpent} day{effectiveBudget - budgetSpent === 1 ? '' : 's'} add no days off at any
            position.
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
        Keep in reserve
        <input
          type="number"
          min={0}
          max={budget}
          step={1}
          value={reserveDays}
          onChange={(e) => onChangeReserveDays(Number(e.target.value))}
          aria-label="Days to keep in reserve"
          className={`${DATE_FIELD_CLASS} w-24`}
        />
      </label>
    </>
  );
}
