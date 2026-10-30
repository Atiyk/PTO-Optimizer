import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { aiUsage } from '@/db/schema';
import { buildOrg, humanActor, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { mockProvider, setAiProvider, type AiProvider } from './provider';

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});
afterEach(() => {
  setAiProvider(undefined);
  vi.unstubAllEnvs();
});

/** A provider that returns whatever the test scripts, to play a misbehaving model. */
function scripted(...outputs: unknown[]): AiProvider {
  return {
    name: 'scripted',
    async complete() {
      return { output: outputs.shift(), model: 'claude-haiku-5-5', usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 } };
    },
  };
}

describe('AI module', () => {
  it('AI off: natural-language requests still work through the built-in parser, and nothing is billed', async () => {
    const r = await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'Friday afternoon off' });
    expect(r.source.used).toBe('rules');
    expect(r.fields).toMatchObject({ leaveType: 'vacation', start: '2026-11-06', end: '2026-11-06', part: 'pm' });
    expect(r.evaluation?.deducts).toBe(0.5);
    expect(await db.select().from(aiUsage)).toHaveLength(0);
  });

  it('mock provider: answers as "demo", records usage per org and feature', async () => {
    setAiProvider(mockProvider);
    const r = await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'Dec 22 to Jan 2' });
    expect(r.source.used).toBe('demo');
    expect(r.fields).toMatchObject({ start: '2026-12-22', end: '2027-01-02' });
    const usage = await db.select().from(aiUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ orgId: A.org.id, feature: 'parseLeaveRequest', model: 'mock' });
    const report = await run(db, humanActor(A.owner), 'getAiUsage', {});
    expect(report.byFeature[0]).toMatchObject({ feature: 'parseLeaveRequest', calls: 1 });
    await expect(run(db, humanActor(A.emp), 'getAiUsage', {})).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('per-org daily budget and global monthly budget disable AI gracefully', async () => {
    setAiProvider(mockProvider);
    vi.stubEnv('AI_ORG_DAILY_TOKEN_BUDGET', '1');
    await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'tomorrow' }); // spends > 1 token
    const second = await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'tomorrow' });
    expect(second.source).toMatchObject({ used: 'rules' });
    expect(second.source.unavailableReason).toMatch(/allowance for today/);
    vi.stubEnv('AI_ORG_DAILY_TOKEN_BUDGET', '1000000');
    vi.stubEnv('AI_MONTHLY_TOKEN_BUDGET', '0');
    const third = await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'tomorrow' });
    expect(third.source.unavailableReason).toMatch(/monthly AI budget/);
    expect(third.fields.start).toBe('2026-11-03');
  });

  it('a malformed reply is retried once, then the rules take over', async () => {
    setAiProvider(scripted({ nope: 1 }, { still: 'wrong' }));
    const r = await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'tomorrow' });
    expect(r.source.used).toBe('rules');
    expect(await db.select().from(aiUsage)).toHaveLength(2); // both attempts were billed and recorded
  });

  it('model output is re-checked: unknown leave type and reversed dates never reach the engine', async () => {
    setAiProvider(
      scripted({ leaveType: 'unlimited-bonus', start: '2026-12-10', end: '2026-12-01', part: 'full', hours: null, note: null, clarifyingQuestion: null }),
    );
    const r = await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'whatever' });
    expect(r.fields.leaveType).toBeNull();
    expect(r.fields.end).toBeNull();
    expect(r.fields.clarifyingQuestion).toBeTruthy();
    expect(r.evaluation).toBeNull();
  });

  it('never submits anything', async () => {
    setAiProvider(mockProvider);
    const before = await run(db, humanActor(A.emp), 'listMyRequests', {});
    await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'Dec 1 to Dec 3' });
    expect((await run(db, humanActor(A.emp), 'listMyRequests', {})).requests).toHaveLength(before.requests.length);
  });
});
