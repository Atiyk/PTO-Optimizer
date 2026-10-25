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
}

const DATE_FIELD_CLASS =
  'h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm text-slate-800 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500';

/**
 * Always-visible primary inputs - country, date range, PTO days. Only the state
 * (subdivision) picker and the "More options" panel (accrual, expiry, work week, blackout
 * dates, etc) are collapsed behind the "Adjust" disclosure in App.tsx - the two sliders
 * and "Show alternatives" are always visible too (see `PlanSliders`), since they're how
 * most visitors actually shape the plan, not an advanced/secondary setting.
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
}: PrimaryControlsProps) {
  const locale = localeForCountry(country);

  return (
    <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
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
        {budgetSpent < budget && (
          <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
            Using {budgetSpent} of {budget} days &mdash; the remaining {budget - budgetSpent} add no days off at any
            position.
          </span>
        )}
      </label>
    </div>
  );
}
