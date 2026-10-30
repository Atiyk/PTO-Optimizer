import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auditLog } from '@/db/schema';
import { SESSION_COOKIE } from '@/lib/session';
import { freshDb, seedOrg, sessionFor } from '@/test/db';

// The server action reads the session through next/headers; feed it the same cookie the
// REST request carries so both surfaces act as the same human.
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'dt_session' && cookieJar.value ? { value: cookieJar.value } : undefined) }),
}));

const { getMyBalanceAction } = await import('@/app/me/actions');
const { GET } = await import('@/app/api/v1/me/balance/route');

function restGet(cookie: string | undefined, qs = '') {
  const req = new NextRequest(`http://localhost/api/v1/me/balance${qs}`, {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
  return GET(req);
}

describe('getMyBalance: server action and REST return identical results (R1)', () => {
  let seed: Awaited<ReturnType<typeof seedOrg>>;
  let db: Awaited<ReturnType<typeof freshDb>>;
  beforeEach(async () => {
    db = await freshDb();
    seed = await seedOrg(db);
  });

  it('same output through both surfaces', async () => {
    cookieJar.value = sessionFor(seed.emp);
    const action = await getMyBalanceAction({ leaveType: 'vacation' });
    const res = await restGet(cookieJar.value, '?leaveType=vacation');
    expect(res.status).toBe(200);
    const rest = (await res.json()) as { data: unknown };
    expect(action).toEqual({ ok: true, data: rest.data });
    // 10.5 + 0.5769 - 2 = 9.0769, summed in fixed point (no float drift).
    expect(rest.data).toEqual({ memberId: seed.emp.id, leaveType: 'vacation', unit: 'days', balance: 9.0769, entryCount: 3 });
  });

  it('both reject a missing or forged session the same way', async () => {
    cookieJar.value = 'forged.value.123.sig';
    const action = await getMyBalanceAction();
    const res = await restGet(cookieJar.value);
    expect(action).toEqual({ ok: false, error: { code: 'unauthenticated', message: 'Sign in first.' } });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('unauthenticated');
  });

  it('a session for another org never sees this org’s ledger', async () => {
    const other = await seedOrg(db, 'Globex');
    // Cookie claims Acme's employee id but Globex's org: rejected, not cross-read.
    const forged = sessionFor({ id: seed.emp.id, orgId: other.org.id });
    expect((await restGet(forged)).status).toBe(401);
    cookieJar.value = sessionFor(other.emp);
    const r = await getMyBalanceAction();
    expect(r.ok && r.data.memberId).toBe(other.emp.id);
  });

  it('validation errors name the field so a model can self-correct', async () => {
    cookieJar.value = sessionFor(seed.emp);
    const res = await restGet(cookieJar.value, '?leaveType=');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/^Invalid input for getMyBalance\. leaveType:/);
  });

  it('reads are not audited on success', async () => {
    cookieJar.value = sessionFor(seed.emp);
    await getMyBalanceAction();
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });
});
