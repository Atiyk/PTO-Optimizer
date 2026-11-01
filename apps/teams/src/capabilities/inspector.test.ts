import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { auditLog, members } from '@/db/schema';
import { seedChildcareCentre } from '@/server/seedCoverage';
import { freshDb } from '@/test/db';
import { buildOrg, humanActor } from '@/test/fixtures';
import { invokeCapability, type CapabilityName } from './registry';
import { ROLE_SCOPES } from './scopes';
import type { Actor } from './types';

/*
 * The inspector export (getInspectorReport): the same numbers as getCoverage for the same days,
 * every gap with its rule and citation, the audit entries for the period, owner/admin only,
 * audited, and never another org's site.
 */

const TODAY = '2026-11-01';
const NOW = new Date(`${TODAY}T18:00:00Z`);
let db: Db;
let S: Awaited<ReturnType<typeof seedChildcareCentre>>;
let owner: Actor;
const run = <N extends CapabilityName>(a: Actor, name: N, input: unknown) => invokeCapability(name, { db, actor: a, now: NOW }, input);
async function actorFor(memberId: string): Promise<Actor> {
  const [m] = await db.select().from(members).where(eq(members.id, memberId));
  return { type: 'human', orgId: m!.orgId, memberId: m!.id, role: m!.role, clientId: null, onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m!.role] };
}

beforeAll(async () => {
  db = await freshDb();
  S = await seedChildcareCentre(db, TODAY);
  owner = await actorFor(S.ownerId);
}, 60_000);

describe('getInspectorReport', () => {
  it('matches the engine’s coverage for each room and day, with every gap cited', async () => {
    const from = S.nextMonday;
    const to = S.nextMonday;
    const r = await run(owner, 'getInspectorReport', { locationId: S.locationId, from, to });
    const cov = await run(owner, 'getCoverage', { locationId: S.locationId, date: from, days: 1, detail: 'blocks' });
    const grid = cov.days[0]!.grid!;
    expect(r.regulated).toBe(true);
    for (const room of cov.rooms) {
      const row = r.rows.find((x) => x.roomId === room.id)!;
      const blocks = grid.map((b) => b.rooms.find((x) => x.roomId === room.id)!).filter((b) => b.children > 0 || b.required > 0);
      expect(row.blocksChecked).toBe(blocks.length);
      expect(row.blocksShort).toBe(blocks.filter((b) => b.gap > 0).length);
      expect(row.blocksInRatio + row.blocksShort).toBe(row.blocksChecked);
      if (row.blocksChecked > 0) expect(row.rules.length).toBeGreaterThan(0);
    }
    // The seeded sample has a toddler gap; it is in the export with the CA citation.
    expect(cov.days[0]!.gaps.length).toBeGreaterThan(0);
    expect(r.gaps.map((g) => [g.start, g.end, g.short])).toEqual(cov.days[0]!.gaps.map((g) => [g.start, g.end, g.short]));
    for (const g of r.gaps.filter((x) => x.rule?.basis === 'law')) expect(g.rule!.citation?.url ?? g.rule!.needsVerification).toBeTruthy();
    expect(r.files['ratio-checks.csv']).toContain('blocks_checked');
    expect(r.files['gaps.csv']).toMatch(/Cal\. (Code Regs|Health)/);
    expect(r.notice).toMatch(/Not legal advice/);
  });

  it('includes the audit entries for the period and is itself audited', async () => {
    const r = await run(owner, 'getInspectorReport', { locationId: S.locationId, from: TODAY, to: TODAY });
    expect(r.audit.length).toBeGreaterThan(0); // the seed's own setup steps
    const rows = await db.select().from(auditLog).where(eq(auditLog.capability, 'getInspectorReport'));
    expect(rows.at(-1)).toMatchObject({ outcome: 'ok', summary: `Inspector export ${TODAY} to ${TODAY}` });
  });

  it('is for owners and admins only, and refuses ranges over 31 days', async () => {
    const manager = await actorFor(S.managerId);
    await expect(run(manager, 'getInspectorReport', { locationId: S.locationId, from: TODAY, to: TODAY })).rejects.toMatchObject({ code: 'forbidden' });
    const staff = await actorFor(S.staffIds.at(-1)!);
    await expect(run(staff, 'getInspectorReport', { locationId: S.locationId, from: TODAY, to: TODAY })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(owner, 'getInspectorReport', { locationId: S.locationId, from: '2026-11-01', to: '2026-12-15' })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('tenant isolation: another org’s admin cannot export this site', async () => {
    const other = await buildOrg(db, 'Globex');
    await expect(run(humanActor(other.owner), 'getInspectorReport', { locationId: S.locationId, from: TODAY, to: TODAY })).rejects.toMatchObject({ code: 'not_found' });
  });
});
