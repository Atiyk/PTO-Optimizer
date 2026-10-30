import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { taskConfig } from '@/ai/config';
import { claudeCliProvider } from '@/ai/evalProviders';
import { anthropicProvider } from '@/ai/provider';
import { importHandbookTask } from '@/ai/tasks/importHandbook';
import { verifyHandbookProposal } from '@/ai/handbook';

/**
 * Regenerates the demo's stored handbook result (src/demo/handbookFixture.json) with a real model.
 * Only runs with AI_EVAL_LIVE=1 (and EVAL_PROVIDER=claude-cli or ANTHROPIC_API_KEY): one call.
 */
const viaCli = process.env.EVAL_PROVIDER === 'claude-cli';
const live = process.env.AI_EVAL_LIVE === '1' && (viaCli || !!process.env.ANTHROPIC_API_KEY);

describe.skipIf(!live)('demo fixture', () => {
  it('reads the demo handbook with the production model and stores the proposal', { timeout: 300_000 }, async () => {
    const text = readFileSync(join(process.cwd(), 'samples/demo-handbook.md'), 'utf8');
    const cfg = taskConfig('importHandbook');
    const provider = viaCli ? claudeCliProvider : anthropicProvider;
    const r = await provider.complete(importHandbookTask, { text }, { model: cfg.model, maxTokens: cfg.maxTokens, effort: cfg.effort });
    const proposal = importHandbookTask.output.parse(r.output);
    const v = verifyHandbookProposal(text, proposal);
    expect(v.fields.annualAllowance.status).toBe('verified');
    expect(v.fields.accrualMethod.value).not.toBe('unlimited');
    writeFileSync(join(process.cwd(), 'src/demo/handbookFixture.json'), JSON.stringify({ model: r.model, at: new Date().toISOString(), usage: r.usage, proposal }, null, 1) + '\n');
  });
});
