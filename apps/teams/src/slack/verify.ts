import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Slack request signing (https://docs.slack.dev/authentication/verifying-requests-from-slack):
 * `v0=` + hex HMAC-SHA256 of `v0:{X-Slack-Request-Timestamp}:{raw body}` with the signing secret.
 * Requests older than five minutes are refused (replay).
 */
export function verifySlackSignature(rawBody: string, headers: Headers, secret: string | undefined, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!secret) return false;
  const ts = headers.get('x-slack-request-timestamp');
  const sig = headers.get('x-slack-signature');
  if (!ts || !sig || !/^\d+$/.test(ts)) return false;
  if (Math.abs(nowSec - Number(ts)) > 300) return false;
  const want = Buffer.from(`v0=${createHmac('sha256', secret).update(`v0:${ts}:${rawBody}`).digest('hex')}`);
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** For tests and fixtures: the headers Slack would send. */
export function signSlackBody(rawBody: string, secret: string, ts = Math.floor(Date.now() / 1000)): Record<string, string> {
  return {
    'x-slack-request-timestamp': String(ts),
    'x-slack-signature': `v0=${createHmac('sha256', secret).update(`v0:${ts}:${rawBody}`).digest('hex')}`,
  };
}
