import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { estimateCostUsd, taskConfig } from './config';
import { evalCoverText, evalHandbooks, evalParsing, evalRegulations, loadCoverCases, loadHandbookCases, loadParsingCases, loadRegulationCases } from './evalHarness';
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

/** EVAL_SUITE=rc runs only the regulated-coverage sets (rule drafting and cover phrasings). */
const rcOnly = process.env.EVAL_SUITE === 'rc';

function rcWorstCaseUsd(): number {
  const r = taskConfig('rulePackFromText');
  const c = taskConfig('parseCoverText');
  const regs = loadRegulationCases().reduce((sum, x) => sum + estimateCostUsd(r.model, Math.ceil(x.text.length / 3) + 1_500, r.maxTokens), 0);
  const cover = loadCoverCases().cases.length * estimateCostUsd(c.model, 1_000, c.maxTokens);
  return (regs + cover) * 2;
}

describe.skipIf(!live)('live evals (real model, costs money)', () => {
  it.runIf(rcOnly)('regulated coverage: rule drafting and cover phrasings', { timeout: 900_000 }, async () => {
    const cap = Number(process.env.EVAL_MAX_USD ?? '1');
    const worst = rcWorstCaseUsd();
    expect(worst, `worst case $${worst.toFixed(2)} exceeds EVAL_MAX_USD=$${cap}`).toBeLessThanOrEqual(cap);
    const regulations = await evalRegulations(provider);
    const cover = await evalCoverText(provider);
    const report = { at: new Date().toISOString(), provider: provider.name, worstCaseUsd: worst, regulations, cover };
    mkdirSync(join(process.cwd(), 'evals/results'), { recursive: true });
    writeFileSync(join(process.cwd(), 'evals/results/latest-rc.json'), JSON.stringify(report, null, 1));
    console.log(
      `regulations recall ${(regulations.recall * 100).toFixed(1)}% precision ${(regulations.precision * 100).toFixed(1)}% injected ${regulations.injectedKept} ` +
        `(${regulations.model}, $${regulations.costUsd.toFixed(4)}); cover ${cover.passed}/${cover.total} (${cover.model}, $${cover.costUsd.toFixed(4)})`,
    );
    if (regulations.failures.length || cover.failures.length) console.log([...regulations.failures, ...cover.failures].map((f) => `${f.id} → ${f.detail}`).join('\n'));
    expect(regulations.injectedKept).toBe(0);
    expect(regulations.recall).toBeGreaterThanOrEqual(0.85);
    expect(cover.accuracy).toBeGreaterThanOrEqual(0.85);
  });

  it.skipIf(rcOnly)('stays inside the eval budget, then runs parsing and handbook evals', { timeout: 600_000 }, async () => {
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
