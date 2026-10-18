import type { Break } from '../solver/types';
import { localeForCountry } from './locale';
import { CountrySelect } from './CountrySelect';
import { WeightingSlider } from './WeightingSlider';
import { BreakCountSlider } from './BreakCountSlider';

interface TopBarProps {
  country: string;
  subdivision: string | undefined;
  onChangeCountry: (code: string) => void;
  onChangeSubdivision: (code: string | undefined) => void;
  rangeStart: string;
  rangeEnd: string;
  onChangeRangeStart: (v: string) => void;
  onChangeRangeEnd: (v: string) => void;
  budget: number;
  onChangeBudget: (v: number) => void;
  budgetSpent: number;
  w: number;
  onChangeW: (w: number) => void;
  manualBreakCount: number;
  onChangeManualBreakCount: (n: number) => void;
  letSolverDecide: boolean;
  onToggleLetSolverDecide: (v: boolean) => void;
  breaks: Break[];
  breakCountRequested: number;
  breakCountActual: number;
  showAlternatives: boolean;
  onChangeShowAlternatives: (v: boolean) => void;
  moreOpen: boolean;
  onToggleMore: () => void;
}

const DATE_FIELD_CLASS =
  'h-9 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 text-sm text-slate-800 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500';

export function TopBar({
  country,
  subdivision,
  onChangeCountry,
  onChangeSubdivision,
  rangeStart,
  rangeEnd,
  onChangeRangeStart,
  onChangeRangeEnd,
  budget,
  onChangeBudget,
  budgetSpent,
  w,
  onChangeW,
  manualBreakCount,
  onChangeManualBreakCount,
  letSolverDecide,
  onToggleLetSolverDecide,
  breaks,
  breakCountRequested,
  breakCountActual,
  showAlternatives,
  onChangeShowAlternatives,
  moreOpen,
  onToggleMore,
}: TopBarProps) {
  const locale = localeForCountry(country);

  return (
    <div className="sticky top-0 z-40 flex flex-col gap-3 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-4 backdrop-blur">
      <div className="flex flex-wrap items-end gap-4">
        <CountrySelect
          country={country}
          subdivision={subdivision}
          onChangeCountry={onChangeCountry}
          onChangeSubdivision={onChangeSubdivision}
        />

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
            <span className="text-slate-400 dark:text-slate-500">&rarr;</span>
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
              Using {budgetSpent} of {budget} days &mdash; the remaining {budget - budgetSpent} add no days off at
              any position.
            </span>
          )}
        </label>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-[16rem] max-w-sm flex-1">
          <WeightingSlider value={w} onChange={onChangeW} />
        </div>
        <div className="min-w-[16rem] max-w-sm flex-1">
          <BreakCountSlider
            value={manualBreakCount}
            onChange={onChangeManualBreakCount}
            letSolverDecide={letSolverDecide}
            onToggleLetSolverDecide={onToggleLetSolverDecide}
            breaks={breaks}
            breakCountRequested={breakCountRequested}
            breakCountActual={breakCountActual}
            budget={budget}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showAlternatives}
            onChange={(e) => onChangeShowAlternatives(e.target.checked)}
          />
          Show alternatives
        </label>
      </div>

      <button
        type="button"
        onClick={onToggleMore}
        className="self-start text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
      >
        {moreOpen ? 'Hide options ↑' : 'More options ↓'}
      </button>
    </div>
  );
}
