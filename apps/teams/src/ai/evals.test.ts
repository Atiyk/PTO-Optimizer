import { describe, expect, it } from 'vitest';
import { evalParsing, loadParsingCases } from './evalHarness';
import { mockProvider } from './provider';

describe('AI evals (mock provider, CI)', () => {
  it('has at least 40 parsing cases', () => {
    expect(loadParsingCases().cases.length).toBeGreaterThanOrEqual(40);
  });

  it('the rules-based parser (mock and no-AI fallback) passes most parsing cases', async () => {
    const r = await evalParsing(mockProvider);
    console.log(`accuracy ${r.passed}/${r.total}`);
    if (r.failures.length) console.log(r.failures.map((f) => `${f.id} → ${f.detail}`).join('\n'));
    expect(r.accuracy).toBeGreaterThanOrEqual(0.85);
  });
});
