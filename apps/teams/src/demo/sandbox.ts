import { and, count, eq, inArray, like, lt } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { members, organizations } from '@/db/schema';
import { seedDemoOrg } from '@/server/seed';
import { seedChildcareCentre } from '@/server/seedCoverage';
import { SANDBOX_SUFFIX } from './isDemo';

export { SANDBOX_SUFFIX };

/*
 * "Try the demo": each visitor gets a private copy of a made-up sample org and is signed in to it,
 * no Slack needed. Copies are marked isDemo, so nothing in them messages a real person or calls a
 * paid model (see isDemo.ts), and they are deleted after a day. A cap keeps a burst of visitors
 * from filling the database.
 */

export const SANDBOX_TTL_MS = 24 * 3_600_000;
export const SANDBOX_CAP = 200;

export type SandboxKind = 'centre' | 'company';
export type SandboxView = 'manager' | 'staff';

const SAMPLES: Record<SandboxKind, { name: string; staffName: string; seed: (db: Db, today: string, opts: { orgName: string }) => Promise<{ org: { id: string }; ownerId: string }> }> = {
  centre: { name: 'Sunbeam Early Learning', staffName: 'Ava Bennett', seed: seedChildcareCentre },
  company: { name: 'Northwind Labs', staffName: 'Sam Rivera', seed: seedDemoOrg },
};

export class SandboxFullError extends Error {
  constructor() {
    super('The demo is busy right now. Please try again in a few minutes.');
  }
}

/** Deletes sandboxes older than the TTL. Shared samples (no suffix) are left alone. */
export async function removeExpiredSandboxes(db: Db, now: Date): Promise<number> {
  const old = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.isDemo, true), like(organizations.name, `%${SANDBOX_SUFFIX}`), lt(organizations.createdAt, new Date(now.getTime() - SANDBOX_TTL_MS))));
  if (old.length) await db.delete(organizations).where(inArray(organizations.id, old.map((o) => o.id)));
  return old.length;
}

/** Creates a fresh sandbox and returns the member to sign in as. */
export async function startSandbox(db: Db, kind: SandboxKind, view: SandboxView, now: Date): Promise<{ orgId: string; memberId: string }> {
  await removeExpiredSandboxes(db, now);
  const [live] = await db.select({ n: count() }).from(organizations).where(and(eq(organizations.isDemo, true), like(organizations.name, `%${SANDBOX_SUFFIX}`)));
  if (Number(live?.n ?? 0) >= SANDBOX_CAP) throw new SandboxFullError();
  const sample = SAMPLES[kind];
  const { org, ownerId } = await sample.seed(db, now.toISOString().slice(0, 10), { orgName: `${sample.name}${SANDBOX_SUFFIX}` });
  await db.update(organizations).set({ isDemo: true, agentAccessEnabled: false }).where(eq(organizations.id, org.id));
  if (view === 'manager') return { orgId: org.id, memberId: ownerId };
  const [staff] = await db.select({ id: members.id }).from(members).where(and(eq(members.orgId, org.id), eq(members.name, sample.staffName)));
  return { orgId: org.id, memberId: staff?.id ?? ownerId };
}
