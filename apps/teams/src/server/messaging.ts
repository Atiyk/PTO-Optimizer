import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { memberCoverPrefs, pushSubscriptions } from '@/db/schema';

/*
 * Outbound messages to staff (cover offers). Three channels behind one interface:
 *   - in-app: always. The offer row itself is the message; the PWA lists it.
 *   - web push: when VAPID keys are configured and the member subscribed on a device.
 *   - SMS/WhatsApp: an adapter. The Twilio implementation is documented and OFF until
 *     MESSAGING_PROVIDER=twilio and all TWILIO_* secrets exist; it never runs in tests.
 * Message text carries no child data, no pay, no leave reason: room, date, times, site.
 */

export interface OutboundMessage {
  memberId: string;
  /** Short text, e.g. "Cover offer: Toddlers, Mon Nov 2, 15:30–16:30 at Sunbeam Oakland." */
  text: string;
  /** Deep link into the app (the offer screen). */
  url: string;
  /** Stable id for de-duplication on the provider side. */
  dedupeKey: string;
}

export interface SmsChannel {
  readonly name: string;
  send(to: string, msg: OutboundMessage): Promise<{ ok: boolean; providerId?: string; error?: string }>;
}

/** Test and default channel: records what would have been sent. Sends nothing anywhere. */
export class MockSmsChannel implements SmsChannel {
  readonly name = 'mock';
  readonly outbox: { to: string; msg: OutboundMessage }[] = [];
  async send(to: string, msg: OutboundMessage) {
    this.outbox.push({ to, msg });
    return { ok: true, providerId: `mock-${this.outbox.length}` };
  }
}

/**
 * Twilio Programmable Messaging (REST, no SDK). OFF by default. To turn on (Atiyk's call,
 * see PROGRESS "Questions"): set MESSAGING_PROVIDER=twilio, TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_FROM (an E.164 number or "whatsapp:+1…") in Vercel.
 * API: POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json with
 * form fields To, From, Body and HTTP Basic auth (AccountSid:AuthToken).
 */
export class TwilioSmsChannel implements SmsChannel {
  readonly name = 'twilio';
  constructor(private readonly cfg: { accountSid: string; authToken: string; from: string }) {}
  async send(to: string, msg: OutboundMessage) {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) throw new Error('Twilio never runs in tests');
    const body = new URLSearchParams({ To: this.cfg.from.startsWith('whatsapp:') ? `whatsapp:${to}` : to, From: this.cfg.from, Body: `${msg.text} ${msg.url}` });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.cfg.accountSid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return { ok: false, error: `twilio ${res.status}` };
    const j = (await res.json()) as { sid?: string };
    return { ok: true, providerId: j.sid };
  }
}

let override: SmsChannel | null = null;
/** Tests inject a mock; production picks from env. */
export function setSmsChannel(c: SmsChannel | null) {
  override = c;
}

export function smsChannel(): SmsChannel | null {
  if (override) return override;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return null;
  const { MESSAGING_PROVIDER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
  if (MESSAGING_PROVIDER === 'twilio' && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) {
    return new TwilioSmsChannel({ accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN, from: TWILIO_FROM });
  }
  return null;
}

export interface PushSender {
  send(sub: { endpoint: string; p256dh: string; auth: string }, payload: string): Promise<{ ok: boolean; gone?: boolean }>;
}

let pushOverride: PushSender | null = null;
export function setPushSender(p: PushSender | null) {
  pushOverride = p;
}

/** Web Push via the `web-push` library, only when VAPID keys exist. */
export async function pushSender(): Promise<PushSender | null> {
  if (pushOverride) return pushOverride;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return null;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return null;
  const webpush = (await import('web-push')).default;
  webpush.setVapidDetails(VAPID_SUBJECT ?? 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return {
    async send(sub, payload) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 900 });
        return { ok: true };
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        return { ok: false, gone: code === 404 || code === 410 };
      }
    },
  };
}

/**
 * Deliver to each member on every channel they have: push to each subscribed device, SMS
 * only with opt-in and a number. Returns the channels used per member (for the offer row).
 * Failures never throw: the in-app offer is always there.
 */
export async function deliver(db: Db, orgId: string, msgs: OutboundMessage[]): Promise<Map<string, string>> {
  const used = new Map<string, string>(msgs.map((m) => [m.memberId, 'in_app']));
  if (msgs.length === 0) return used;
  const ids = msgs.map((m) => m.memberId);
  const push = await pushSender();
  if (push) {
    const subs = await db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.orgId, orgId), inArray(pushSubscriptions.memberId, ids)));
    for (const m of msgs) {
      for (const s of subs.filter((x) => x.memberId === m.memberId)) {
        const r = await push.send(s, JSON.stringify({ title: 'Cover offer', body: m.text, url: m.url, tag: m.dedupeKey }));
        if (r.ok) used.set(m.memberId, 'push');
        else if (r.gone) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      }
    }
  }
  const sms = smsChannel();
  if (sms) {
    const prefs = await db.select().from(memberCoverPrefs).where(and(eq(memberCoverPrefs.orgId, orgId), inArray(memberCoverPrefs.memberId, ids), eq(memberCoverPrefs.smsOptIn, true)));
    for (const m of msgs) {
      const p = prefs.find((x) => x.memberId === m.memberId);
      if (!p?.smsPhone) continue;
      const r = await sms.send(p.smsPhone, m).catch(() => ({ ok: false }));
      if (r.ok) used.set(m.memberId, used.get(m.memberId) === 'push' ? 'push+sms' : 'sms');
    }
  }
  return used;
}
