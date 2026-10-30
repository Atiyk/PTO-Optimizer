import { openPglite, setDb, type Db } from '@/db/client';
import { balanceLedger, members, organizations } from '@/db/schema';
import { encodeSession } from '@/lib/session';

/** Fresh in-memory Postgres with migrations applied, installed as the app's DB. */
export async function freshDb(): Promise<Db> {
  const db = await openPglite();
  setDb(db);
  return db;
}

export async function seedOrg(db: Db, name = 'Acme') {
  const [org] = await db.insert(organizations).values({ name }).returning();
  const [owner] = await db.insert(members).values({ orgId: org!.id, name: 'Olu Owner', role: 'owner' }).returning();
  const [emp] = await db.insert(members).values({ orgId: org!.id, name: 'Eve Employee', role: 'employee' }).returning();
  await db.insert(balanceLedger).values([
    { orgId: org!.id, memberId: emp!.id, leaveType: 'vacation', kind: 'import', amount: '10.5', effectiveDate: '2026-01-01' },
    { orgId: org!.id, memberId: emp!.id, leaveType: 'vacation', kind: 'accrual', amount: '0.5769', effectiveDate: '2026-01-15' },
    { orgId: org!.id, memberId: emp!.id, leaveType: 'vacation', kind: 'usage', amount: '-2', effectiveDate: '2026-02-02' },
  ]);
  return { org: org!, owner: owner!, emp: emp! };
}

export function sessionFor(m: { id: string; orgId: string }): string {
  return encodeSession({ memberId: m.id, orgId: m.orgId, issuedAt: Math.floor(Date.now() / 1000) });
}
