import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed session cookie: "<memberId>.<orgId>.<issuedAtSec>.<hmac>". Phase 2 adds Slack
 * OIDC; both it and the dev login mint this same cookie.
 */
export const SESSION_COOKIE = 'dt_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 14;

export interface Session {
  memberId: string;
  orgId: string;
  issuedAt: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSession(s: Session): string {
  const payload = `${s.memberId}.${s.orgId}.${s.issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(value: string | undefined, nowSec = Math.floor(Date.now() / 1000)): Session | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [memberId, orgId, issued, sig] = parts as [string, string, string, string];
  const expected = Buffer.from(sign(`${memberId}.${orgId}.${issued}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const issuedAt = Number(issued);
  if (!Number.isInteger(issuedAt) || nowSec - issuedAt > MAX_AGE_SEC) return null;
  return { memberId, orgId, issuedAt };
}
