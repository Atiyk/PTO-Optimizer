import { z } from 'zod';
import type { AbsenceReport } from '@daysoff/engine/leave/report';
import { untracedIn } from '../provenance';
import { DATA_RULE, defineAiTask } from '../task';

/*
 * Writes a short narrative of an absence report from the engine's numbers only. People are not
 * named (the forfeiture list is shown as a count), health leave is one bucket, and every number
 * in the reply is checked against the facts before it is shown.
 */

export type ReportFacts = Omit<AbsenceReport, 'forfeitRisk'> & { forfeitRiskPeople: number; scope: string };

export const reportNarrativeSchema = z.object({
  headline: z.string().min(1).max(200).describe('One sentence: the main finding. Only numbers from the facts.'),
  points: z.array(z.string().min(1).max(300)).min(1).max(5).describe('Two to five findings or suggestions a manager can act on, each one sentence.'),
});
export type ReportNarrative = z.infer<typeof reportNarrativeSchema>;

const n = (v: number) => String(Math.round(v * 10) / 10);

export function templateReport(f: ReportFacts): ReportNarrative {
  const t = f.totals;
  const points: string[] = [];
  if (f.byType[0]) points.push(`${f.byType[0].label} is the largest share: ${n(f.byType[0].days)} days of ${n(t.approvedDays)}.`);
  if (f.peakDays[0] && f.peakDays[0].away > 1) points.push(`The busiest day was ${f.peakDays[0].date}, with ${f.peakDays[0].away} people away.`);
  if (f.approval.approvalRatePct != null) points.push(`${f.approval.approved} of ${f.approval.decided} decided requests were approved (${f.approval.approvalRatePct}%).`);
  if (f.medianLeadDays != null) points.push(`People asked a median of ${n(f.medianLeadDays)} days ahead.`);
  if (f.forfeitRiskPeople > 0) points.push(`${f.forfeitRiskPeople} ${f.forfeitRiskPeople === 1 ? 'person is' : 'people are'} on track to lose leave at year end; nudge them to plan time off.`);
  if (t.pendingDays > 0) points.push(`${n(t.pendingDays)} days are still waiting for a decision.`);
  return {
    headline: `${n(t.approvedDays)} days of approved leave from ${f.from} to ${f.to} across ${t.peopleWithLeave} of ${f.headcount} people (${n(t.daysPerPerson)} per person).`,
    points: points.length ? points.slice(0, 5) : ['No leave in this period.'],
  };
}

export const absenceReportTask = defineAiTask<ReportFacts, ReportNarrative>({
  name: 'absenceReport',
  promptVersion: 'r1',
  cache: false,
  system:
    'You write a short absence report for a manager of a shift-based team: one headline sentence and two to ' +
    'five findings or practical suggestions (spread leave out, nudge people who would lose leave, decide pending ' +
    'requests). Use ONLY numbers and dates that appear in the facts JSON, written as digits; never calculate new ' +
    'numbers, percentages or averages. Do not name people. Never single out sick or health leave as a problem, ' +
    'and do not comment on individuals\' health. ' +
    DATA_RULE,
  render: (facts) => `Facts (computed by the absence engine):\n${JSON.stringify(facts)}\nWrite the report.`,
  output: reportNarrativeSchema,
  heuristic: templateReport,
});

export const untracedReport = (r: ReportNarrative, f: ReportFacts) => untracedIn([r.headline, ...r.points].join(' '), f);
