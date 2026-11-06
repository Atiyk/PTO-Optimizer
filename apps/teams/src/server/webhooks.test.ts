import { and, eq } from 'drizzle-orm';
import { Webhook } from 'standardwebhooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { webhookDeliveries } from '@/db/schema';
import { GET as cronGet } from '@/app/api/cron/daily/route';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { deliverDue, MAX_ATTEMPTS, pinnedPost, RETRY_DELAYS_MS, scanExpiringBalances, setWebhookTransport, webhookUrlProblem } from './webhooks';

/*
 * 5D: signed webhooks. A fake receiver records requests; the official Standard Webhooks
 * library verifies the signatures, so a real receiver using it will accept ours.
 */

type Seen = { url: string; headers: Record<string, string>; body: string };
function receiver(status = 200) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response(status === 204 ? null : 'ok', { status });
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
}
const publicDns = async () => ['93.184.215.14'];
const events = (seen: Seen[]) => seen.map((s) => JSON.parse(s.body) as { type: string; data: any });

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
let secret: string;
let endpointId: string;
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
  const r = await run(db, humanActor(A.owner), 'manageWebhooks', { op: 'create', url: 'https://hooks.example.com/daysoff', events: ['leave.requested', 'leave.decided', 'balance.expiring', 'plan.proposed'] });
  secret = r.created!.secret;
  endpointId = r.created!.endpointId;
});

describe('webhooks (5D)', () => {
  it('refuses URLs that are not public https', () => {
    expect(webhookUrlProblem('http://hooks.example.com/x')).toMatch(/https/);
    expect(webhookUrlProblem('https://localhost/x')).toMatch(/not reachable/);
    expect(webhookUrlProblem('https://10.1.2.3/x')).toMatch(/not reachable/);
    expect(webhookUrlProblem('https://169.254.169.254/latest/meta-data')).toMatch(/not reachable/);
    expect(webhookUrlProblem('https://[::1]/x')).toMatch(/not reachable/);
    expect(webhookUrlProblem('https://user:pw@hooks.example.com/x')).toMatch(/credentials/);
    expect(webhookUrlProblem('https://hooks.example.com/x')).toBeNull();
  });

  it('signs per Standard Webhooks: the official library verifies our deliveries', async () => {
    const { seen, fetchImpl } = receiver();
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-08', note: 'family trip', idempotencyKey: 'wh-1-key' });
    await deliverDue(db, NOW, { fetchImpl, resolve: publicDns });
    expect(seen).toHaveLength(1);
    const wh = new Webhook(secret);
    vi.useFakeTimers({ toFake: ['Date'], now: NOW }); // the library checks the timestamp against the clock
    try {
      expect(wh.verify(seen[0]!.body, seen[0]!.headers)).toMatchObject({ type: 'leave.requested' });
      // A tampered body fails, and so does a replay ten minutes later.
      expect(() => wh.verify(seen[0]!.body.replace('2026-12-08', '2026-12-09'), seen[0]!.headers)).toThrow();
      vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
      expect(() => wh.verify(seen[0]!.body, seen[0]!.headers)).toThrow();
    } finally {
      vi.useRealTimers();
    }
    const [e] = events(seen);
    expect(e!.data.request).toMatchObject({ member: { id: A.emp2.id, name: { untrusted_text: 'Acme Emp2' } }, leaveType: 'vacation', start: '2026-12-07', end: '2026-12-08', amount: 2, status: 'pending' });
    expect(seen[0]!.body).not.toContain('family trip'); // notes never leave the app
  });

  it('decisions emit leave.decided; health-related leave is only "out", with no type or amount', async () => {
    const { seen, fetchImpl } = receiver();
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: A.requestId, decision: 'approve' });
    await run(db, humanActor(A.emp), 'submitLeaveRequest', { leaveType: 'sick', start: '2026-11-03', end: '2026-11-03', idempotencyKey: 'wh-sick-1' });
    await deliverDue(db, NOW, { fetchImpl, resolve: publicDns });
    const [decided, sick] = events(seen);
    expect(decided).toMatchObject({ type: 'leave.decided', data: { request: { id: A.requestId, status: 'approved', decidedBy: A.manager.id } } });
    expect(sick!.type).toBe('leave.requested');
    expect(sick!.data.request.leaveType).toBe('out');
    expect(sick!.data.request).not.toHaveProperty('amount');
    expect(JSON.stringify(sick)).not.toMatch(/sick/i);
  });

  it('retries with backoff, then marks the delivery failed; "retry now" sends it again', async () => {
    const bad = receiver(500);
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-07', idempotencyKey: 'wh-retry-1' });
    let t = NOW.getTime();
    await deliverDue(db, new Date(t), { fetchImpl: bad.fetchImpl, resolve: publicDns });
    let [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, endpointId));
    expect(d).toMatchObject({ status: 'pending', attempts: 1, lastStatusCode: 500 });
    expect(d!.nextAttemptAt!.getTime()).toBe(t + RETRY_DELAYS_MS[0]!);
    // Not due yet: nothing is sent.
    await deliverDue(db, new Date(t + 1000), { fetchImpl: bad.fetchImpl, resolve: publicDns });
    expect(bad.seen).toHaveLength(1);
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      t += RETRY_DELAYS_MS[i]!;
      await deliverDue(db, new Date(t), { fetchImpl: bad.fetchImpl, resolve: publicDns });
    }
    [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, endpointId));
    expect(d).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    expect(bad.seen).toHaveLength(MAX_ATTEMPTS);
    expect(new Set(bad.seen.map((s) => s.headers['webhook-id']))).toEqual(new Set([d!.id])); // same id on every attempt
    const list = await run(db, humanActor(A.owner), 'manageWebhooks', { op: 'list' });
    expect(list.endpoints[0]!.health).toBe('failing');
    expect(list.deliveries[0]).toMatchObject({ status: 'failed', lastError: 'Receiver answered 500.' });
  });

  it('never sends to a host that resolves to a private address', async () => {
    const { seen, fetchImpl } = receiver();
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-07', idempotencyKey: 'wh-ssrf-1' });
    await deliverDue(db, NOW, { fetchImpl, resolve: async () => ['10.0.0.5'] });
    expect(seen).toHaveLength(0);
    const [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, endpointId));
    expect(d!.lastError).toMatch(/private address/);
  });

  it('plan.proposed is sent for each proposal; balance.expiring once per threshold', async () => {
    const plan = await run(db, humanActor(A.manager), 'runTeamPlan', {});
    const p = plan.people.find((x) => x.memberId === A.emp2.id)!;
    await run(db, humanActor(A.manager), 'sendPlanProposals', { teamId: A.team.id, proposals: [{ memberId: A.emp2.id, blocks: p.requests, deadline: p.deadline }] });
    const proposed = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.event, 'plan.proposed')));
    expect(proposed).toHaveLength(1);
    expect(proposed[0]!.payload).toMatchObject({ member: { id: A.emp2.id }, deadline: '2026-12-31' });

    // Today (59 days out) is outside the warning window.
    expect(await scanExpiringBalances(db, A.org.id, NOW)).toBe(0);
    const dec5 = new Date('2026-12-05T07:00:00Z');
    const first = await scanExpiringBalances(db, A.org.id, dec5);
    expect(first).toBeGreaterThan(0);
    expect(await scanExpiringBalances(db, A.org.id, new Date('2026-12-06T07:00:00Z'))).toBe(0); // same threshold: no repeat
    expect(await scanExpiringBalances(db, A.org.id, new Date('2026-12-26T07:00:00Z'))).toBe(first); // 7-day warning
    const exp = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.event, 'balance.expiring'));
    expect(exp[0]!.payload).toMatchObject({ leaveType: 'vacation', deadline: '2026-12-31', daysLeft: 26 });
  });

  it('send test event reports the receiver’s answer; paused endpoints get nothing', async () => {
    const { seen, fetchImpl } = receiver(204);
    setWebhookTransport({ fetchImpl, resolve: publicDns });
    try {
      const r = await run(db, humanActor(A.owner), 'manageWebhooks', { op: 'sendTest', endpointId, event: 'balance.expiring' });
      expect(r.test, JSON.stringify(r.test)).toEqual({ ok: true, statusCode: 204, error: null });
      expect(events(seen)[0]).toMatchObject({ type: 'balance.expiring', data: { test: true } });
      expect(r.deliveries[0]).toMatchObject({ test: true, status: 'delivered' });
    } finally {
      setWebhookTransport({});
    }
    await run(db, humanActor(A.owner), 'manageWebhooks', { op: 'setActive', endpointId, active: false });
    await expect(run(db, humanActor(A.owner), 'manageWebhooks', { op: 'sendTest', endpointId, event: 'leave.requested' })).rejects.toMatchObject({ code: 'conflict' });
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-07', idempotencyKey: 'wh-paused-1' });
    const rows = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.event, 'leave.requested')));
    expect(rows).toHaveLength(0);
  });

  it('only owners and admins manage webhooks; the cron route needs CRON_SECRET', async () => {
    await expect(run(db, humanActor(A.manager), 'manageWebhooks', { op: 'list' })).rejects.toMatchObject({ code: 'forbidden' });
    process.env.CRON_SECRET = 'cron-test-secret';
    try {
      expect((await cronGet(new Request('http://teams.test/api/cron/daily'))).status).toBe(401);
      expect((await cronGet(new Request('http://teams.test/api/cron/daily', { headers: { authorization: 'Bearer nope-nope-nope-nope' } }))).status).toBe(401);
    } finally {
      delete process.env.CRON_SECRET;
    }
    expect((await cronGet(new Request('http://teams.test/api/cron/daily'))).status).toBe(503);
  });
});

describe('pinned delivery (DNS rebinding)', () => {
  it('connects only to the address that was checked, keeping the URL host name', async () => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => res.writeHead(204, { 'x-host': req.headers.host ?? '', 'x-body': body }).end());
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    try {
      // `hooks.invalid` never resolves in DNS, so reaching the server proves the pinned address was used.
      const res = await pinnedPost(`http://hooks.invalid:${port}/in`, ['127.0.0.1'], { 'content-type': 'application/json' }, '{"a":1}', AbortSignal.timeout(5000));
      expect(res.status).toBe(204);
      await expect(pinnedPost(`http://hooks.invalid:${port}/in`, [], {}, '', AbortSignal.timeout(5000))).rejects.toThrow(/did not resolve/);
    } finally {
      server.close();
    }
  });
});
