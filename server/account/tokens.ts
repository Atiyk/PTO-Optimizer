import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Small signed tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256). Used for the
 * sign-in link, the session cookie and unsubscribe links, so none of them need a table.
 * Each kind has its own purpose string, so a token for one can never be used as another.
 */
export type TokenPurpose = 'login' | 'session' | 'unsubscribe';

interface Payload { p: TokenPurpose; s: string; exp: number }

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function signToken(secret: string, purpose: TokenPurpose, subject: string, ttlSeconds: number, now = Date.now()): string {
  const payload: Payload = { p: purpose, s: subject, exp: Math.floor(now / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(secret, body).toString('base64url')}`;
}

/** The subject when the token is genuine, unexpired and for this purpose; otherwise null. */
export function verifyToken(secret: string, purpose: TokenPurpose, token: string | null | undefined, now = Date.now()): string | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = mac(secret, body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Payload>;
    if (payload.p !== purpose || typeof payload.s !== 'string' || typeof payload.exp !== 'number') return null;
    return payload.exp * 1000 > now ? payload.s : null;
  } catch {
    return null;
  }
}
