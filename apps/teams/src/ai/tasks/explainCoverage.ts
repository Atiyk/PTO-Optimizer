import { untracedIn } from '../provenance';
import { asData, DATA_RULE, defineAiTask } from '../task';
import { explanationSchema, type Explanation } from './explainBalance';

/*
 * Explains a cover ranking from the engine's facts only: the gap and its rule, who is first
 * and why, and why others can't take it. Names are left out (people are "#1", "#2"); pay is
 * never in the facts, only the overtime band. Every number is checked against the facts.
 */
export interface CoverageFacts {
  window: { date: string; start: string; end: string; room: string };
  gap: { rule: string; short: number; source: string | null } | null;
  eligible: number;
  top: Array<{ rank: number; fairness: number; preference: number; cost: number; travel: number; overtime: boolean }>;
  /** Why the others can't take it: the first failed check's text, with how many people. */
  excluded: Array<{ reason: string; people: number }>;
  question: string | null;
}

export function templateCoverage(f: CoverageFacts): Explanation {
  const w = `${f.window.room} on ${f.window.date}, ${f.window.start}–${f.window.end}`;
  const parts = [
    f.gap ? `${w} is ${f.gap.short} short under "${f.gap.rule}"${f.gap.source ? ` (${f.gap.source})` : ''}.` : `This is a cover request for ${w}.`,
    f.eligible ? `${f.eligible} ${f.eligible === 1 ? 'person passes' : 'people pass'} every rule.` : 'Nobody passes every rule for this time.',
  ];
  const first = f.top[0];
  if (first) {
    const why = [first.fairness > 0 ? `a fairness score of ${first.fairness} from recent covers` : 'no recent covers', first.preference < 0 ? 'they asked for offers' : null, first.overtime ? 'it would be overtime for them' : null]
      .filter(Boolean)
      .join(', ');
    parts.push(`#${first.rank} is asked first: ${why}. Lower scores go first.`);
  }
  for (const x of f.excluded.slice(0, 3)) parts.push(`${x.people} can't: ${x.reason.replace(/\.$/, '').toLowerCase()}.`);
  return { text: parts.join(' ') };
}

export const explainCoverageTask = defineAiTask<CoverageFacts, Explanation>({
  name: 'explainCoverage',
  promptVersion: 'x1',
  cache: false,
  system:
    'You explain to a childcare or clinic manager, in two to five short plain sentences, why a ' +
    'time slot needs cover and why the cover list is in this order. Use ONLY numbers, dates, times ' +
    'and rule names from the facts JSON; never calculate. Refer to people only as #1, #2 and so on. ' +
    'Lower scores go first. Do not give legal advice beyond naming the rule. ' +
    DATA_RULE,
  render: ({ question, ...facts }) =>
    `Facts (computed by the coverage engine):\n${JSON.stringify(facts)}\n` + (question ? asData('untrusted_question', question) : 'Explain the ranking.'),
  output: explanationSchema,
  heuristic: templateCoverage,
});

export function untracedCoverage(text: string, f: CoverageFacts): string[] {
  const { question: _q, ...facts } = f;
  // "#1" refers to a rank, which is in the facts; times like 15:30 are split into 15 and 30.
  return untracedIn(text.replace(/(\d{2}):(\d{2})/g, (_m, h, m) => (JSON.stringify(facts).includes(`${h}:${m}`) ? ' ' : `${h}:${m}`)), facts);
}
