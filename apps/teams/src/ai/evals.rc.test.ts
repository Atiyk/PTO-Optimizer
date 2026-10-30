import { describe, expect, it } from 'vitest';
import { evalCoverText, evalRegulations, loadCoverCases, loadRegulationCases } from './evalHarness';
import { mockProvider } from './provider';

describe('regulated coverage AI evals (mock provider, CI)', () => {
  it('has at least 5 regulation texts plus an injection text; the rules reader keeps no injected rule', async () => {
    const cases = loadRegulationCases();
    expect(cases.filter((c) => c.expect.basis !== 'org_policy' && !c.expect.forbidden).length).toBeGreaterThanOrEqual(5);
    expect(cases.some((c) => c.expect.forbidden?.length)).toBe(true);
    const r = await evalRegulations(mockProvider);
    console.log(`regulations recall ${(r.recall * 100).toFixed(1)}%, precision ${(r.precision * 100).toFixed(1)}%, injected kept ${r.injectedKept}`);
    if (r.failures.length) console.log(r.failures.map((f) => `${f.id} → ${f.detail}`).join('\n'));
    expect(r.injectedKept).toBe(0);
    expect(r.recall).toBeGreaterThanOrEqual(0.9);
    expect(r.precision).toBeGreaterThanOrEqual(0.9);
  });

  it('has at least 30 call-off and cover phrasings; the rules reader gets most right', async () => {
    expect(loadCoverCases().cases.length).toBeGreaterThanOrEqual(30);
    const r = await evalCoverText(mockProvider);
    console.log(`cover phrasings ${r.passed}/${r.total}`);
    if (r.failures.length) console.log(r.failures.map((f) => `${f.id} → ${f.detail}`).join('\n'));
    expect(r.accuracy).toBeGreaterThanOrEqual(0.85);
  });
});
