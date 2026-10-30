import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { setAiProvider, type AiProvider } from '@/ai/provider';
import { dbMode } from '@/db/client';
import { memberCoverPrefs, members, organizations } from '@/db/schema';
import { deliver, MockSmsChannel, setSmsChannel } from '@/server/messaging';
import { healthReport } from '@/server/health';
import { freshDb } from '@/test/db';
import { humanActor, run } from '@/test/fixtures';
import { demoKind } from './isDemo';
import { removeExpiredSandboxes, SANDBOX_CAP, SandboxFullError, startSandbox } from './sandbox';

const NOW = new Date('2026-10-30T18:00:00Z');
const member = async (db: Awaited<ReturnType<typeof freshDb>>, id: string) => (await db.select().from(members).where(eq(members.id, id)))[0]!;

afterEach(() => {
  setAiProvider(undefined);
  setSmsChannel(null);
});

describe('"Try the demo" sandboxes', () => {
  it('gives each visitor a private, labelled copy, signed in as the manager or a staff member', async () => {
    const db = await freshDb();
    const a = await startSandbox(db, 'centre', 'manager', NOW);
    const b = await startSandbox(db, 'centre', 'staff', NOW);
    expect(a.orgId).not.toBe(b.orgId);
    expect((await member(db, a.memberId)).role).toBe('owner');
    expect((await member(db, b.memberId)).name).toBe('Ava Bennett');
    const [org] = await db.select().from(organizations).where(eq(organizations.id, a.orgId));
    expect(org).toMatchObject({ name: 'Sunbeam Early Learning (demo)', isDemo: true, agentAccessEnabled: false });
    expect(await demoKind(db, a.orgId)).toBe('sandbox');
    const c = await startSandbox(db, 'company', 'staff', NOW);
    expect((await member(db, c.memberId)).name).toBe('Sam Rivera');
  }, 120_000);

  it('deletes copies after a day, keeps shared samples, and refuses past the cap', async () => {
    const db = await freshDb();
    const dayAgo = new Date(NOW.getTime() - 25 * 3_600_000);
    const [old] = await db.insert(organizations).values({ name: 'Northwind Labs (demo)', isDemo: true, createdAt: dayAgo }).returning();
    const [sample] = await db.insert(organizations).values({ name: 'Northwind Labs', isDemo: true, createdAt: dayAgo }).returning();
    const [real] = await db.insert(organizations).values({ name: 'Real Co (demo)', createdAt: dayAgo }).returning();
    const [fresh] = await db.insert(organizations).values({ name: 'Sunbeam Early Learning (demo)', isDemo: true, createdAt: NOW }).returning();
    expect(await removeExpiredSandboxes(db, NOW)).toBe(1);
    const left = (await db.select({ id: organizations.id }).from(organizations)).map((o) => o.id);
    expect(left).not.toContain(old!.id);
    expect(left).toEqual(expect.arrayContaining([sample!.id, real!.id, fresh!.id]));
    expect(await demoKind(db, sample!.id)).toBe('sample');
    expect(await demoKind(db, real!.id)).toBe('none'); // the name alone does not make an org a demo

    await db.insert(organizations).values(Array.from({ length: SANDBOX_CAP - 1 }, (_, i) => ({ name: `Filler ${i} (demo)`, isDemo: true, createdAt: NOW })));
    await expect(startSandbox(db, 'centre', 'manager', NOW)).rejects.toBeInstanceOf(SandboxFullError);
  }, 60_000);

  it('never messages a real person, never connects outside services, and never calls the paid model', async () => {
    const db = await freshDb();
    const { orgId, memberId } = await startSandbox(db, 'company', 'manager', NOW);
    const owner = humanActor(await member(db, memberId));
    const [sam] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.name, 'Sam Rivera')));

    // Text messages: even opted in with a number and a provider configured, nothing is sent.
    const sms = new MockSmsChannel();
    setSmsChannel(sms);
    await db.insert(memberCoverPrefs).values({ orgId, memberId: sam!.id, smsOptIn: true, smsPhone: '+15555550123' });
    const used = await deliver(db, orgId, [{ memberId: sam!.id, text: 'Cover?', url: '/m', dedupeKey: 'k' }]);
    expect(sms.outbox).toEqual([]);
    expect(used.get(sam!.id)).toBe('in_app');

    // Webhooks and agent keys: listing works, creating is refused.
    await expect(run(db, owner, 'manageWebhooks', { op: 'list' })).resolves.toBeTruthy();
    await expect(run(db, owner, 'manageWebhooks', { op: 'create', url: 'https://example.com/hook', events: ['leave.approved'] })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, owner, 'manageAgentAccess', { op: 'createApiKey', name: 'k', scopes: ['leave:read'] })).rejects.toMatchObject({ code: 'forbidden' });

    // AI: a configured paid model is swapped for the built-in stand-in.
    let paidCalls = 0;
    const paid: AiProvider = {
      name: 'anthropic',
      async complete() {
        paidCalls++;
        return { output: { text: 'x' }, model: 'claude-haiku-5-5', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 } };
      },
    };
    setAiProvider(paid);
    const r = await run(db, humanActor(sam!), 'explainBalanceInWords', { leaveType: 'vacation' });
    expect(paidCalls).toBe(0);
    expect(r.source.used).toBe('demo');
  }, 120_000);
});

describe('deploy setup', () => {
  it('picks the database mode from the environment', () => {
    const env = { ...process.env };
    try {
      process.env.DATABASE_URL = 'postgres://u:p@h/db';
      expect(dbMode()).toBe('postgres');
      delete process.env.DATABASE_URL;
      (process.env as Record<string, string>).NODE_ENV = 'production';
      delete process.env.ALLOW_PGLITE;
      expect(dbMode()).toBe('demo-only');
      process.env.ALLOW_PGLITE = '1';
      expect(dbMode()).toBe('pglite');
    } finally {
      process.env = env;
    }
  });

  it('reports the schema as current, and integrations as booleans only', async () => {
    await freshDb();
    const env = { ...process.env };
    try {
      process.env.SLACK_CLIENT_ID = 'secret-looking-value';
      const r = await healthReport();
      expect(r.database).toMatchObject({ reachable: true, current: true });
      expect(r.database.migrationsApplied).toBe(r.database.migrationsTotal);
      expect(JSON.stringify(r)).not.toContain('secret-looking-value');
      expect(Object.values(r.configured).every((v) => typeof v === 'boolean')).toBe(true);
    } finally {
      process.env = env;
    }
  });
});
