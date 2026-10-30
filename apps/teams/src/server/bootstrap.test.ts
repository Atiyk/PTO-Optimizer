import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { invites, leavePolicies, leaveTypes, members } from '@/db/schema';
import { freshDb } from '@/test/db';
import { NOW, TODAY, humanActor, run } from '@/test/fixtures';
import { acceptInvite, createOrganization } from './bootstrap';

const who = (subject: string, name: string) => ({ provider: 'slack' as const, subject, name, email: null, slackTeamId: 'T1', issuedAt: 0 });

describe('onboarding', () => {
  it('creating an org sets up a usable default in one step', async () => {
    const db = await freshDb();
    const { org, owner } = await createOrganization(db, who('U1', 'Founder'), { orgName: 'Tiny Co', countryCode: 'GB', subdivisionCode: 'GB-ENG', today: TODAY });
    expect(owner.role).toBe('owner');
    expect((await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, org.id))).map((t) => t.key).sort()).toEqual(['personal', 'sick', 'unpaid', 'vacation']);
    expect(await db.select().from(leavePolicies).where(eq(leavePolicies.orgId, org.id))).toHaveLength(2);
    // The owner can immediately see a balance: 20 days, front-loaded… pro-rated from their start today.
    const b = await run(db, humanActor(owner), 'getMyBalance', {});
    // Started Nov 2: 60 of 365 days remain → 20 × 60 / 365 = 3.2877
    expect(b.balance).toBe(3.2877);
  });

  it('invite links: join, use counting, expiry and revocation', async () => {
    const db = await freshDb();
    const { owner } = await createOrganization(db, who('U1', 'Founder'), { orgName: 'Tiny Co', countryCode: 'US', today: TODAY });
    const inv = await run(db, humanActor(owner), 'manageMembers', { op: 'createInvite', role: 'manager', maxUses: 1 });
    const m = await acceptInvite(db, inv.inviteToken!, who('U2', 'New Hire'), NOW);
    expect(m.role).toBe('manager');
    expect(await acceptInvite(db, inv.inviteToken!, who('U2', 'New Hire'), NOW)).toMatchObject({ id: m.id }); // same Slack user: no duplicate
    await expect(acceptInvite(db, inv.inviteToken!, who('U3', 'Third'), NOW)).rejects.toMatchObject({ code: 'not_found' }); // used up
    const inv2 = await run(db, humanActor(owner), 'manageMembers', { op: 'createInvite' });
    await run(db, humanActor(owner), 'manageMembers', { op: 'revokeInvite', inviteId: inv2.id });
    await expect(acceptInvite(db, inv2.inviteToken!, who('U4', 'Fourth'), NOW)).rejects.toMatchObject({ code: 'not_found' });
    const inv3 = await run(db, humanActor(owner), 'manageMembers', { op: 'createInvite', expiresInDays: 1 });
    await expect(acceptInvite(db, inv3.inviteToken!, who('U5', 'Late'), new Date(NOW.getTime() + 2 * 86_400_000))).rejects.toMatchObject({ code: 'not_found' });
    await expect(acceptInvite(db, 'inv_guess', who('U6', 'Guesser'), NOW)).rejects.toMatchObject({ code: 'not_found' });
    // Tokens are stored hashed.
    const rows = await db.select().from(invites);
    expect(rows.every((r) => !r.tokenHash.startsWith('inv_'))).toBe(true);
    expect((await db.select().from(members)).map((x) => x.name).sort()).toEqual(['Founder', 'New Hire']);
  });
});
