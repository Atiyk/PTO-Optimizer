import { timingSafeEqual } from 'node:crypto';
import { MAX_APPROVAL_INPUT, parseApprovalMessage } from '../../src/personal/approvalParser';
import { outOfOfficeMessage } from '../../src/personal/outOfOffice';
import { utcDateISO } from '../../src/ui/today';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { featureFlags, missingSettings, type AccountConfig } from './config';
import type { AccountRow, AccountStore } from './db';
import type { SendMail } from './mailer';
import { dueItems, reminderEmail } from './reminders';
import { signToken, verifyToken } from './tokens';

/**
 * Request handling for the optional account features. Everything external (database, mail,
 * the two calendar feeds, the clock) is passed in, so this file is tested without a network.
 */
export interface AccountDeps {
  config: AccountConfig;
  store: () => AccountStore;
  send: () => SendMail;
  /** ICS text of /api/feed or /api/watch for a query string, or null when it can't be built. */
  feeds: { plan(query: string): Promise<string | null>; watch(query: string): Promise<string | null> };
  now?: () => Date;
}

export const SESSION_COOKIE = 'gapless_session';
export const SIGNED_IN_COOKIE = 'gapless_signed_in';
const SESSION_TTL = 60 * 60 * 24 * 30;
const LOGIN_TTL = 60 * 30;
const UNSUBSCRIBE_TTL = 60 * 60 * 24 * 365;
export const MAX_LINK_LENGTH = 4096;
const LOGIN_LINKS_PER_IP_PER_HOUR = 5;
const INBOUND_REPLIES_PER_ACCOUNT_PER_DAY = 5;
const HOUR_MS = 60 * 60 * 1000;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}$/i;

const SECURITY_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function json(status: number, body: unknown, headers: Record<string, string> = {}, cookies: string[] = []): Response {
  const all = new Headers({ 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers });
  for (const cookie of cookies) all.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers: all });
}

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function page(status: number, title: string, message: string, origin: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">${esc(title)}</h1><p>${esc(message)}</p><p><a href="${esc(origin)}/">Back to Gapless</a></p></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } });
}

/** The sign-in link opens this page, and only its button signs in, so visiting a link someone
 * else sent you (or a mail scanner prefetching it) never signs your browser into their account. */
function confirmSignInPage(origin: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in to Gapless</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">Sign in to Gapless</h1><p>Only continue if you asked for this link yourself.</p>
<form method="post"><button type="submit" style="font:inherit;padding:.6rem 1.2rem;cursor:pointer">Sign in</button></form><p><a href="${esc(origin)}/">Back to Gapless</a></p></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } });
}

/** The caller's IP for rate limiting. On Vercel the edge sets x-real-ip and the first x-forwarded-for entry. */
function clientIp(request: Request): string {
  return request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ location, ...SECURITY_HEADERS });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 303, headers });
}

function siteOrigin(config: AccountConfig, request: Request): string {
  return config.appUrl ?? new URL(request.url).origin;
}

/** Server "today": UTC calendar date, since requests carry no viewer timezone (see today.ts). */
function today(deps: AccountDeps): string {
  return utcDateISO(deps.now?.() ?? new Date());
}

/** The HttpOnly session plus a readable "signed in" hint (no secret in it), so signed-out
 * pages never need to call /api/account to find out. */
function sessionCookies(token: string | null): string[] {
  return token
    ? [`${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`,
      `${SIGNED_IN_COOKIE}=1; Path=/; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`]
    : [`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      `${SIGNED_IN_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`];
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const angle = /<([^<>]+)>/.exec(raw);
  const email = (angle ? angle[1] : raw).trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/**
 * A saved link is stored as a same-site path and query ("/policy?c=US&..."), never a full URL,
 * so an email can only ever link back to this site. Full URLs are accepted and cut down.
 */
export function normalizeLink(raw: unknown, requireQuery = true): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > MAX_LINK_LENGTH + 200) return undefined;
  let url: URL;
  try { url = new URL(raw, 'https://placeholder.invalid'); } catch { return undefined; }
  if (!/^\/[a-z0-9/-]*$/i.test(url.pathname) || url.pathname.includes('//') || (requireQuery && !url.search)) return undefined;
  const link = `${url.pathname}${url.search}`;
  return link.length <= MAX_LINK_LENGTH ? link : undefined;
}

/** Where to land after sign-in: the same-site page the person started from, without signin= noise. */
function landing(raw: string | null, outcome: 'ok' | 'expired'): string {
  const path = normalizeLink(raw, false) ?? '/pto/';
  const url = new URL(path, 'https://placeholder.invalid');
  url.searchParams.set('signin', outcome);
  return `${url.pathname}${url.search}#account`;
}

function publicAccount(row: AccountRow) {
  return { email: row.email, planLink: row.plan_link, policyLink: row.policy_link, reminders: row.reminders };
}

async function currentAccount(request: Request, deps: AccountDeps): Promise<AccountRow | null> {
  const id = verifyToken(deps.config.appSecret!, 'session', readCookie(request, SESSION_COOKIE), (deps.now?.() ?? new Date()).getTime());
  return id ? deps.store().byId(id) : null;
}

/** Same-origin JSON only: a cross-site form can't send application/json, and Origin must match. */
function isSameOriginJson(request: Request): boolean {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return false;
  const origin = request.headers.get('origin');
  return origin === null || origin === new URL(request.url).origin;
}

async function sendBudgeted(deps: AccountDeps, mail: Parameters<SendMail>[0]): Promise<boolean> {
  if (!(await deps.store().takeEmailBudget(today(deps), deps.config.dailyEmailCap))) return false;
  await deps.send()(mail);
  return true;
}

/** /api/account: status (GET), sign-in link landing (?verify=), unsubscribe (?unsubscribe=), actions (POST). */
export async function handleAccount(request: Request, deps: AccountDeps): Promise<Response> {
  const { config } = deps;
  const flags = featureFlags(config);
  const url = new URL(request.url);
  const origin = siteOrigin(config, request);
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  if (!flags.accounts) {
    return request.method === 'GET' && !url.search
      ? json(200, { features: { accounts: false, inbound: false }, account: null, missing: missingSettings(config) })
      : json(404, { error: 'Accounts are not set up on this site.' });
  }
  const secret = config.appSecret!;

  const unsubscribe = url.searchParams.get('unsubscribe');
  if (unsubscribe !== null) {
    const id = verifyToken(secret, 'unsubscribe', unsubscribe, nowMs);
    if (request.method !== 'GET' && request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
    if (!id) return page(400, 'This link has expired', 'Sign in to Gapless to turn reminder emails off.', origin);
    await deps.store().save(id, { reminders: false });
    return request.method === 'POST' ? json(200, { ok: true }) : page(200, 'Reminder emails are off', 'You will not get any more reminder emails. Your saved plan stays in your account until you delete it.', origin);
  }

  const verify = url.searchParams.get('verify');
  if (verify !== null) {
    const email = verifyToken(secret, 'login', verify, nowMs);
    const next = url.searchParams.get('next');
    if (!email) return redirect(`${origin}${landing(next, 'expired')}`);
    if (request.method === 'GET') return confirmSignInPage(origin);
    // The button posts from the page above; a form on another site carries a different Origin.
    if (request.method !== 'POST' || request.headers.get('origin') !== url.origin) return json(403, { error: 'Forbidden.' });
    const row = await deps.store().findOrCreate(email);
    return redirect(`${origin}${landing(next, 'ok')}`, sessionCookies(signToken(secret, 'session', row.id, SESSION_TTL, nowMs)));
  }

  if (request.method === 'GET') {
    const row = await currentAccount(request, deps);
    const stale = !row && readCookie(request, SIGNED_IN_COOKIE) !== null;
    return json(200, {
      features: { accounts: true, inbound: flags.inbound },
      inboundAddress: flags.inbound ? config.inboundAddress : null,
      account: row ? publicAccount(row) : null,
      missing: missingSettings(config),
    }, {}, stale ? sessionCookies(null) : []);
  }

  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { allow: 'GET, POST' });
  if (!isSameOriginJson(request)) return json(403, { error: 'Forbidden.' });
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 20_000) return json(413, { error: 'Too large.' });
    body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== 'object') throw new Error('not an object');
  } catch {
    return json(400, { error: 'Bad request.' });
  }

  if (body.action === 'login') {
    const email = normalizeEmail(body.email);
    if (!email) return json(400, { error: 'Enter a valid email address.' });
    if (!(await deps.store().takeRateSlot(`login-ip:${clientIp(request)}`, LOGIN_LINKS_PER_IP_PER_HOUR, HOUR_MS, nowMs))) {
      return json(429, { error: 'Too many sign-in links were asked for from here. Try again in an hour.' });
    }
    // The answer is the same whether or not a link was sent, so it says nothing about who has an account.
    if (await deps.store().takeLoginSlot(email, nowMs)) {
      const next = normalizeLink(body.returnTo, false);
      const link = `${origin}/api/account?verify=${encodeURIComponent(signToken(secret, 'login', email, LOGIN_TTL, nowMs))}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
      const sent = await sendBudgeted(deps, {
        to: email,
        subject: 'Your Gapless sign-in link',
        text: ['Hi,', '', 'Use this link to sign in to Gapless. It works for 30 minutes.', '', link, '',
          'If you did not ask for this, ignore this email. No account is created unless the link is used.'].join('\n'),
      });
      if (!sent) return json(503, { error: 'Gapless has sent its email limit for today. Try again tomorrow.' });
    }
    return json(200, { ok: true });
  }

  const row = await currentAccount(request, deps);
  if (!row) return json(401, { error: 'Sign in first.' }, {}, sessionCookies(null));

  if (body.action === 'save') {
    const planLink = normalizeLink(body.planLink);
    const policyLink = normalizeLink(body.policyLink);
    if ((body.planLink !== undefined && planLink === undefined) || (body.policyLink !== undefined && policyLink === undefined)) {
      return json(400, { error: 'That link is not a Gapless plan or policy link.' });
    }
    if (body.reminders !== undefined && typeof body.reminders !== 'boolean') return json(400, { error: 'Bad request.' });
    const saved = await deps.store().save(row.id, { planLink, policyLink, reminders: body.reminders as boolean | undefined });
    return json(200, { account: saved ? publicAccount(saved) : null });
  }
  if (body.action === 'signout') return json(200, { ok: true }, {}, sessionCookies(null));
  if (body.action === 'delete') {
    await deps.store().remove(row.id);
    return json(200, { ok: true }, {}, sessionCookies(null));
  }
  return json(400, { error: 'Unknown action.' });
}

function secretsMatch(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** /api/remind: the daily Vercel cron job. Sends each person one email on days something is due. */
export async function handleRemind(request: Request, deps: AccountDeps): Promise<Response> {
  const { config } = deps;
  if (!featureFlags(config).accounts || !config.cronSecret) return json(404, { error: 'Reminder emails are not set up on this site.' });
  if (!secretsMatch(request.headers.get('authorization'), `Bearer ${config.cronSecret}`)) return json(401, { error: 'Unauthorized.' });
  const day = today(deps);
  const origin = siteOrigin(config, request);
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const store = deps.store();
  let checked = 0, sent = 0, failed = 0, capped = false;
  for (const row of await store.dueForReminders(day, 200)) {
    checked += 1;
    const query = (link: string | null) => (link ? link.slice(link.indexOf('?') + 1) : null);
    const [planICS, watchICS] = await Promise.all([
      row.plan_link ? deps.feeds.plan(query(row.plan_link)!).catch(() => null) : null,
      row.policy_link ? deps.feeds.watch(query(row.policy_link)!).catch(() => null) : null,
    ]);
    const items = [...(planICS ? dueItems(planICS, day) : []), ...(watchICS ? dueItems(watchICS, day) : [])];
    if (items.length > 0) {
      const unsubscribeUrl = `${origin}/api/account?unsubscribe=${encodeURIComponent(signToken(config.appSecret!, 'unsubscribe', row.id, UNSUBSCRIBE_TTL, nowMs))}`;
      const mail = reminderEmail(items, {
        planUrl: row.plan_link ? `${origin}${row.plan_link}` : undefined,
        policyUrl: row.policy_link ? `${origin}${row.policy_link}` : undefined,
        unsubscribeUrl, accountUrl: `${origin}${row.plan_link ?? row.policy_link}#account`,
      });
      try {
        if (!(await sendBudgeted(deps, { to: row.email, ...mail, unsubscribeUrl }))) { capped = true; break; }
        sent += 1;
      } catch {
        failed += 1;
        continue; // Not marked, so the next run tries again.
      }
    }
    await store.markReminded(row.id, day);
  }
  return json(200, { day, checked, sent, failed, capped });
}

interface InboundMail { from: string | null; envelopeFrom: string | null; subject: string; text: string; spf: string | null }

/** CloudMailin's JSON format: envelope.from, headers (keys vary in case), plain. */
export function readInbound(body: unknown): InboundMail | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as { envelope?: { from?: unknown; spf?: { result?: unknown } }; headers?: Record<string, unknown>; plain?: unknown; html?: unknown };
  const headers = Object.fromEntries(Object.entries(record.headers ?? {}).map(([key, value]) => [key.toLowerCase().replace(/_/g, '-'), value]));
  const header = (name: string) => {
    const value = headers[name];
    return typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null;
  };
  const text = typeof record.plain === 'string' && record.plain.trim() ? record.plain
    : typeof record.html === 'string' ? record.html : '';
  return {
    from: normalizeEmail(header('from')) ?? normalizeEmail(record.envelope?.from),
    envelopeFrom: normalizeEmail(record.envelope?.from),
    subject: header('subject') ?? '',
    text: text.slice(0, MAX_APPROVAL_INPUT),
    spf: typeof record.envelope?.spf?.result === 'string' ? record.envelope.spf.result.toLowerCase() : null,
  };
}

/** CloudMailin's multipart format names fields like "plain", "headers[From]" and "envelope[from]". */
function multipartToInbound(form: FormData): Record<string, unknown> {
  const headers: Record<string, string> = {};
  const envelope: Record<string, unknown> = {};
  let plain: string | undefined;
  let html: string | undefined;
  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string') continue;
    const nested = /^(headers|envelope)\[([^\]]+)\]$/.exec(key);
    if (nested) (nested[1] === 'headers' ? headers : envelope)[nested[2]] = value;
    else if (key === 'envelope[spf][result]') envelope.spf = { result: value };
    else if (key === 'plain') plain = value;
    else if (key === 'html') html = value;
  }
  return { headers, envelope, plain, html };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * /api/inbound?key=...: a signed-in person forwards their manager's reply to the app's
 * address. The text is read in memory, never stored, and the answer goes back only to the
 * account's own address, so a forged sender can't use it to read anything.
 */
export async function handleInbound(request: Request, deps: AccountDeps): Promise<Response> {
  const { config } = deps;
  if (!featureFlags(config).inbound) return json(404, { error: 'Not set up.' });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!secretsMatch(new URL(request.url).searchParams.get('key'), config.inboundSecret!)) return json(401, { error: 'Unauthorized.' });
  let body: unknown;
  try {
    if (Number(request.headers.get('content-length') ?? 0) > 2_000_000) return json(413, { error: 'Too large.' });
    body = (request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')
      ? multipartToInbound(await request.formData())
      : JSON.parse(await request.text());
  } catch {
    return json(400, { error: 'Expected CloudMailin’s JSON or multipart format.' });
  }
  const mail = readInbound(body);
  // 2xx for anything we choose to ignore, so the provider doesn't bounce or retry it.
  if (!mail?.from || mail.from === config.gmailUser?.toLowerCase() || /(^|[.@])google\.com$/.test(mail.from.split('@')[1] ?? '')) {
    return json(200, { ignored: 'sender' });
  }
  // The From header is easy to forge. CloudMailin checks SPF for the envelope sender, so mail
  // that fails it, or whose envelope sender is on another domain than From (SPF would then
  // vouch for the wrong domain), is dropped, and each account gets a few replies a day at most.
  const domain = (address: string) => address.split('@')[1];
  if (mail.spf === 'fail' || mail.spf === 'softfail' || (mail.envelopeFrom && domain(mail.envelopeFrom) !== domain(mail.from))) {
    return json(200, { ignored: 'spf' });
  }
  const row = await deps.store().byEmail(mail.from);
  if (!row) return json(200, { ignored: 'no account' });
  if (!(await deps.store().takeRateSlot(`inbound:${row.id}`, INBOUND_REPLIES_PER_ACCOUNT_PER_DAY, 24 * HOUR_MS, (deps.now?.() ?? new Date()).getTime()))) {
    return json(200, { ignored: 'daily limit' });
  }

  const day = today(deps);
  const parsed = parseApprovalMessage(`${mail.subject}\n${mail.text}`, { today: day, requests: [] });
  const origin = siteOrigin(config, request);
  const range = parsed.dateRanges[0];
  const decision = parsed.decision === 'approved' ? 'an approval' : parsed.decision === 'rejected' ? 'a denial' : null;
  const lines = ['Hi,', ''];
  if (!decision || !range) {
    lines.push("Gapless couldn't tell whether the email you forwarded approves or denies time off, or for which dates.",
      `Open Gapless and paste the reply into the approval assistant to check it by hand: ${origin}/policy`);
  } else {
    const when = range.start === range.end ? longDate(range.start) : `${longDate(range.start)} to ${longDate(range.end)}`;
    lines.push(`This reads as ${decision} for ${when}${parsed.confidence === 'high' ? '' : ' (please double-check the dates)'}.`);
    if (parsed.decision === 'approved') {
      lines.push('', 'Mark the request approved in Gapless so your balance stays right:', `${origin}/policy`, '',
        'An out-of-office message you can copy (edit the parts in brackets):', '', '---',
        outOfOfficeMessage(range, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }), '---');
    } else {
      lines.push('', `Gapless can suggest other dates: ${origin}/`);
    }
  }
  lines.push('', 'The email you forwarded was read once to write this reply and was not stored.');
  try {
    await sendBudgeted(deps, { to: row.email, subject: `Re: ${mail.subject || 'your forwarded email'}`.slice(0, 200), text: lines.join('\n') });
  } catch {
    return json(500, { error: 'Could not send the reply.' }); // 5xx: CloudMailin retries later.
  }
  return json(200, { replied: true, decision: parsed.decision });
}
