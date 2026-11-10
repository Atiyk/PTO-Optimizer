import { computeScores } from '@daysoff/engine/solver/solve';
import type { Scores, SolveInput, SolveResult } from '@daysoff/engine/solver/types';
import { solvePlan } from '../autopilot/planFromSearch';
import type { PlannerOutcome } from '../ui/pinPreview';
import type { PlanningStyle } from './optimizer';

export interface PlannerComputationInput {
  input: SolveInput;
  planningVersion: 2 | undefined;
  minimumBreakDays: number;
  style: PlanningStyle;
}

export interface PlannerComputationJob {
  request: PlannerComputationInput;
  /** Already solved for a short window or initial render. Calculate only scores. */
  existingOutcome: PlannerOutcome | null;
}

export interface PlannerComputationResult {
  outcome: PlannerOutcome;
  scores: Scores | null;
}

export type PlannerWorkerMessage =
  | { phase: 'plan'; outcome: PlannerOutcome }
  | { phase: 'scores'; scores: Scores | null };

const EMPTY_RESULT: SolveResult = {
  primary: [], alternatives: [], breakCountRequested: 0, breakCountActual: 0,
  budgetSpent: 0, peakCapApplied: false,
};

export const EMPTY_PLANNER_OUTCOME: PlannerOutcome = { result: EMPTY_RESULT };

export function computePlannerOutcome({ input, planningVersion, minimumBreakDays, style }: PlannerComputationInput): PlannerOutcome {
  try {
    return solvePlan(input, planningVersion, minimumBreakDays, style);
  } catch {
    return { result: EMPTY_RESULT, issue: 'This combination could not be calculated. Check your dates and settings.' };
  }
}

export function computePlannerJob({ request, existingOutcome }: PlannerComputationJob): PlannerComputationResult {
  const outcome = existingOutcome ?? computePlannerOutcome(request);
  try {
    return { outcome, scores: computeScores(request.input, outcome.result) };
  } catch {
    return { outcome, scores: null };
  }
}
