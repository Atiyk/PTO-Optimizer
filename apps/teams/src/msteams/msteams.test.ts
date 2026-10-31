import { generateKeyPairSync, sign } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { leaveRequests, members, msteamsUsers } from '@/db/schema';
import { POST } from '@/app/api/msteams/messages/route';
import { setDeferredRunner } from '@/server/defer';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { setTeamsTransport } from './api';
import { ISSUER, OPENID_URL, resetTeamsKeyCache, verifyConnectorToken } from './jwt';

/*
 * The Microsoft Teams adapter against Bot Framework activity shapes. The Bot Connector, the
 * Entra token endpoint and the signing keys are faked with a locally generated RSA key; every
 * outgoing call is recorded and nothing is sent anywhere.
 */

const APP_ID = '00000000-aaaa-bbbb-cccc-000000000001';
const TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';
const SERVICE = 'https://smba.trafficmanager.net/amer/';
const JWKS_URL = 'https://login.botframework.com/v1/.well-known/keys';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as { n: string; e: string; kty: string };
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims: Record<string, unknown> = {}, opts: { kid?: string; key?: typeof privateKey } = {}) {
  const nowS = Math.floor(NOW.getTime() / 1000);
  const h = b64({ alg: 'RS256', typ: 'JWT', kid: opts.kid ?? 'k1' });
  const p = b64({ iss: ISSUER, aud: APP_ID, exp: nowS + 3600, nbf: nowS - 60, serviceUrl: SERVICE, ...claims });
  const s = sign('RSA-SHA256', Buffer.from(`${h}.${p}`), opts.key ?? privateKey).toString('base64url');
  return `Bearer ${h}.${p}.${s}`;
}

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
let tasks: (() => Promise<void>)[];
let sent: { method: string; url: string; body: any }[];
const flush = async () => {
  while (tasks.length) await Promise.all(tasks.splice(0).map((t) => t()));
};
const roster: Record<string, { email: string }> = {};

beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Contoso');
  await db.update(members).set({ email: 'emp@contoso.test' }).where(eq(members.id, A.emp.id));
  await db.update(members).set({ email: 'manager@contoso.test' }).where(eq(members.id, A.manager.id));
  roster['29:emp'] = { email: 'EMP@contoso.test' };
  roster['29:mgr'] = { email: 'manager@contoso.test' };
  tasks = [];
  sent = [];
  resetTeamsKeyCache();
  setDeferredRunner((t) => tasks.push(t));
  setTeamsTransport((async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (url === OPENID_URL) return Response.json({ issuer: ISSUER, jwks_uri: JWKS_URL, id_token_signing_alg_values_supported: ['RS256'] });
    if (url === JWKS_URL) return Response.json({ keys: [{ kid: 'k1', kty: 'RSA', use: 'sig', n: jwk.n, e: jwk.e, endorsements: ['msteams'] }, { kid: 'k-web', kty: 'RSA', n: jwk.n, e: jwk.e, endorsements: ['webchat'] }] });
    if (url.startsWith('https://login.microsoftonline.com/')) {
      sent.push({ method, url, body: Object.fromEntries(new URLSearchParams(String(init.body))) });
      return Response.json({ access_token: 'bot-token', expires_in: 3600, token_type: 'Bearer' });
    }
    const m = /\/members\/([^/]+)$/.exec(url);
    if (m) {
      const u = roster[decodeURIComponent(m[1]!)];
      return u ? Response.json({ id: m[1], ...u }) : new Response('not found', { status: 404 });
    }
    sent.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : null });
    return Response.json({ id: 'act-1' });
  }) as unknown as typeof fetch);
  vi.stubEnv('MSTEAMS_APP_ID', APP_ID);
  vi.stubEnv('MSTEAMS_APP_PASSWORD', 'secret-for-tests');
  vi.stubEnv('MSTEAMS_TENANT_ID', TENANT);
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  setDeferredRunner(null);
  setTeamsTransport(null);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const activity = (over: Record<string, unknown> = {}, user = 'emp') => ({
  type: 'message',
  id: `a-${Math.random()}`,
  channelId: 'msteams',
  serviceUrl: SERVICE,
  from: { id: `29:${user}`, aadObjectId: `aad-${user}`, name: user },
  recipient: { id: `28:${APP_ID}` },
  conversation: { id: `a:conv-${user}`, conversationType: 'personal', tenantId: TENANT },
  ...over,
});
const post = (body: unknown, auth: string | null = token()) =>
  POST(new Request('https://app.test/api/msteams/messages', { method: 'POST', headers: auth ? { authorization: auth, 'content-type': 'application/json' } : {}, body: JSON.stringify(body) }));
const messages = () => sent.filter((s) => s.url.includes('/v3/conversations/'));

describe('connector token verification', () => {
  const a = { serviceUrl: SERVICE, channelId: 'msteams' };
  it('accepts a valid token and rejects every broken one', async () => {
    expect((await verifyConnectorToken(token(), a, NOW.getTime())).ok).toBe(true);
    const bad: [string | null, number][] = [
      [null, 401],
      ['Basic abc', 401],
      [token({ aud: 'someone-else' }), 401],
      [token({ iss: 'https://evil.example' }), 401],
      [token({ exp: Math.floor(NOW.getTime() / 1000) - 301 }), 401],
      [token({ nbf: Math.floor(NOW.getTime() / 1000) + 400 }), 401],
      [token({ serviceUrl: 'https://evil.example/' }), 401],
      [token({}, { key: other.privateKey }), 401],
      [token({}, { kid: 'unknown' }), 401],
      [token({}, { kid: 'k-web' }), 403],
    ];
    for (const [auth, status] of bad) {
      const r = await verifyConnectorToken(auth, a, NOW.getTime());
      expect(r, String(auth).slice(0, 30)).toMatchObject({ ok: false, status });
    }
    // Clock skew: 4 minutes past exp is still fine.
    expect((await verifyConnectorToken(token({ exp: Math.floor(NOW.getTime() / 1000) - 240 }), a, NOW.getTime())).ok).toBe(true);
  });

  it('the route refuses unsigned activities before touching the database', async () => {
    expect((await post(activity({ text: 'balance' }), null)).status).toBe(401);
    expect((await post(activity({ text: 'balance' }), token({ aud: 'x' }))).status).toBe(401);
    expect(tasks).toHaveLength(0);
  });
});

describe('Teams bot', () => {
  it('an unlinked Microsoft 365 tenant gets a "not connected" reply', async () => {
    expect((await post(activity({ text: 'balance' }))).status).toBe(200);
    await flush();
    expect(messages()[0]!.body.text).toMatch(/isn't connected to Days Off/);
  });

  it('links the person by work email, answers balance, and saves the 1:1 conversation', async () => {
    await run(db, humanActor(A.owner), 'manageMsTeams', { op: 'link', tenantId: TENANT });
    await post(activity({ text: 'balance' }));
    await flush();
    const msg = messages()[0]!;
    expect(msg.url).toBe(`${SERVICE.replace(/\/$/, '')}/v3/conversations/a%3Aconv-emp/activities`);
    expect(msg.body.text).toMatch(/\*\*Vacation\*\*: .* available now/);
    const [link] = await db.select().from(msteamsUsers).where(eq(msteamsUsers.memberId, A.emp.id));
    expect(link).toMatchObject({ aadObjectId: 'aad-emp', conversationId: 'a:conv-emp', serviceUrl: SERVICE });
    const tokenCall = sent.find((s) => s.url.startsWith('https://login.microsoftonline.com/'))!;
    expect(tokenCall.url).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`);
    expect(tokenCall.body).toMatchObject({ grant_type: 'client_credentials', client_id: APP_ID, scope: 'https://api.botframework.com/.default' });
  });

  it('someone whose email is not in the org is told how to get linked; another tenant’s org is never used', async () => {
    await run(db, humanActor(A.owner), 'manageMsTeams', { op: 'link', tenantId: TENANT });
    roster['29:stranger'] = { email: 'stranger@elsewhere.test' };
    await post(activity({ text: 'balance' }, 'stranger'));
    await flush();
    expect(messages()[0]!.body.text).toMatch(/don't know who you are/);
  });

  it('a request goes to the routed approver as a card; Approve on the card decides it and tells the person', async () => {
    await run(db, humanActor(A.owner), 'manageMsTeams', { op: 'link', tenantId: TENANT });
    // Both people open the app once (install), which saves their conversations.
    for (const u of ['emp', 'mgr']) await post(activity({ type: 'conversationUpdate', text: undefined, membersAdded: [{ id: `28:${APP_ID}` }] }, u));
    await flush();
    expect(messages()).toHaveLength(2);
    sent.length = 0;

    const r = await run(db, humanActor(A.emp), 'submitLeaveRequest', { start: '2026-12-07', end: '2026-12-08', idempotencyKey: 'teams-req-01' });
    await flush();
    const card = messages().find((m) => m.url.includes('conv-mgr'))!;
    const content = card.body.attachments[0].content;
    expect(content.type).toBe('AdaptiveCard');
    expect(JSON.stringify(content.body)).toMatch(/Contoso Emp\*\* asks for \*\*vacation/);
    expect(content.actions.map((x: { title: string }) => x.title)).toEqual(['Approve', 'Decline']);
    sent.length = 0;

    await post(activity({ text: undefined, value: content.actions[0].data, replyToId: 'card-1' }, 'mgr'));
    await flush();
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, r.request.id));
    expect(row!.status).toBe('approved');
    const update = sent.find((s) => s.method === 'PUT')!;
    expect(update.url).toMatch(/conv-mgr\/activities\/card-1$/);
    expect(update.body.text).toMatch(/Approved/);
    expect(messages().find((m) => m.url.includes('conv-emp'))!.body.text).toMatch(/was approved/);
  });

  it('the requester cannot approve their own request from a forged card value', async () => {
    await run(db, humanActor(A.owner), 'manageMsTeams', { op: 'link', tenantId: TENANT });
    await post(activity({ text: undefined, value: { daysoff: 'approve', requestId: A.requestId } }));
    await flush();
    expect(messages().at(-1)!.body.text).toMatch(/requires the|cannot decide your own request/);
    const [row] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, A.requestId));
    expect(row!.status).toBe('pending');
  });

  it('a retried activity is handled once', async () => {
    await run(db, humanActor(A.owner), 'manageMsTeams', { op: 'link', tenantId: TENANT });
    const act = activity({ text: 'help' });
    await post(act);
    await post(act);
    await flush();
    expect(messages()).toHaveLength(1);
    expect(messages()[0]!.body.text).toMatch(/Days Off\*\* in Teams/);
  });

  it('user text in cards is escaped so it cannot become a link or formatting', async () => {
    const { md } = await import('./cards');
    expect(md('[click](https://evil.example) **x**')).toBe('\\[click\\]\\(https://evil\\.example\\) \\*\\*x\\*\\*');
  });

  it('linking a tenant is admin-only, and one tenant belongs to one workspace', async () => {
    await expect(run(db, humanActor(A.manager), 'manageMsTeams', { op: 'link', tenantId: TENANT })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.owner), 'manageMsTeams', { op: 'link', tenantId: 'not-a-guid' })).rejects.toMatchObject({ code: 'invalid_input' });
    await run(db, humanActor(A.owner), 'manageMsTeams', { op: 'link', tenantId: TENANT });
    expect(await run(db, humanActor(A.owner), 'getMsTeamsConnection', {})).toEqual({ botConfigured: true, tenantId: TENANT });
    const B = await buildOrg(db, 'Fabrikam');
    await expect(run(db, humanActor(B.owner), 'manageMsTeams', { op: 'link', tenantId: TENANT })).rejects.toMatchObject({ code: 'forbidden' });
  });
});
