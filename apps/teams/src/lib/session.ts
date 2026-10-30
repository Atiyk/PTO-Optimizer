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

/**
 * Pre-membership identity (signed in with Slack or the dev login, not yet in an org).
 * Short-lived; exchanged for a session when the person creates an org or accepts an invite.
 */
export const IDENTITY_COOKIE = 'dt_identity';
const IDENTITY_MAX_AGE_SEC = 60 * 30;

export interface Identity {
  provider: 'slack' | 'dev';
  subject: string;
  name: string;
  email: string | null;
  slackTeamId: string | null;
  issuedAt: number;
}

export function encodeIdentity(i: Identity): string {
  const payload = Buffer.from(JSON.stringify(i)).toString('base64url');
  return `${payload}.${sign(`id.${payload}`)}`;
}

export function decodeIdentity(value: string | undefined, nowSec = Math.floor(Date.now() / 1000)): Identity | null {
  if (!value) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(`id.${payload}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const i = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Identity;
    if (nowSec - i.issuedAt > IDENTITY_MAX_AGE_SEC) return null;
    return i;
  } catch {
    return null;
  }
}

/** Cookie options shared by every auth cookie. */
export const cookieOptions = (maxAgeSec: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSec,
});
export const SESSION_MAX_AGE_SEC = MAX_AGE_SEC;
export const IDENTITY_MAX_AGE = IDENTITY_MAX_AGE_SEC;

export const devLoginEnabled = () => process.env.NODE_ENV !== 'production' || process.env.DEV_LOGIN === '1';
