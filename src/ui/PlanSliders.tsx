import type { Break } from '../solver/types';
import { WeightingSlider } from './WeightingSlider';
import { BreakCountSlider } from './BreakCountSlider';

interface PlanSlidersProps {
  w: number;
  onChangeW: (w: number) => void;
  manualBreakCount: number;
  onChangeManualBreakCount: (n: number) => void;
  letSolverDecide: boolean;
  onToggleLetSolverDecide: (v: boolean) => void;
  breaks: Break[];
  breakCountRequested: number;
  breakCountActual: number;
  budget: number;
  showAlternatives: boolean;
  onChangeShowAlternatives: (v: boolean) => void;
}

/**
 * The two sliders that shape the plan ("what matters more" and "how many breaks") plus
 * "Show alternatives" - always on screen, not behind a disclosure. Visual hierarchy:
 * result -> country/date-range/PTO-days -> these -> the calendar. Only the state
 * (subdivision) picker and the "More options" panel (accrual, expiry, work week, blackout
 * dates, etc) stay behind the "Adjust" disclosure - these two sliders are how most
 * visitors actually shape the plan, not an advanced/secondary setting.
 */
export function PlanSliders({
  w,
  onChangeW,
  manualBreakCount,
  onChangeManualBreakCount,
  letSolverDecide,
  onToggleLetSolverDecide,
  breaks,
  breakCountRequested,
  breakCountActual,
  budget,
  showAlternatives,
  onChangeShowAlternatives,
}: PlanSlidersProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
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

      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={showAlternatives} onChange={(e) => onChangeShowAlternatives(e.target.checked)} />
        Show alternatives
      </label>
    </div>
  );
}
