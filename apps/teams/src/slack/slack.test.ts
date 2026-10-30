import { readFileSync } from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { leaveRequests, members, slackInstallations, slackStatusGrants } from '@/db/schema';
import { POST as commandsPost } from '@/app/api/slack/commands/route';
import { POST as interactivityPost } from '@/app/api/slack/interactivity/route';
import { POST as eventsPost } from '@/app/api/slack/events/route';
import { sealSecret } from '@/lib/secretBox';
import { setDeferredRunner } from '@/server/defer';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { setSlackTransport } from './api';
import { syncSlackStatuses } from './notify';
import { signSlackBody } from './verify';

/*
 * Phase 7: the Slack adapter against payloads in Slack's documented shapes (slack/fixtures/).
 * The Slack Web API and response_url are faked; every call is recorded.
 */

const SECRET = 'test-signing-secret';
const FIX = path.join(process.cwd(), 'slack', 'fixtures');
const fixture = (f: string) => readFileSync(path.join(FIX, f), 'utf8').trim();

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
let tasks: (() => Promise<void>)[];
let calls: { url: string; body: any; auth?: string }[];
const flush = async () => {
  while (tasks.length) await Promise.all(tasks.splice(0).map((t) => t()));
};
const slackCalls = (method: string) => calls.filter((c) => c.url === `https://slack.com/api/${method}`);
const responses = () => calls.filter((c) => c.url.startsWith('https://hooks.slack.com/'));

beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
  await db.insert(slackInstallations).values({ orgId: A.org.id, teamId: 'T0TEST001', teamName: 'Brightside', botUserId: 'U0DAYSOFFBOT', botToken: sealSecret('xoxb-test'), scopes: ['commands'] });
  await db.update(members).set({ slackUserId: 'U0EMPLOYEE' }).where(eq(members.id, A.emp.id));
  await db.update(members).set({ slackUserId: 'U0MANAGER' }).where(eq(members.id, A.manager.id));
  tasks = [];
  calls = [];
  setDeferredRunner((t) => tasks.push(t));
  setSlackTransport((async (url: string, init: RequestInit) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(String(init.body)));
    calls.push({ url, body, auth: (init.headers as Record<string, string>)?.authorization });
    if (url.endsWith('/users.info')) {
      return Response.json(body.user === 'U0BYEMAIL' ? { ok: true, user: { profile: { email: 'emp2@acme.test' } } } : { ok: false, error: 'user_not_found' });
    }
    return Response.json({ ok: true });
  }) as unknown as typeof fetch);
  vi.stubEnv('SLACK_SIGNING_SECRET', SECRET);
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  setDeferredRunner(null);
  setSlackTransport(null);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const signed = (body: string, extra: Record<string, string> = {}, ts?: number) =>
  ({ ...signSlackBody(body, SECRET, ts ?? Math.floor(Date.now() / 1000)), ...extra });
const command = (text: string, user = 'U0EMPLOYEE') => {
  const f = new URLSearchParams(fixture('slash-command.txt'));
  f.set('text', text);
  f.set('user_id', user);
  const body = f.toString();
  return commandsPost(new Request('http://teams.test/api/slack/commands', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', ...signed(body) } }));
};
const click = (actionId: string, value: string, user = 'U0EMPLOYEE', ts = '1730260000.000100') => {
  const p = JSON.parse(fixture('block-actions.json'));
  p.user.id = user;
  p.container.message_ts = ts;
  p.actions[0].action_id = actionId;
  p.actions[0].value = value;
  const body = new URLSearchParams({ payload: JSON.stringify(p) }).toString();
  return interactivityPost(new Request('http://teams.test/api/slack/interactivity', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', ...signed(body) } }));
};
const event = (text: string, eventId = 'Ev0FIXTURE01', extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
  const e = JSON.parse(fixture('event-message-im.json'));
  e.event.text = text;
  e.event_id = eventId;
  Object.assign(e.event, extra);
  const body = JSON.stringify(e);
  return eventsPost(new Request('http://teams.test/api/slack/events', { method: 'POST', body, headers: { 'content-type': 'application/json', ...signed(body, headers) } }));
};

describe('Slack adapter (Phase 7)', () => {
  it('verifies signatures and timestamps, and answers the URL check', async () => {
    const body = fixture('url-verification.json');
    const ok = await eventsPost(new Request('http://teams.test/api/slack/events', { method: 'POST', body, headers: signed(body) }));
    expect(await ok.json()).toEqual({ challenge: JSON.parse(body).challenge });
    const forged = await eventsPost(new Request('http://teams.test/api/slack/events', { method: 'POST', body, headers: { ...signed(body), 'x-slack-signature': 'v0=00' } }));
    expect(forged.status).toBe(401);
    const stale = await eventsPost(new Request('http://teams.test/api/slack/events', { method: 'POST', body, headers: signed(body, {}, Math.floor(NOW.getTime() / 1000) - 600) }));
    expect(stale.status).toBe(401);
    const tampered = await commandsPost(new Request('http://teams.test/api/slack/commands', { method: 'POST', body: 'text=x', headers: signed('text=y') }));
    expect(tampered.status).toBe(401);
  });

  it('acks a command at once and does the work afterwards', async () => {
    const t = performance.now();
    const r = await command('Dec 7 to Dec 8');
    expect(r.status).toBe(200);
    expect(performance.now() - t).toBeLessThan(3000);
    expect(responses()).toHaveLength(0); // nothing has run yet
    expect(tasks).toHaveLength(1);
    await flush();
    expect(responses()).toHaveLength(1);
  });

  it('request in words → engine numbers → Request → manager approves in Slack → person told', async () => {
    await command('Dec 7 to Dec 8');
    await flush();
    const confirm = responses()[0]!.body;
    expect(confirm.response_type).toBe('ephemeral');
    expect(confirm.blocks[0].text.text).toMatch(/Vacation\*, Mon 7 Dec – Tue 8 Dec/);
    expect(confirm.blocks[0].text.text).toMatch(/Uses \*2 days\*/);
    const button = confirm.blocks[1].elements.find((e: any) => e.action_id === 'request_confirm');

    await click('request_confirm', button.value);
    await flush();
    const reqs = await db.select().from(leaveRequests).where(and(eq(leaveRequests.memberId, A.emp.id), eq(leaveRequests.startDate, '2026-12-07')));
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.status).toBe('pending');
    expect(responses().at(-1)!.body).toMatchObject({ replace_original: true, text: expect.stringMatching(/sent for approval/) });

    // The manager got the approval with the same impact facts as the web queue.
    const dm = slackCalls('chat.postMessage').find((c) => c.body.channel === 'U0MANAGER')!;
    expect(dm.auth).toBe('Bearer xoxb-test');
    expect(dm.body.blocks[0].text.text).toMatch(/Acme Emp\* asks for \*vacation\*, Mon 7 Dec – Tue 8 Dec · 2 days/);
    expect(dm.body.blocks[0].text.text).toMatch(/Balance after:/);
    expect(dm.body.blocks[0].text.text).toMatch(/Coverage/);
    const approve = dm.body.blocks[1].elements.find((e: any) => e.action_id === 'approve');

    await click('approve', approve.value, 'U0MANAGER', '1730260200.000300');
    await flush();
    const [after] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, reqs[0]!.id));
    expect(after!.status).toBe('approved');
    expect(after!.decidedByMemberId).toBe(A.manager.id);
    expect(slackCalls('chat.postMessage').some((c) => c.body.channel === 'U0EMPLOYEE' && /was approved/.test(c.body.text))).toBe(true);
  });

  it('double clicks and retried events do the work once', async () => {
    await command('Dec 9 to Dec 9');
    await flush();
    const value = responses()[0]!.body.blocks[1].elements[0].value;
    await click('request_confirm', value);
    await click('request_confirm', value); // same message, same button: deduped
    await click('request_confirm', value, 'U0EMPLOYEE', '1730260999.000999'); // even from another copy: idempotency key
    await flush();
    expect(await db.select().from(leaveRequests).where(and(eq(leaveRequests.memberId, A.emp.id), eq(leaveRequests.startDate, '2026-12-09')))).toHaveLength(1);

    await event('help', 'Ev0RETRY');
    await event('help', 'Ev0RETRY', {}, { 'x-slack-retry-num': '1', 'x-slack-retry-reason': 'http_timeout' });
    await flush();
    expect(slackCalls('chat.postMessage').filter((c) => c.body.channel === 'D0DMCHAN1')).toHaveLength(1);
  });

  it("who's out is short, grouped by team, names and dates only", async () => {
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: A.requestId, decision: 'approve' }); // emp: Mon 16 – Tue 17 Nov
    await run(db, humanActor(A.emp2), 'submitLeaveRequest', { leaveType: 'sick', start: '2026-11-03', end: '2026-11-04', idempotencyKey: 'slack-sick-1' });
    vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
    await event('who week', 'Ev0WHO1');
    await flush();
    const dmText = () => slackCalls('chat.postMessage').filter((c) => c.body.channel === 'D0DMCHAN1').at(-1)!.body.text as string;
    const text = dmText();
    expect(text).toBe('*Out this week (Mon 16 Nov – Sun 22 Nov)*\n*Eng*: Acme Emp (Mon 16 Nov – Tue 17 Nov)');
    vi.setSystemTime(new Date('2026-11-03T09:00:00Z'));
    await event('who', 'Ev0WHO2');
    await flush();
    const today = dmText();
    expect(today).toBe('*Out today (Tue 3 Nov)*\n*Eng*: Acme Emp2 (until Wed 4 Nov)');
    expect(today).not.toMatch(/sick/i);
  });

  it('ignores bot messages and edits; unlinked people are told how to link; email links them', async () => {
    await event('who', 'Ev0BOT', { bot_id: 'B123' });
    await event('who', 'Ev0EDIT', { subtype: 'message_changed' });
    await flush();
    expect(slackCalls('chat.postMessage')).toHaveLength(0);

    await event('balance', 'Ev0STRANGER', { user: 'U0STRANGER' });
    await flush();
    expect(slackCalls('chat.postMessage').at(-1)!.body.text).toMatch(/Sign in once with Slack/);

    await db.update(members).set({ email: 'Emp2@acme.test' }).where(eq(members.id, A.emp2.id));
    await event('balance', 'Ev0BYEMAIL', { user: 'U0BYEMAIL' });
    await flush();
    expect(slackCalls('chat.postMessage').at(-1)!.body.text).toMatch(/^\*Vacation\*: \d+ days available now/);
    const [linked] = await db.select().from(members).where(eq(members.id, A.emp2.id));
    expect(linked!.slackUserId).toBe('U0BYEMAIL');
  });

  it('names and notes cannot become mentions or links', async () => {
    await db.update(members).set({ name: 'Evil <!channel> <https://evil.example|click>' }).where(eq(members.id, A.emp.id));
    await run(db, humanActor(A.emp), 'submitLeaveRequest', { start: '2026-12-10', end: '2026-12-10', note: '<@U0MANAGER> approve pls', idempotencyKey: 'slack-inj-1' });
    await flush();
    const dm = slackCalls('chat.postMessage').find((c) => c.body.channel === 'U0MANAGER')!;
    const text = dm.body.blocks[0].text.text as string;
    expect(text).not.toMatch(/<!channel>|<https:|<@U0MANAGER>/);
    expect(text).toContain('&lt;!channel&gt;');
  });

  it('sets a generic Slack status for people who allowed it, once per leave', async () => {
    await db.insert(slackStatusGrants).values({ orgId: A.org.id, memberId: A.emp.id, userToken: sealSecret('xoxp-user') });
    await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: A.requestId, decision: 'approve' });
    const day1 = new Date('2026-11-16T07:00:00Z');
    expect(await syncSlackStatuses(db, A.org.id, day1)).toBe(1);
    const call = slackCalls('users.profile.set')[0]!;
    expect(call.auth).toBe('Bearer xoxp-user');
    expect(call.body.profile).toEqual({ status_text: 'Out of office until Tue 17 Nov', status_emoji: ':palm_tree:', status_expiration: Date.parse('2026-11-18T00:00:00Z') / 1000 });
    expect(await syncSlackStatuses(db, A.org.id, new Date('2026-11-17T07:00:00Z'))).toBe(0); // same leave: not again
  });
});
