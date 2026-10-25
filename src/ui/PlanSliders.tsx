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
}

/**
 * The two sliders that shape the plan ("what matters more" and "how many breaks") -
 * always on screen, not behind a disclosure. Visual hierarchy: result ->
 * country/date-range/PTO-days -> these -> the calendar. "Show alternatives" lives in the
 * "Adjust" disclosure (App.tsx) - unlike these two sliders, it's a secondary/advanced
 * toggle, not how most visitors shape the plan, and sitting here read as a primary
 * control it isn't.
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
}: PlanSlidersProps) {
  return (
    <div className="flex flex-wrap items-start gap-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
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
  );
}
