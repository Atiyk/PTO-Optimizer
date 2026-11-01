import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { aiUsage, auditLog, organizations } from '@/db/schema';
import type { Actor } from '@/capabilities/types';
import { buildOrg, humanActor, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { mockProvider, setAiProvider } from './provider';

/*
 * The per-org "AI features" switch: owner/admin only (people, not agents), audited, checked in
 * src/ai/run.ts so no AI task runs for that org, forms keep working, and one org's switch never
 * touches another org.
 */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
let B: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
  B = await buildOrg(db, 'Globex');
  setAiProvider(mockProvider);
});
afterEach(() => setAiProvider(undefined));

const aiOn = async (orgId: string) => (await db.select().from(organizations).where(eq(organizations.id, orgId)))[0]!.aiFeaturesEnabled;

describe('AI features switch', () => {
  it('on by default; an owner turns it off, it is audited, and no AI task runs for that org', async () => {
    expect(await aiOn(A.org.id)).toBe(true);
    expect((await run(db, humanActor(A.owner), 'getOrgSetup', {})).org.aiFeaturesEnabled).toBe(true);
    await run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'updateSettings', aiFeaturesEnabled: false });
    expect(await aiOn(A.org.id)).toBe(false);
    const [row] = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A.org.id), eq(auditLog.capability, 'manageOrgSetup')));
    expect(row).toMatchObject({ outcome: 'ok', summary: 'Org setup: updateSettings (AI features OFF)', actorMemberId: A.owner.id });

    // Forms still work: the request in words falls back to the built-in parser, nothing is billed.
    const r = await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'Friday afternoon off' });
    expect(r.source.used).toBe('rules');
    expect(r.source.unavailableReason).toMatch(/turned AI features off/);
    expect(r.fields).toMatchObject({ start: '2026-11-06', part: 'pm' });
    const draft = await run(db, humanActor(A.emp), 'draftLeaveRequest', { leaveType: 'vacation', start: '2026-12-07', end: '2026-12-08' });
    expect(draft).toBeTruthy();
    expect(await db.select().from(aiUsage).where(eq(aiUsage.orgId, A.org.id))).toHaveLength(0);

    // Back on: AI answers again.
    await run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'updateSettings', aiFeaturesEnabled: true });
    expect((await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'Friday afternoon off' })).source.used).toBe('demo');
  });

  it('only owners and admins, and only people (not agents), can change it', async () => {
    await expect(run(db, humanActor(A.manager), 'manageOrgSetup', { op: 'updateSettings', aiFeaturesEnabled: false })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.emp), 'manageOrgSetup', { op: 'updateSettings', aiFeaturesEnabled: false })).rejects.toMatchObject({ code: 'forbidden' });
    const agent: Actor = { ...humanActor(A.owner), type: 'agent-on-behalf-of-user', clientId: 'pat_x', onBehalfOfMemberId: A.owner.id };
    await expect(run(db, agent, 'manageOrgSetup', { op: 'updateSettings', aiFeaturesEnabled: false })).rejects.toMatchObject({ code: 'forbidden' });
    expect(await aiOn(A.org.id)).toBe(true);
  });

  it('tenant isolation: one org turning AI off leaves another org’s AI on', async () => {
    await run(db, humanActor(A.owner), 'manageOrgSetup', { op: 'updateSettings', aiFeaturesEnabled: false });
    expect(await aiOn(B.org.id)).toBe(true);
    expect((await run(db, humanActor(B.emp), 'parseLeaveRequestText', { text: 'Friday afternoon off' })).source.used).toBe('demo');
    expect((await run(db, humanActor(A.emp), 'parseLeaveRequestText', { text: 'Friday afternoon off' })).source.used).toBe('rules');
  });
});
