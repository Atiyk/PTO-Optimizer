import latest from '../../evals/results/latest.json';

/*
 * What an admin sees next to an autonomy level (R6): the evidence behind letting an
 * assistant or agent act. Scores come from the last live eval run (npm run eval:live).
 */

export interface EvalNote {
  label: string;
  /** 0..1, or null when nothing measures this yet. */
  score: number | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const runDate = (latest.at ?? '').slice(0, 10);

export function evalNoteFor(capability: string, actorClass: 'agent' | 'assistant'): EvalNote {
  if (capability === 'decideLeaveRequest' && actorClass === 'assistant') {
    return { label: 'Rules only, no model: every condition is covered by unit tests.', score: 1 };
  }
  if (capability === 'submitLeaveRequest') {
    const p = latest.parsing;
    return { label: `Request parsing eval: ${p.passed}/${p.total} (${pct(p.accuracy)}) with ${p.model}, ${runDate}.`, score: p.accuracy };
  }
  return { label: 'No eval for agents using this action yet. Keep it at Draft.', score: null };
}
