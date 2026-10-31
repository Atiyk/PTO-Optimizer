import { untracedIn } from '../provenance';
import { asData, DATA_RULE, defineAiTask } from '../task';
import { explanationSchema, type Explanation } from './explainBalance';

/*
 * "Ask about my policy": answers a person's question from the engine's plain-language summary
 * of the policies that apply to them, their balances and the org's rules. The question is
 * untrusted text. Every number in the answer must appear in the facts.
 */

export interface PolicyFacts {
  today: string;
  policies: Array<{ leaveType: string; summary: string; balance: number | null; unit: 'days' | 'hours'; requiresApproval: boolean }>;
  rules: string[];
  approver: string | null;
  question: string;
}

export function templatePolicyAnswer(f: PolicyFacts): Explanation {
  const q = f.question.toLowerCase();
  const match = f.policies.find((p) => q.includes(p.leaveType.toLowerCase())) ?? null;
  const show = match ? [match] : f.policies;
  const parts = show.map(
    (p) => `${p.leaveType}: ${p.summary}.${p.balance != null ? ` You have ${Math.round(p.balance * 100) / 100} ${p.unit} now.` : ''}${p.requiresApproval ? '' : ' No approval needed.'}`,
  );
  if (f.rules.length && /(when|block|blackout|probation|limit|can i|allowed)/.test(q)) parts.push(`Rules: ${f.rules.join(' ')}`);
  if (f.approver) parts.push(`Your requests go to ${f.approver}.`);
  return { text: parts.join(' ').slice(0, 900) || 'No leave policy applies to you yet. Ask an admin.' };
}

export const answerPolicyQuestionTask = defineAiTask<PolicyFacts, Explanation>({
  name: 'answerPolicyQuestion',
  promptVersion: 'p1',
  cache: false,
  system:
    "You answer an employee's question about their leave policy in two to four short plain sentences, using ONLY " +
    'the policy summaries, balances, rules and approver in the facts JSON. Numbers as digits and only numbers from ' +
    'the facts; never calculate. If the facts do not answer the question, say so and suggest asking their ' +
    'approver or an admin. This is not legal advice. ' +
    DATA_RULE,
  render: ({ question, ...facts }) => `Facts (from the policy engine):\n${JSON.stringify(facts)}\n${asData('untrusted_question', question)}`,
  output: explanationSchema,
  heuristic: templatePolicyAnswer,
});

export const untracedPolicy = (text: string, f: PolicyFacts) => {
  const { question: _q, ...facts } = f;
  return untracedIn(text, facts);
};
