import type { Break } from '../solver/types';
import { WeightingSlider } from './WeightingSlider';
import { BreakCountSlider } from './BreakCountSlider';
import { SubdivisionSelect } from './CountrySelect';

interface AdjustPanelProps {
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
  country: string;
  subdivision: string | undefined;
  onChangeSubdivision: (code: string | undefined) => void;
  showAlternatives: boolean;
  onChangeShowAlternatives: (v: boolean) => void;
}

/**
 * Everything that isn't country/date-range/PTO-days: the two sliders, the state
 * (subdivision) picker, and "Show alternatives" - collapsed behind a single "Adjust"
 * disclosure, closed by default. The defaults already produce a good plan; a first-time
 * visitor discovers these only after seeing the answer, never before.
 */
export function AdjustPanel({
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
  country,
  subdivision,
  onChangeSubdivision,
  showAlternatives,
  onChangeShowAlternatives,
}: AdjustPanelProps) {
  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-wrap items-end gap-4">
        <SubdivisionSelect country={country} subdivision={subdivision} onChangeSubdivision={onChangeSubdivision} />
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showAlternatives}
            onChange={(e) => onChangeShowAlternatives(e.target.checked)}
          />
          Show alternatives
        </label>
      </div>
    </div>
  );
}
