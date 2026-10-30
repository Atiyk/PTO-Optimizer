import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { buildOrg, humanActor, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { mockProvider, setAiProvider, type AiProvider } from './provider';
import { templateExplanation, untracedNumbers, type BalanceFacts } from './tasks/explainBalance';

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});
afterEach(() => setAiProvider(undefined));

const says = (text: string): AiProvider => ({
  name: 'scripted',
  async complete() {
    return { output: { text }, model: 'claude-haiku-5-5', usage: { inputTokens: 300, outputTokens: 60, cacheReadTokens: 0 } };
  },
});

describe('balance explanations (3C): number provenance', () => {
  it('every number and date in the explanation is an engine fact', async () => {
    setAiProvider(mockProvider);
    const r = await run(db, humanActor(A.emp), 'explainBalanceInWords', { leaveType: 'vacation' });
    expect(r.source.used).toBe('ai');
    expect(r.text).toMatch(/20 days/); // 20 granted, 2 pending later this year
    expect(untracedNumbers(r.text, r.facts as BalanceFacts)).toEqual([]);
  });

  it('the template is traceable across many fact shapes', () => {
    const base: BalanceFacts = {
      leaveTypeName: 'Vacation', unit: 'days', today: '2026-11-02', balance: 12.5, usable: 10.5, bookedAhead: 2, carried: 3,
      carriedExpiresOn: '2027-03-31', yearEnd: { date: '2026-12-31', balance: 10.5, wouldCarry: 5, wouldForfeit: 5.5 }, usedThisPlanYear: 7.5,
      recent: [{ date: '2026-10-01', kind: 'usage', amount: -1.25, balanceAfter: 12.5, note: '' }], question: null,
    };
    for (const f of [base, { ...base, bookedAhead: 0, carried: 0, yearEnd: null }, { ...base, unit: 'hours' as const, balance: 37.3333 }]) {
      expect(untracedNumbers(templateExplanation(f).text, f)).toEqual([]);
    }
  });

  it('a model that invents or recalculates a number is replaced by the template', async () => {
    setAiProvider(says('You have 25 days left, and after your trip you will have 23.'));
    const r = await run(db, humanActor(A.emp), 'explainBalanceInWords', { leaveType: 'vacation' });
    expect(r.source).toMatchObject({ used: 'rules', unavailableReason: expect.stringMatching(/25, 23/) });
    expect(untracedNumbers(r.text, r.facts as BalanceFacts)).toEqual([]);
  });

  it('numbers from the question are not facts, and spelled-out numbers do not slip through', async () => {
    setAiProvider(says('Yes, you have 99 days.'));
    const r = await run(db, humanActor(A.emp), 'explainBalanceInWords', { leaveType: 'vacation', question: 'Do I have 99 days?' });
    expect(r.source.used).toBe('rules');
    setAiProvider(says('You have twenty days today.'));
    const r2 = await run(db, humanActor(A.emp), 'explainBalanceInWords', { leaveType: 'vacation' });
    expect(r2.source.used).toBe('rules');
  });

  it('AI off: the template answers', async () => {
    const r = await run(db, humanActor(A.emp), 'explainBalanceInWords', { leaveType: 'vacation' });
    expect(r.source.used).toBe('rules');
    expect(r.text).toMatch(/^You have 20 days of vacation today\./);
  });
});
