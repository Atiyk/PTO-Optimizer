import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estimateCostUsd, taskConfig } from './config';
import { evalHandbooks, evalParsing, loadHandbookCases, loadParsingCases } from './evalHarness';
import { claudeCliProvider } from './evalProviders';
import { anthropicProvider } from './provider';

/**
 * The one place real model calls happen outside the app: `npm run eval:live -w apps/teams`.
 * Skipped unless AI_EVAL_LIVE=1 and ANTHROPIC_API_KEY are set (or EVAL_PROVIDER=claude-cli, which
 * runs through a signed-in Claude Code CLI instead). Refuses to start if the worst
 * case (every call using its max tokens) could cost more than EVAL_MAX_USD (default $1).
 */
const viaCli = process.env.EVAL_PROVIDER === 'claude-cli';
const live = process.env.AI_EVAL_LIVE === '1' && (viaCli || !!process.env.ANTHROPIC_API_KEY);
const provider = viaCli ? claudeCliProvider : anthropicProvider;

function worstCaseUsd(): number {
  const p = taskConfig('parseLeaveRequest');
  const h = taskConfig('importHandbook');
  const parse = loadParsingCases().cases.length * estimateCostUsd(p.model, 1_000, p.maxTokens);
  const books = loadHandbookCases().reduce((s, c) => s + estimateCostUsd(h.model, Math.ceil(c.text.length / 3) + 1_000, h.maxTokens), 0);
  return (parse + books) * 2; // retries
}

describe.skipIf(!live)('live evals (real model, costs money)', () => {
  it('stays inside the eval budget, then runs parsing and handbook evals', { timeout: 600_000 }, async () => {
    const cap = Number(process.env.EVAL_MAX_USD ?? '1');
    const worst = worstCaseUsd();
    expect(worst, `worst case $${worst.toFixed(2)} exceeds EVAL_MAX_USD=$${cap}`).toBeLessThanOrEqual(cap);

    const parsing = await evalParsing(provider);
    const handbooks = await evalHandbooks(provider);
    const report = { at: new Date().toISOString(), provider: provider.name, worstCaseUsd: worst, parsing, handbooks };
    mkdirSync(join(process.cwd(), 'evals/results'), { recursive: true });
    writeFileSync(join(process.cwd(), 'evals/results/latest.json'), JSON.stringify(report, null, 1));
    console.log(
      `parsing ${parsing.passed}/${parsing.total} (${parsing.model}, $${parsing.costUsd.toFixed(4)}); ` +
        `handbooks fields ${(handbooks.fieldAccuracy * 100).toFixed(1)}% (${handbooks.model}, $${handbooks.costUsd.toFixed(4)})`,
    );
    if (parsing.failures.length || handbooks.failures.length) {
      console.log([...parsing.failures, ...handbooks.failures].map((f) => `${f.id} → ${f.detail}`).join('\n'));
    }
    expect(parsing.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(handbooks.fieldAccuracy).toBeGreaterThanOrEqual(0.9);
  });
});
