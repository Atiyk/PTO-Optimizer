import { createHmac, randomBytes } from 'node:crypto';
import { openSecret } from '@/lib/secretBox';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { after } from 'next/server';
import type { Db } from '@/db/client';
import { leaveTypes, members, webhookDeliveries, webhookEndpoints, type WEBHOOK_EVENTS } from '@/db/schema';
import { forfeitureRisk, isoDate } from '@/domain/leave';

/*
 * Outbound webhooks, signed per the Standard Webhooks spec (standardwebhooks.com):
 * headers webhook-id / webhook-timestamp / webhook-signature, signature
 * "v1,<base64 HMAC-SHA256 of `${id}.${timestamp}.${body}`>", secret "whsec_<base64>".
 *
 * Emitting only writes delivery rows (so it can sit next to the business change); sending
 * happens after the response (next/server `after`), on the daily cron, or on "retry now".
 * Payloads carry what an admin may see, minus notes, and health-related leave shows as "out"
 * with no type or amount (SPEC §5).
 */

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Delay before attempt n+1 after n failures; after the last one the delivery is marked failed. */
export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 3_600_000, 6 * 3_600_000, 24 * 3_600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const TIMEOUT_MS = 10_000;
const CLAIM_LEASE_MS = 60_000;

// ---------------------------------------------------------------------------------------------
// Secrets: shown once as whsec_…, stored sealed (src/lib/secretBox.ts).

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64')}`;
}

/** Standard Webhooks v1 signature. Exported so tests (and receivers) can verify. */
export function signWebhook(secret: string, msgId: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return `v1,${createHmac('sha256', key).update(`${msgId}.${timestamp}.${body}`).digest('base64')}`;
}

// ---------------------------------------------------------------------------------------------
// Destination checks (SSRF): https only, and never a private, loopback or link-local address.

const blocked = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) {
  blocked.addSubnet(net, bits, 'ipv4');
}
for (const [net, bits] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) blocked.addSubnet(net, bits, 'ipv6');

function isPrivateAddress(addr: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr);
  if (mapped) return blocked.check(mapped[1]!, 'ipv4');
  const v = isIP(addr);
  return v === 0 ? true : blocked.check(addr, v === 4 ? 'ipv4' : 'ipv6');
}

/** Problem with a webhook URL as typed, or null. Allows http://localhost only with WEBHOOK_ALLOW_HTTP=1 (dev). */
export function webhookUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'Enter a full URL starting with https://.';
  }
  const devHttp = process.env.WEBHOOK_ALLOW_HTTP === '1';
  if (u.protocol !== 'https:' && !(devHttp && u.protocol === 'http:')) return 'Webhook URLs must use https://.';
  if (u.username || u.password) return 'Put credentials in your receiver, not in the URL.';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (devHttp && (host === 'localhost' || host === '127.0.0.1')) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'That address is not reachable from the internet.';
  if (isIP(host) && isPrivateAddress(host)) return 'That address is not reachable from the internet.';
  return null;
}

export type Resolver = (host: string) => Promise<string[]>;
const dnsResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

// ---------------------------------------------------------------------------------------------
// Emitting

export interface EmitOptions {
  dedupeKey?: string;
  /** Send to this endpoint only, whatever it subscribes to (the "send test event" button). */
  endpointId?: string;
}

/** Queue an event for every active endpoint of the org subscribed to it. Returns delivery ids. */
export async function emitWebhook(db: Db, orgId: string, event: WebhookEvent, data: object, now: Date, opts: EmitOptions = {}): Promise<string[]> {
  const eps = await db
    .select({ id: webhookEndpoints.id, events: webhookEndpoints.events })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.active, true), opts.endpointId ? eq(webhookEndpoints.id, opts.endpointId) : undefined));
  const targets = opts.endpointId ? eps : eps.filter((e) => e.events.includes(event));
  if (!targets.length) return [];
  const rows = await db
    .insert(webhookDeliveries)
    .values(targets.map((e) => ({ orgId, endpointId: e.id, event, payload: data, nextAttemptAt: now, dedupeKey: opts.dedupeKey ?? null })))
    .onConflictDoNothing()
    .returning({ id: webhookDeliveries.id });
  return rows.map((r) => r.id);
}

/** Send queued deliveries once the response has gone out. Outside a request (tests, scripts) this is a no-op. */
export function kickWebhooks(db: Db, orgId: string): void {
  try {
    after(() => deliverDue(db, new Date(), { orgId }).then(() => undefined, () => undefined));
  } catch {
    // Not in a request scope: the cron or "retry now" sends them.
  }
}

// ---------------------------------------------------------------------------------------------
// Delivering

let transport: { fetchImpl?: typeof fetch; resolve?: Resolver } = {};
/** Tests swap the network out here (the capability layer has no way to pass it through). */
export function setWebhookTransport(t: { fetchImpl?: typeof fetch; resolve?: Resolver }): void {
  transport = t;
}

export interface DeliverOptions {
  orgId?: string;
  deliveryIds?: string[];
  limit?: number;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
}

export async function deliverDue(db: Db, now: Date, opts: DeliverOptions = {}): Promise<{ delivered: number; failed: number; retrying: number }> {
  const due = await db
    .select({ d: webhookDeliveries, url: webhookEndpoints.url, secret: webhookEndpoints.secret })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(
      and(
        eq(webhookDeliveries.status, 'pending'),
        lte(webhookDeliveries.nextAttemptAt, now),
        eq(webhookEndpoints.active, true),
        opts.orgId ? eq(webhookDeliveries.orgId, opts.orgId) : undefined,
        opts.deliveryIds ? inArray(webhookDeliveries.id, opts.deliveryIds) : undefined,
      ),
    )
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(opts.limit ?? 25);
  const tally = { delivered: 0, failed: 0, retrying: 0 };
  const doFetch = opts.fetchImpl ?? transport.fetchImpl ?? fetch;
  const resolve = opts.resolve ?? transport.resolve ?? dnsResolver;

  for (const { d, url, secret } of due) {
    // Claim it so a parallel run (cron + after()) cannot send it twice.
    const claimed = await db
      .update(webhookDeliveries)
      .set({ nextAttemptAt: new Date(now.getTime() + CLAIM_LEASE_MS) })
      .where(and(eq(webhookDeliveries.id, d.id), eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.nextAttemptAt, now)))
      .returning({ id: webhookDeliveries.id });
    if (!claimed.length) continue;

    const timestamp = Math.floor(now.getTime() / 1000);
    const body = JSON.stringify({ type: d.event, timestamp: now.toISOString(), data: d.payload });
    let code: number | null = null;
    let error: string | null = null;
    try {
      const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
      const devLocal = process.env.WEBHOOK_ALLOW_HTTP === '1' && (host === 'localhost' || host === '127.0.0.1');
      const addrs = isIP(host) ? [host] : devLocal ? [] : await resolve(host);
      if (!devLocal && addrs.some(isPrivateAddress)) throw new Error('Destination resolves to a private address; not sent.');
      const res = await doFetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'content-type': 'application/json',
          'user-agent': 'DaysOffForTeams-Webhooks/1',
          'webhook-id': d.id,
          'webhook-timestamp': String(timestamp),
          'webhook-signature': signWebhook(openSecret(secret), d.id, timestamp, body),
        },
        body,
      });
      code = res.status;
      if (res.status < 200 || res.status >= 300) error = `Receiver answered ${res.status}.`;
    } catch (e) {
      error = e instanceof Error ? (e.name === 'TimeoutError' ? `No answer within ${TIMEOUT_MS / 1000} s.` : e.message) : 'Send failed.';
    }

    const attempts = d.attempts + 1;
    if (!error) {
      tally.delivered++;
      await db
        .update(webhookDeliveries)
        .set({ status: 'delivered', attempts, lastStatusCode: code, lastError: null, deliveredAt: now, nextAttemptAt: null })
        .where(eq(webhookDeliveries.id, d.id));
    } else if (attempts >= MAX_ATTEMPTS) {
      tally.failed++;
      await db.update(webhookDeliveries).set({ status: 'failed', attempts, lastStatusCode: code, lastError: error.slice(0, 300), nextAttemptAt: null }).where(eq(webhookDeliveries.id, d.id));
    } else {
      tally.retrying++;
      await db
        .update(webhookDeliveries)
        .set({ attempts, lastStatusCode: code, lastError: error.slice(0, 300), nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]!) })
        .where(eq(webhookDeliveries.id, d.id));
    }
  }
  return tally;
}

// ---------------------------------------------------------------------------------------------
// Payloads

export interface RequestEventInput {
  request: { id: string; memberId: string; startDate: string; endDate: string; part: string; status: string; autoApproved: boolean; decidedAt?: Date | null };
  memberName: string;
  leaveType: { key: string; isHealthRelated: boolean };
  amount: number;
  unit: string;
  decidedByMemberId?: string | null;
}

/** leave.requested / leave.decided body: no notes, and health-related leave is just "out". */
export function requestEventData(x: RequestEventInput): object {
  const health = x.leaveType.isHealthRelated;
  return {
    request: {
      id: x.request.id,
      member: { id: x.request.memberId, name: { untrusted_text: x.memberName } },
      leaveType: health ? 'out' : x.leaveType.key,
      start: x.request.startDate,
      end: x.request.endDate,
      ...(health ? {} : { part: x.request.part, amount: x.amount, unit: x.unit }),
      status: x.request.status,
      autoApproved: x.request.autoApproved,
      ...(x.decidedByMemberId !== undefined ? { decidedBy: x.decidedByMemberId, decidedAt: x.request.decidedAt?.toISOString() ?? null } : {}),
    },
  };
}

const NOT_LEGAL_ADVICE_SHORT = 'Not legal advice. Each rule shows its source or "needs verification".';
const SAMPLE_GAP = {
  site: { id: '00000000-0000-4000-8000-000000000005', name: 'Sample Site' },
  room: { id: '00000000-0000-4000-8000-000000000006', name: 'Toddlers' },
  date: '2026-12-21',
  start: '15:30',
  end: '16:30',
  rule: { id: 'ca-toddler-ratio', label: 'Toddler program: 1 teacher per 6', kind: 'ratio', basis: 'law', needsVerification: false, citation: null },
  required: 2,
  present: 1,
  short: 1,
};

/** Sample bodies for "send test event". */
export function sampleEventData(event: WebhookEvent): object {
  const member = { id: '00000000-0000-4000-8000-000000000001', name: { untrusted_text: 'Sample Person' } };
  switch (event) {
    case 'leave.requested':
    case 'leave.decided':
      return {
        test: true,
        request: { id: '00000000-0000-4000-8000-000000000002', member, leaveType: 'vacation', start: '2026-12-21', end: '2026-12-23', part: 'full', amount: 3, unit: 'days', status: event === 'leave.decided' ? 'approved' : 'pending', autoApproved: false },
      };
    case 'balance.expiring':
      return { test: true, member, leaveType: 'vacation', amount: 4, unit: 'days', deadline: '2026-12-31', daysLeft: 30 };
    case 'plan.proposed':
      return { test: true, member, leaveType: 'vacation', deadline: '2026-12-31', blocks: [{ start: '2026-12-21', end: '2026-12-23' }], proposalId: '00000000-0000-4000-8000-000000000003' };
    case 'coverage.gap_detected':
      return { test: true, ...SAMPLE_GAP, notice: NOT_LEGAL_ADVICE_SHORT };
    case 'cover.requested':
    case 'cover.filled':
      return {
        test: true,
        coverRequest: { id: '00000000-0000-4000-8000-000000000004', site: SAMPLE_GAP.site, room: SAMPLE_GAP.room, date: SAMPLE_GAP.date, start: SAMPLE_GAP.start, end: SAMPLE_GAP.end, source: 'call_off', rule: SAMPLE_GAP.rule, short: 1 },
        ...(event === 'cover.filled' ? { filledBy: member } : {}),
      };
    case 'credential.expiring':
      return { test: true, member, credential: { key: 'pediatric_cpr', name: 'Pediatric CPR and first aid' }, expiresOn: '2026-12-31', daysLeft: 14 };
  }
}

// ---------------------------------------------------------------------------------------------
// balance.expiring: a daily scan. Sends once per person, leave type and deadline at 30 and 7 days out.

export const EXPIRY_WARNINGS_DAYS = [30, 7];

export async function scanExpiringBalances(db: Db, orgId: string, now: Date): Promise<number> {
  const [sub] = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.active, true), sql`${'balance.expiring'} = any(${webhookEndpoints.events})`))
    .limit(1);
  if (!sub) return 0;
  const today = isoDate(now);
  const types = await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, orgId), eq(leaveTypes.countsAgainstBalance, true)));
  const people = await db.select().from(members).where(and(eq(members.orgId, orgId), isNull(members.deletedAt)));
  let sent = 0;
  for (const type of types) {
    if (type.isHealthRelated) continue; // never announce health-related balances
    for (const m of people) {
      const risk = await forfeitureRisk(db, orgId, m, type, today);
      if (!risk || risk.amount <= 0) continue;
      const daysLeft = Math.round((Date.parse(`${risk.deadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      const threshold = EXPIRY_WARNINGS_DAYS.filter((t) => daysLeft <= t).sort((a, b) => a - b)[0];
      if (threshold === undefined || daysLeft < 0) continue;
      const ids = await emitWebhook(
        db,
        orgId,
        'balance.expiring',
        { member: { id: m.id, name: { untrusted_text: m.name } }, leaveType: type.key, amount: risk.amount, unit: 'days', deadline: risk.deadline, daysLeft },
        now,
        { dedupeKey: `${m.id}:${type.key}:${risk.deadline}:${threshold}` },
      );
      sent += ids.length;
    }
  }
  return sent;
}
