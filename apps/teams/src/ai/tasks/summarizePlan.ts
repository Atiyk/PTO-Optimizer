import { z } from 'zod';
import { DATA_RULE, defineAiTask } from '../task';

/** Engine facts about a team plan. No names: the summary is about the team, not people. */
export interface PlanFacts {
  leaveTypeName: string;
  unit: 'days';
  people: number;
  daysAtRisk: number;
  daysPlaced: number;
  daysStillLost: number;
  peopleFullyPlaced: number;
  longestBreakDays: number;
  latestDeadline: string | null;
  tightestDate: string | null;
  exact: boolean;
}

export const planSummarySchema = z.object({ text: z.string().min(1).max(700) });
export type PlanSummary = z.infer<typeof planSummarySchema>;

export function templatePlanSummary(f: PlanFacts): PlanSummary {
  if (f.people === 0) return { text: `Nobody on this team is set to lose ${f.leaveTypeName.toLowerCase()} days.` };
  const parts = [
    `${f.people} people would lose ${f.daysAtRisk} days of ${f.leaveTypeName.toLowerCase()} before ${f.latestDeadline}.`,
    f.daysStillLost === 0
      ? `The plan fits all ${f.daysPlaced} days without breaking coverage.`
      : `Coverage leaves room for ${f.daysPlaced} of them, so ${f.daysStillLost} would still be lost${f.exact ? ', which is the minimum possible' : ''}.`,
  ];
  if (f.longestBreakDays > 0) parts.push(`The longest break is ${f.longestBreakDays} days in a row.`);
  if (f.tightestDate) parts.push(`The tightest day is ${f.tightestDate}.`);
  return { text: parts.join(' ') };
}

export const summarizePlanTask = defineAiTask<PlanFacts, PlanSummary>({
  name: 'summarizePlan',
  promptVersion: 's1',
  cache: false,
  system:
    'You summarise a team leave plan for a manager in two to four short, plain sentences. Use ONLY ' +
    'numbers and dates from the facts JSON; never calculate. Write numbers as digits and dates as ' +
    'YYYY-MM-DD. If daysStillLost is above 0 and exact is true, say that this is the minimum ' +
    'possible under the coverage rules. ' +
    DATA_RULE,
  render: (f) => `Facts (computed by the planning engine):\n${JSON.stringify(f)}`,
  output: planSummarySchema,
  heuristic: templatePlanSummary,
});
