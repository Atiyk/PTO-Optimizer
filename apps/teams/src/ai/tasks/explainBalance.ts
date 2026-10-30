import { z } from 'zod';
import { asData, DATA_RULE, defineAiTask } from '../task';

/** Engine facts only. Every number the explanation may use is in here (3C provenance). */
export interface BalanceFacts {
  leaveTypeName: string;
  unit: 'days' | 'hours';
  today: string;
  balance: number;
  usable: number;
  bookedAhead: number;
  carried: number;
  carriedExpiresOn: string | null;
  yearEnd: { date: string; balance: number; wouldCarry: number; wouldForfeit: number } | null;
  usedThisPlanYear: number;
  recent: Array<{ date: string; kind: string; amount: number; balanceAfter: number; note: string }>;
  question: string | null;
}

export const explanationSchema = z.object({
  text: z.string().min(1).max(900).describe('Two to five short sentences. Numbers as digits, dates as YYYY-MM-DD, only numbers from the facts.'),
});
export type Explanation = z.infer<typeof explanationSchema>;

const n = (v: number) => String(Math.round(v * 100) / 100);

/** Template used in mock mode and whenever the model's numbers cannot be traced to the facts. */
export function templateExplanation(f: BalanceFacts): Explanation {
  const u = f.unit;
  const parts = [`You have ${n(f.balance)} ${u} of ${f.leaveTypeName.toLowerCase()} today.`];
  if (f.bookedAhead > 0) parts.push(`${n(f.bookedAhead)} ${u} are already booked later this year, so you can still book ${n(f.usable)} ${u}.`);
  if (f.carried > 0 && f.carriedExpiresOn) parts.push(`That includes ${n(f.carried)} ${u} carried over, which must be used by ${f.carriedExpiresOn}.`);
  if (f.yearEnd) {
    parts.push(
      f.yearEnd.wouldForfeit > 0
        ? `On ${f.yearEnd.date} you would have ${n(f.yearEnd.balance)} ${u}: ${n(f.yearEnd.wouldCarry)} would carry over and ${n(f.yearEnd.wouldForfeit)} would be lost.`
        : `On ${f.yearEnd.date} you would have ${n(f.yearEnd.balance)} ${u}.`,
    );
  }
  const last = f.recent.at(-1);
  if (last) parts.push(`The last entry was ${last.kind} (${last.amount > 0 ? '+' : ''}${n(last.amount)} ${u}) on ${last.date}.`);
  return { text: parts.join(' ') };
}

export const explainBalanceTask = defineAiTask<BalanceFacts, Explanation>({
  name: 'explainBalance',
  promptVersion: 'e1',
  cache: false,
  system:
    'You explain a leave balance to an employee in plain, friendly English, in two to five short ' +
    'sentences. Use ONLY numbers and dates that appear in the facts JSON; never calculate, add, ' +
    'subtract or round. Write numbers as digits and dates as YYYY-MM-DD. If the facts cannot answer ' +
    'the question, say so and suggest asking an admin. ' +
    DATA_RULE,
  render: ({ question, ...facts }) =>
    `Facts (computed by the leave engine):\n${JSON.stringify(facts)}\n` +
    (question ? asData('untrusted_question', question) : 'Explain the balance.'),
  output: explanationSchema,
  heuristic: templateExplanation,
});

/** Every number in the text must be a fact; ISO dates must be fact dates. Returns the offenders. */
export function untracedNumbers(text: string, f: BalanceFacts): string[] {
  const { question: _q, ...facts } = f;
  const json = JSON.stringify(facts);
  const factDates = new Set(json.match(/\d{4}-\d{2}-\d{2}/g) ?? []);
  const factNumbers = new Set(
    (json.replace(/\d{4}-\d{2}-\d{2}/g, ' ').match(/-?\d+(?:\.\d+)?/g) ?? []).flatMap((s) => {
      const v = Number(s);
      return [String(v), String(Math.abs(v)), n(v), n(Math.abs(v))];
    }),
  );
  const bad: string[] = [];
  for (const d of text.match(/\d{4}-\d{2}-\d{2}/g) ?? []) if (!factDates.has(d)) bad.push(d);
  for (const s of text.replace(/\d{4}-\d{2}-\d{2}/g, ' ').match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!factNumbers.has(String(Number(s)))) bad.push(s);
  }
  // Spelled-out numbers dodge the digit check, so they never pass.
  for (const w of text.toLowerCase().match(NUMBER_WORDS) ?? []) bad.push(w);
  return bad;
}

const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|half|quarter)\b/g;
