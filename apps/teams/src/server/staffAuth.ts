import { PRODUCT_NAME } from '@/lib/brand';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Db } from '@/db/client';
import { loginCodes, members, passkeys } from '@/db/schema';
import { CapabilityError } from '@/capabilities/errors';
import { appUrl } from '@/lib/appUrl';
import { hashToken } from '@/lib/tokens';

/*
 * Sign-in for staff without Slack (no email, no SMS needed):
 *   - Passkeys (WebAuthn, @simplewebauthn/server): discoverable credentials, so sign-in is
 *     one tap with Face ID / fingerprint / screen lock. Only public keys are stored.
 *   - Fallback: an admin reads a one-time code to the person (10 characters, 15 minutes,
 *     single use, stored hashed, attempts rate-limited per IP by the caller).
 * The WebAuthn challenge lives in a short-lived signed cookie, not the database.
 */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const CODE_TTL_MS = 15 * 60_000;
export const CHALLENGE_COOKIE = 'dt_webauthn';
const CHALLENGE_TTL_SEC = 300;

export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function issueLoginCode(db: Db, orgId: string, memberId: string, byMemberId: string | null, now: Date): Promise<{ code: string; expiresAt: Date }> {
  const [m] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.id, memberId), isNull(members.deletedAt)));
  if (!m) throw new CapabilityError('not_found', 'Member not found.');
  // One live code per person: older unused codes stop working.
  await db.update(loginCodes).set({ usedAt: now }).where(and(eq(loginCodes.memberId, memberId), isNull(loginCodes.usedAt)));
  const raw = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);
  await db.insert(loginCodes).values({ orgId, memberId, codeHash: hashToken(raw), expiresAt, createdByMemberId: byMemberId });
  return { code: `${raw.slice(0, 5)}-${raw.slice(5)}`, expiresAt };
}

/** Returns the member for a valid unused code and burns it; null otherwise. */
export async function redeemLoginCode(db: Db, code: string, now: Date) {
  const hash = hashToken(normaliseCode(code));
  const [row] = await db
    .update(loginCodes)
    .set({ usedAt: now })
    .where(and(eq(loginCodes.codeHash, hash), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, now)))
    .returning();
  if (!row) return null;
  const [m] = await db.select().from(members).where(and(eq(members.id, row.memberId), eq(members.orgId, row.orgId), isNull(members.deletedAt)));
  return m ?? null;
}

function rp() {
  const url = new URL(appUrl());
  return { rpID: url.hostname, origin: url.origin, rpName: PRODUCT_NAME };
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

/** "<kind>.<challenge>.<memberId|->.<expSec>.<hmac>" */
export function signChallenge(kind: 'reg' | 'auth', challenge: string, memberId: string | null, nowSec: number): string {
  const payload = `${kind}.${challenge}.${memberId ?? '-'}.${nowSec + CHALLENGE_TTL_SEC}`;
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}

export function readChallenge(value: string | undefined, kind: 'reg' | 'auth', nowSec: number): { challenge: string; memberId: string | null } | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 5) return null;
  const [k, challenge, member, exp, sig] = parts as [string, string, string, string, string];
  const expected = Buffer.from(createHmac('sha256', secret()).update(`${k}.${challenge}.${member}.${exp}`).digest('base64url'));
  if (expected.length !== Buffer.from(sig).length || !timingSafeEqual(expected, Buffer.from(sig))) return null;
  if (k !== kind || Number(exp) < nowSec) return null;
  return { challenge, memberId: member === '-' ? null : member };
}

export async function registrationOptions(db: Db, orgId: string, memberId: string) {
  const [m] = await db.select().from(members).where(and(eq(members.orgId, orgId), eq(members.id, memberId)));
  if (!m) throw new CapabilityError('not_found', 'Member not found.');
  const existing = await db.select().from(passkeys).where(and(eq(passkeys.orgId, orgId), eq(passkeys.memberId, memberId)));
  const { rpID, rpName } = rp();
  return generateRegistrationOptions({
    rpName,
    rpID,
    userName: m.name,
    userID: new TextEncoder().encode(m.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
}

export async function verifyRegistration(db: Db, orgId: string, memberId: string, expectedChallenge: string, response: RegistrationResponseJSON, now: Date) {
  const { rpID, origin } = rp();
  const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  if (!v.verified) throw new CapabilityError('invalid_input', 'The passkey could not be verified.');
  const c = v.registrationInfo.credential;
  await db.insert(passkeys).values({
    orgId,
    memberId,
    credentialId: c.id,
    publicKey: Buffer.from(c.publicKey).toString('base64url'),
    counter: c.counter,
    transports: c.transports ?? [],
    name: v.registrationInfo.credentialDeviceType === 'multiDevice' ? 'Synced passkey' : 'This device',
    createdAt: now,
  });
}

export async function authenticationOptions() {
  return generateAuthenticationOptions({ rpID: rp().rpID, userVerification: 'preferred' });
}

/** Verifies a discoverable-credential sign-in; returns the member. */
export async function verifyAuthentication(db: Db, expectedChallenge: string, response: AuthenticationResponseJSON, now: Date) {
  const [pk] = await db.select().from(passkeys).where(eq(passkeys.credentialId, response.id));
  if (!pk) return null;
  const { rpID, origin } = rp();
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: { id: pk.credentialId, publicKey: new Uint8Array(Buffer.from(pk.publicKey, 'base64url')), counter: pk.counter, transports: pk.transports },
    requireUserVerification: false,
  });
  if (!v.verified) return null;
  await db.update(passkeys).set({ counter: v.authenticationInfo.newCounter, lastUsedAt: now }).where(eq(passkeys.id, pk.id));
  const [m] = await db.select().from(members).where(and(eq(members.id, pk.memberId), eq(members.orgId, pk.orgId), isNull(members.deletedAt)));
  return m ?? null;
}
