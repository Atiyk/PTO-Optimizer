import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { apiTokens, drafts, rateCounters } from '@/db/schema';
import { POST as restPost } from '@/app/api/v1/actions/[name]/route';
import { POST as mcpPost } from '@/app/api/mcp/route';
import { POST as signout } from '@/app/api/auth/signout/route';
import { encodeSession, SESSION_COOKIE } from '@/lib/session';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { housekeeping } from './housekeeping';
import { pushEndpointAllowed } from './messaging';

/* Phase 6 security checks that sit outside the capability layer: CSRF, rate limits, cleanup. */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});
afterEach(() => vi.unstubAllEnvs());

const cookie = (m: { id: string; orgId: string }) => `${SESSION_COOKIE}=${encodeSession({ memberId: m.id, orgId: m.orgId, issuedAt: Math.floor(Date.now() / 1000) })}`;
const rest = (name: string, headers: Record<string, string>, body: unknown = {}) =>
  restPost(new NextRequest(`http://teams.test/api/v1/actions/${name}`, { method: 'POST', body: JSON.stringify(body), headers }), { params: Promise.resolve({ name }) });

describe('CSRF', () => {
  it('cookie-authenticated REST refuses cross-site requests and allows same-origin ones', async () => {
    const c = cookie(A.emp);
    expect((await rest('getMyBalance', { cookie: c, origin: 'https://evil.example' })).status).toBe(403);
    expect((await rest('getMyBalance', { cookie: c, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await rest('getMyBalance', { cookie: c, origin: 'http://teams.test' })).status).toBe(200);
  });

  it('sign-out refuses a cross-site POST', async () => {
    const r = await signout(new NextRequest('http://teams.test/api/auth/signout', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(r.status).toBe(403);
    const ok = await signout(new NextRequest('http://teams.test/api/auth/signout', { method: 'POST', headers: { origin: 'http://teams.test' } }));
    expect(ok.status).toBe(303);
  });
});

describe('rate limits', () => {
  it('people are limited per member, like tokens', async () => {
    vi.stubEnv('RATE_LIMIT_READ', '3');
    const c = cookie(A.emp);
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await rest('getMyBalance', { cookie: c, origin: 'http://teams.test' })).status);
    expect(codes).toEqual([200, 200, 200, 429]);
    const r = await rest('getMyBalance', { cookie: c, origin: 'http://teams.test' });
    expect(r.headers.get('retry-after')).toMatch(/^\d+$/);
    // Another person is unaffected.
    expect((await rest('getMyBalance', { cookie: cookie(A.emp2), origin: 'http://teams.test' })).status).toBe(200);
  });

  it('failed token guesses are throttled per IP on REST and MCP', async () => {
    vi.stubEnv('RATE_LIMIT_AUTH', '2');
    const h = { authorization: 'Bearer dop_not-a-real-token', 'x-forwarded-for': '203.0.113.9' };
    expect((await rest('getMyBalance', h)).status).toBe(401);
    expect((await rest('getMyBalance', h)).status).toBe(401);
    expect((await rest('getMyBalance', h)).status).toBe(429);
    const mcp = await mcpPost(new NextRequest('http://teams.test/api/mcp', { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: '{}' }));
    expect(mcp.status).toBe(429);
    // A different address is not blocked.
    expect((await rest('getMyBalance', { ...h, 'x-forwarded-for': '198.51.100.1' })).status).toBe(401);
  });
});

describe('housekeeping', () => {
  it('prunes old rate windows, long-expired access tokens and stale drafts', async () => {
    await db.insert(rateCounters).values({ key: 'old', windowStart: new Date(NOW.getTime() - 2 * 3_600_000), count: 1 });
    await db.insert(apiTokens).values({ orgId: A.org.id, kind: 'access', name: 'x', tokenHash: 'h1', prefix: 'doa_x', scopes: ['leave:read'], clientId: 'doc_x', expiresAt: new Date(NOW.getTime() - 2 * 86_400_000) });
    const pat = await run(db, humanActor(A.emp), 'managePersonalTokens', { op: 'create', name: 'keep', scopes: ['leave:read'] });
    await db.insert(drafts).values({ orgId: A.org.id, capability: 'submitLeaveRequest', payload: {}, summary: 's', addressedToMemberId: A.emp.id, createdByActorType: 'agent-on-behalf-of-user', confirmationTokenHash: 'h', expiresAt: new Date(NOW.getTime() - 1000) });
    const r = await housekeeping(db, NOW);
    expect(r).toMatchObject({ rateWindows: 1, accessTokens: 1, draftsExpired: 1 });
    expect(await db.select().from(apiTokens).where(eq(apiTokens.id, pat.created!.id))).toHaveLength(1);
  });
});

describe('regulated coverage (RC Phase 6)', () => {
  it('push subscriptions only to the browsers\' push services (no SSRF through the endpoint)', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAA',
      'https://web.push.apple.com/QGuQyavXutnMfk',
      'https://wns2-by3p.notify.windows.com/w/?token=x',
    ]) expect(pushEndpointAllowed(ok), ok).toBe(true);
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://169.254.169.254/latest/meta-data',
      'https://localhost/x',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilpush.apple.com.example/x',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'not a url',
    ]) expect(pushEndpointAllowed(bad), bad).toBe(false);
  });

  it('turning cost-aware ranking off deletes stored pay rates', async () => {
    const { memberPayRates } = await import('@/db/schema');
    await run(db, humanActor(A.owner), 'manageSchedule', { op: 'setVertical', vertical: 'childcare', costAwareRanking: true });
    await db.insert(memberPayRates).values({ orgId: A.org.id, memberId: A.emp.id, hourlyRate: '25.00', effectiveFrom: '2026-01-01' });
    await run(db, humanActor(A.owner), 'manageSchedule', { op: 'setVertical', vertical: 'childcare', costAwareRanking: false });
    expect(await db.select().from(memberPayRates).where(eq(memberPayRates.orgId, A.org.id))).toEqual([]);
  });
});
