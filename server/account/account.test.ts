// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { featureFlags, readAccountConfig } from './config';
import type { AccountRow, AccountStore } from './db';
import { handleAccount, handleInbound, handleRemind, normalizeLink, readInbound, type AccountDeps } from './handlers';
import type { OutgoingMail } from './mailer';
import { alarmDate, dueItems } from './reminders';
import { signToken, verifyToken } from './tokens';
import { handleFeed, handleWatch } from '../feedEntry';

const SECRET = 'x'.repeat(40);
const NOW = new Date('2026-11-05T12:00:00Z');
const ENV = {
  GMAIL_USER: 'gapless.app@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', DATABASE_URL: 'postgres://fake',
  APP_SECRET: SECRET, CRON_SECRET: 'cron-secret', INBOUND_SECRET: 'inbound-secret', INBOUND_ADDRESS: 'abc123@cloudmailin.net',
  APP_URL: 'https://gapless.example',
};

function memoryStore() {
  const rows = new Map<string, AccountRow & { slot?: number }>();
  let budget = 0;
  let n = 0;
  const store: AccountStore = {
    async findOrCreate(email) {
      const found = [...rows.values()].find((row) => row.email === email);
      if (found) return found;
      const row = { id: `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`, email, plan_link: null, policy_link: null, reminders: false, last_reminded_on: null };
      rows.set(row.id, row);
      return row;
    },
    async byId(id) { return rows.get(id) ?? null; },
    async byEmail(email) { return [...rows.values()].find((row) => row.email === email) ?? null; },
    async save(id, fields) {
      const row = rows.get(id);
      if (!row) return null;
      if (fields.planLink !== undefined) row.plan_link = fields.planLink;
      if (fields.policyLink !== undefined) row.policy_link = fields.policyLink;
      if (fields.reminders !== undefined) row.reminders = fields.reminders;
      return row;
    },
    async remove(id) { rows.delete(id); },
    async dueForReminders(today) { return [...rows.values()].filter((row) => row.reminders && row.last_reminded_on !== today); },
    async markReminded(id, today) { rows.get(id)!.last_reminded_on = today; },
    async takeEmailBudget(_today, cap) { return ++budget <= cap; },
    slots: new Map<string, number>(),
    async takeLoginSlot(email, nowMs) {
      const last = (this as unknown as { slots: Map<string, number> }).slots.get(email);
      if (last !== undefined && nowMs - last < 120_000) return false;
      (this as unknown as { slots: Map<string, number> }).slots.set(email, nowMs);
      return true;
    },
  } as AccountStore;
  return { store, rows };
}

function setup(env: Record<string, string> = ENV) {
  const { store, rows } = memoryStore();
  const sent: OutgoingMail[] = [];
  const deps: AccountDeps = {
    config: readAccountConfig(env),
    store: () => store,
    send: () => async (mail) => { sent.push(mail); },
    feeds: {
      plan: async (q) => { const r = await handleFeed(new Request(`https://x.test/api/feed?${q}`)); return r.ok ? r.text() : null; },
      watch: async (q) => { const r = await handleWatch(new Request(`https://x.test/api/watch?${q}`), NOW); return r.ok ? r.text() : null; },
    },
    now: () => NOW,
  };
  return { deps, sent, rows };
}

const post = (body: unknown, headers: Record<string, string> = {}) => new Request('https://gapless.example/api/account', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://gapless.example', ...headers }, body: JSON.stringify(body),
});

async function signIn(ctx: ReturnType<typeof setup>, email = 'me@example.com'): Promise<string> {
  await handleAccount(post({ action: 'login', email }), ctx.deps);
  const link = ctx.sent.at(-1)!.text.match(/https:\/\/\S+verify=\S+/)![0];
  const res = await handleAccount(new Request(link), ctx.deps);
  return res.headers.get('set-cookie')!.split(';')[0];
}

describe('config and flags', () => {
  it('is off with no environment, and turns on step by step', () => {
    expect(featureFlags(readAccountConfig({}))).toEqual({ email: false, accounts: false, inbound: false });
    expect(featureFlags(readAccountConfig({ GMAIL_USER: 'a@gmail.com', GMAIL_APP_PASSWORD: 'p' }))).toEqual({ email: true, accounts: false, inbound: false });
    expect(featureFlags(readAccountConfig({ ...ENV, APP_SECRET: 'short' })).accounts).toBe(false);
    expect(featureFlags(readAccountConfig(ENV))).toEqual({ email: true, accounts: true, inbound: true });
    expect(readAccountConfig(ENV).gmailAppPassword).toBe('abcdefghijklmnop');
  });
});

describe('tokens', () => {
  it('rejects tampering, expiry and the wrong purpose', () => {
    const token = signToken(SECRET, 'login', 'me@example.com', 60, NOW.getTime());
    expect(verifyToken(SECRET, 'login', token, NOW.getTime())).toBe('me@example.com');
    expect(verifyToken(SECRET, 'session', token, NOW.getTime())).toBeNull();
    expect(verifyToken('y'.repeat(40), 'login', token, NOW.getTime())).toBeNull();
    expect(verifyToken(SECRET, 'login', token, NOW.getTime() + 61_000)).toBeNull();
    expect(verifyToken(SECRET, 'login', `${token}x`, NOW.getTime())).toBeNull();
  });
});

describe('/api/account', () => {
  it('reports accounts off and refuses actions when not configured', async () => {
    const ctx = setup({});
    expect(await (await handleAccount(new Request('https://gapless.example/api/account'), ctx.deps)).json()).toMatchObject({ features: { accounts: false } });
    expect((await handleAccount(post({ action: 'login', email: 'me@example.com' }), ctx.deps)).status).toBe(404);
  });

  it('emails a sign-in link without creating an account, then signs in from the link', async () => {
    const ctx = setup();
    const res = await handleAccount(post({ action: 'login', email: ' Me@Example.com ' }), ctx.deps);
    expect(res.status).toBe(200);
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0].to).toBe('me@example.com');
    expect(ctx.rows.size).toBe(0);
    // A second request within two minutes sends nothing but answers the same.
    expect((await handleAccount(post({ action: 'login', email: 'me@example.com' }), ctx.deps)).status).toBe(200);
    expect(ctx.sent).toHaveLength(1);
    const link = ctx.sent[0].text.match(/https:\/\/\S+verify=\S+/)![0];
    expect(link.startsWith('https://gapless.example/api/account?verify=')).toBe(true);
    const landing = await handleAccount(new Request(link), ctx.deps);
    expect(landing.status).toBe(303);
    expect(landing.headers.get('location')).toBe('https://gapless.example/pto/?signin=ok#account');
    // It lands back on the page the person started from, and only ever on this site.
    await handleAccount(post({ action: 'login', email: 'b@example.com', returnTo: 'https://evil.example/policy?c=US&signin=x' }), ctx.deps);
    const back = await handleAccount(new Request(ctx.sent.at(-1)!.text.match(/https:\/\/\S+verify=\S+/)![0]), ctx.deps);
    expect(back.headers.get('location')).toBe('https://gapless.example/policy?c=US&signin=ok#account');
    expect(landing.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(ctx.rows.size).toBe(2);
  });

  it('refuses cross-site and non-JSON posts', async () => {
    const ctx = setup();
    expect((await handleAccount(post({ action: 'login', email: 'a@b.co' }, { origin: 'https://evil.example' }), ctx.deps)).status).toBe(403);
    const form = new Request('https://gapless.example/api/account', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'action=delete' });
    expect((await handleAccount(form, ctx.deps)).status).toBe(403);
  });

  it('saves only same-site links, and deletes everything in one action', async () => {
    const ctx = setup();
    const cookie = await signIn(ctx);
    const bad = await handleAccount(post({ action: 'save', planLink: 'https://evil.example/phish?x=1' }, { cookie }), ctx.deps);
    expect(bad.status).toBe(200); // the full URL is cut down to a same-site path
    expect([...ctx.rows.values()][0].plan_link).toBe('/phish?x=1');
    expect((await handleAccount(post({ action: 'save', planLink: 'javascript:alert(1)' }, { cookie }), ctx.deps)).status).toBe(400);
    const ok = await handleAccount(post({ action: 'save', policyLink: '/policy?c=US&cb=8', reminders: true }, { cookie }), ctx.deps);
    expect(await ok.json()).toMatchObject({ account: { email: 'me@example.com', policyLink: '/policy?c=US&cb=8', reminders: true } });
    const status = await (await handleAccount(new Request('https://gapless.example/api/account', { headers: { cookie } }), ctx.deps)).json();
    expect(status).toMatchObject({ features: { accounts: true, inbound: true }, inboundAddress: 'abc123@cloudmailin.net', account: { email: 'me@example.com' } });
    const del = await handleAccount(post({ action: 'delete' }, { cookie }), ctx.deps);
    expect(del.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(ctx.rows.size).toBe(0);
  });

  it('normalizes links', () => {
    expect(normalizeLink('https://gapless.example/uk/?b=20')).toBe('/uk/?b=20');
    expect(normalizeLink('/policy')).toBeUndefined();
    expect(normalizeLink('//evil.example/?a=1')).toBe('/?a=1');
    expect(normalizeLink(null)).toBeNull();
  });
});

const POLICY = 'ak=fl&am=0&gd=2026-01-01&cc=5&cb=8&bao=2026-10-01&c=US';

describe('reminder emails', () => {
  it('works out alarm days like a calendar app', () => {
    expect(alarmDate('2026-12-10', '-P6DT15H')).toBe('2026-12-03');
    expect(alarmDate('2026-12-10', 'PT9H')).toBe('2026-12-10');
    expect(alarmDate('2026-12-10', 'PT0S')).toBe('2026-12-10');
  });

  it('emails what the watch feed reminds about today, once a day, with one-click unsubscribe', async () => {
    const ctx = setup();
    const ics = await (await handleWatch(new Request(`https://x.test/api/watch?${POLICY}`), NOW)).text();
    const start = /BEGIN:VALARM/.test(ics) ? ics.split('BEGIN:VEVENT').find((e) => e.includes('VALARM'))!.match(/DTSTART;VALUE=DATE:(\d{8})/)![1] : null;
    expect(start).not.toBeNull();
    const due = `${start!.slice(0, 4)}-${start!.slice(4, 6)}-${start!.slice(6)}`;
    expect(dueItems(ics, due).length).toBeGreaterThan(0);

    const cookie = await signIn(ctx);
    await handleAccount(post({ action: 'save', policyLink: `/policy?${POLICY}`, reminders: true }, { cookie }), ctx.deps);
    const dueNow = new Date(`${due}T13:00:00Z`);
    ctx.deps.now = () => dueNow;
    ctx.deps.feeds.watch = async (q) => (await handleWatch(new Request(`https://x.test/api/watch?${q}`), NOW)).text();
    const cron = (auth?: string) => new Request('https://gapless.example/api/remind', { headers: auth ? { authorization: auth } : {} });
    expect((await handleRemind(cron(), ctx.deps)).status).toBe(401);
    const before = ctx.sent.length;
    expect(await (await handleRemind(cron('Bearer cron-secret'), ctx.deps)).json()).toMatchObject({ checked: 1, sent: 1 });
    const mail = ctx.sent[before];
    expect(mail.to).toBe('me@example.com');
    expect(mail.text).toContain('https://gapless.example/policy?');
    expect(mail.unsubscribeUrl).toMatch(/^https:\/\/gapless\.example\/api\/account\?unsubscribe=/);
    expect(await (await handleRemind(cron('Bearer cron-secret'), ctx.deps)).json()).toMatchObject({ checked: 0, sent: 0 });
    const off = await handleAccount(new Request(mail.unsubscribeUrl!, { method: 'POST' }), ctx.deps);
    expect(off.status).toBe(200);
    expect([...ctx.rows.values()][0].reminders).toBe(false);
  });
});

describe('forward the approval', () => {
  const inbound = (body: unknown, key = 'inbound-secret') => new Request(`https://gapless.example/api/inbound?key=${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const approval = (from: string) => ({
    envelope: { from },
    headers: { From: `Me <${from}>`, Subject: 'Fwd: PTO request' },
    plain: 'Hi, your time off from December 21, 2026 to December 24, 2026 is approved. Enjoy!',
  });

  it('reads the CloudMailin format', () => {
    expect(readInbound(approval('me@example.com'))).toMatchObject({ from: 'me@example.com', subject: 'Fwd: PTO request' });
  });

  it('replies only to a signed-in account, with the dates and an out-of-office message', async () => {
    const ctx = setup();
    expect((await handleInbound(inbound(approval('me@example.com'), 'wrong'), ctx.deps)).status).toBe(401);
    expect(await (await handleInbound(inbound(approval('stranger@example.com')), ctx.deps)).json()).toEqual({ ignored: 'no account' });
    await signIn(ctx);
    const before = ctx.sent.length;
    const res = await handleInbound(inbound(approval('me@example.com')), ctx.deps);
    expect(await res.json()).toMatchObject({ replied: true, decision: 'approved' });
    const reply = ctx.sent[before];
    expect(reply.to).toBe('me@example.com');
    expect(reply.text).toContain('December 21, 2026 to December 24, 2026');
    expect(reply.text).toContain("I'm out of the office");
  });

  it('accepts the multipart format too', async () => {
    const ctx = setup();
    await signIn(ctx);
    const form = new FormData();
    form.set('envelope[from]', 'me@example.com');
    form.set('headers[Subject]', 'Fwd: leave');
    form.set('plain', 'Approved: your leave on January 4, 2027.');
    const res = await handleInbound(new Request('https://gapless.example/api/inbound?key=inbound-secret', { method: 'POST', body: form }), ctx.deps);
    expect(await res.json()).toMatchObject({ replied: true, decision: 'approved' });
    expect(ctx.sent.at(-1)!.text).toContain('January 4, 2027');
  });

  it('is off without the inbound settings', async () => {
    const ctx = setup({ ...ENV, INBOUND_SECRET: '' });
    expect((await handleInbound(inbound(approval('me@example.com')), ctx.deps)).status).toBe(404);
  });
});
