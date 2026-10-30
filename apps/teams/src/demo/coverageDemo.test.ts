import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { coverRequests, leaveRequests, organizations } from '@/db/schema';
import { freshDb } from '@/test/db';
import { demoCallOff, demoCentre, demoRuleDraft, DEMO_REGULATION } from './coverageDemo';

/* The public coverage demo: real capabilities, nothing saved, injection does nothing. */
describe('coverage demo', () => {
  it('drafts cited rules, ignores the injected line, and runs a call-off that is rolled back', async () => {
    const db = await freshDb();
    const now = new Date('2026-10-30T18:00:00Z');
    const c = await demoCentre(db, now);
    expect(c.monday).toBe('2026-11-02');
    const draft = await demoRuleDraft(db, DEMO_REGULATION, now);
    const kept = draft.rules.filter((r) => r.status === 'verified');
    expect(kept.map((r) => r.values.childrenPerStaff).sort()).toEqual([12, 4, 6]);
    expect(kept.every((r) => r.quote && DEMO_REGULATION.includes(r.quote.untrusted_text.split(' … ')[0]!))).toBe(true);
    expect(JSON.stringify(kept)).not.toMatch(/\b20\b/);
    expect(draft.label).toMatch(/built-in reader|AI/);

    const leaveBefore = (await db.select().from(leaveRequests).where(eq(leaveRequests.orgId, c.orgId))).length;
    const run = await demoCallOff(db, now);
    expect(run.callOff.coverRequests.length).toBeGreaterThan(0);
    expect(run.ranking!.candidates.filter((x) => x.eligible).length).toBeGreaterThan(0);
    expect(run.accepted).toMatchObject({ status: 'filled' });
    expect(run.gapsBefore.map((g) => `${g.roomName} ${g.start}`)).toContain('Toddlers 15:30');
    expect(run.gapsAfter.length).toBeGreaterThan(run.gapsBefore.length - 1); // one window filled, the rest still listed
    // Rolled back: nothing saved.
    expect((await db.select().from(leaveRequests).where(eq(leaveRequests.orgId, c.orgId))).length).toBe(leaveBefore);
    expect(await db.select().from(coverRequests).where(eq(coverRequests.orgId, c.orgId))).toEqual([]);
    // Same sample next time, and a fresh one once its Monday has passed.
    expect((await demoCentre(db, now)).orgId).toBe(c.orgId);
    const later = await demoCentre(db, new Date('2026-11-03T18:00:00Z'));
    expect(later.orgId).not.toBe(c.orgId);
    expect(await db.select().from(organizations).where(eq(organizations.id, c.orgId))).toEqual([]);
  }, 60_000);
});
