import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { organizations } from '@/db/schema';

/** "Try the demo" copies are named like the sample with this suffix (see sandbox.ts). */
export const SANDBOX_SUFFIX = ' (demo)';

/** Demo orgs (shared samples and "Try the demo" copies) never reach a real person. */
export async function isDemoOrg(db: Db, orgId: string): Promise<boolean> {
  return (await demoKind(db, orgId)) !== 'none';
}

/**
 * 'sample': a shared public sample (/demo pages, which may show the real model within its budget).
 * 'sandbox': a visitor's private copy, which never calls a paid model.
 */
export async function demoKind(db: Db, orgId: string): Promise<'none' | 'sample' | 'sandbox'> {
  const [o] = await db.select({ isDemo: organizations.isDemo, name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
  if (!o?.isDemo) return 'none';
  return o.name.endsWith(SANDBOX_SUFFIX) ? 'sandbox' : 'sample';
}
