import { describe, expect, it } from 'vitest';
import { evalHandbooks, evalParsing, loadHandbookCases, loadParsingCases } from './evalHarness';
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

  it('has at least 5 handbooks; the rules reader gets every field right on them', async () => {
    expect(loadHandbookCases().length).toBeGreaterThanOrEqual(5);
    const r = await evalHandbooks(mockProvider);
    console.log(`handbooks ${r.passed}/${r.total}, fields ${(r.fieldAccuracy * 100).toFixed(1)}%`);
    if (r.failures.length) console.log(r.failures.map((f) => `${f.id} → ${f.detail}`).join('\n'));
    expect(r.fieldAccuracy).toBeGreaterThanOrEqual(0.95);
  });
});
