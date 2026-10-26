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
 * always on screen, not behind a disclosure. "Show alternatives" lives in the "More
 * options" disclosure (App.tsx) - unlike these two sliders, it's a secondary/advanced
 * toggle, not how most visitors shape the plan, and sitting here read as a primary
 * control it isn't.
 *
 * UI density pass: no longer owns its own full-width row - returns its two slider blocks
 * directly so App.tsx can lay them out in the SAME shared flex row as PrimaryControls'
 * fields (country/date-range/PTO-days/reserve), instead of two stacked bands.
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
    <>
      <div className="min-w-[15rem] max-w-xs flex-1 basis-60">
        <WeightingSlider value={w} onChange={onChangeW} />
      </div>
      <div className="min-w-[15rem] max-w-xs flex-1 basis-60">
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
    </>
  );
}
