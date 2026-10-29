import type { TimeOffPolicy } from './model';
import { GLOSSARY_TERMS } from '../content/glossary/terms';

/**
 * Stage 4B.5: generated from what's left "not sure" or unset, matching the tone of the
 * existing request-text feature (src/ui/requestText.ts) - plain, direct, one sentence each.
 */
export function generateHRQuestions(policy: TimeOffPolicy): string[] {
  const questions: string[] = [];

  if (policy.payoutOnLeaving === 'not-sure') {
    questions.push(byId('payout')?.askHR ?? 'If I leave, is my unused PTO balance paid out in cash?');
  }
  if (policy.carryover.mode === 'capped' && (policy.carryover.cap === undefined || policy.carryover.cap === 0)) {
    questions.push(byId('carryover')?.askHR ?? 'How many days can I carry over, and is there a separate deadline to use them by?');
  }
  if (policy.accrualCap === undefined && policy.accrual.kind !== 'unlimited' && policy.accrual.kind !== 'front-loaded') {
    questions.push(byId('accrual-cap')?.askHR ?? "What's my accrual cap, and does it reset or stay fixed every year?");
  }
  if (policy.waitingPeriodDays === undefined) {
    questions.push(byId('waiting-period')?.askHR ?? 'Is there a waiting period before I can use my PTO, and how long is it?');
  }

  return questions.filter((q, i) => q && questions.indexOf(q) === i);
}

function byId(id: string) {
  return GLOSSARY_TERMS.find((t) => t.id === id);
}

/** Copy-ready message for the "Copy questions" export button — same voice as the existing
 * request-text feature: plain, no preamble beyond a short greeting. */
export function hrQuestionsMessage(questions: string[]): string {
  if (questions.length === 0) return '';
  const lines = questions.map((q) => `- ${q}`).join('\n');
  return `A few questions about my PTO policy:\n\n${lines}`;
}
