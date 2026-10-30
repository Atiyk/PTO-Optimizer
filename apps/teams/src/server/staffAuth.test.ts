import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { loginCodes } from '@/db/schema';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import { authenticationOptions, readChallenge, redeemLoginCode, registrationOptions, signChallenge } from './staffAuth';

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
beforeAll(async () => {
  process.env.SESSION_SECRET ??= 'test-secret-0123456789abcdef';
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
});

describe('one-time sign-in codes', () => {
  it('admin issues a code; it works once, case- and dash-insensitively; only its hash is stored', async () => {
    const out = await run(db, humanActor(A.owner), 'manageStaffSignIn', { op: 'issueCode', memberId: A.emp.id });
    expect(out.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const rows = await db.select().from(loginCodes);
    expect(JSON.stringify(rows)).not.toContain(out.code!.replace('-', ''));
    const m = await redeemLoginCode(db, out.code!.toLowerCase().replace('-', ' '), NOW);
    expect(m?.id).toBe(A.emp.id);
    expect(await redeemLoginCode(db, out.code!, NOW)).toBeNull();
  });

  it('expires after 15 minutes, and a new code replaces the old one', async () => {
    const a = await run(db, humanActor(A.owner), 'manageStaffSignIn', { op: 'issueCode', memberId: A.emp2.id });
    const b = await run(db, humanActor(A.owner), 'manageStaffSignIn', { op: 'issueCode', memberId: A.emp2.id });
    expect(await redeemLoginCode(db, a.code!, NOW)).toBeNull();
    expect(await redeemLoginCode(db, b.code!, new Date(NOW.getTime() + 16 * 60_000))).toBeNull();
  });

  it('managers and employees cannot issue codes', async () => {
    await expect(run(db, humanActor(A.manager), 'manageStaffSignIn', { op: 'issueCode', memberId: A.emp.id })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.emp), 'manageStaffSignIn', { op: 'issueCode', memberId: A.emp.id })).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('passkeys', () => {
  it('registration asks for a discoverable credential for this site; sign-in needs no username', async () => {
    const reg = await registrationOptions(db, A.org.id, A.emp.id);
    expect(reg.authenticatorSelection).toMatchObject({ residentKey: 'required' });
    expect(reg.rp.id).toBe('localhost');
    const auth = await authenticationOptions();
    expect(auth.allowCredentials ?? []).toEqual([]);
  });

  it('the challenge cookie is signed, bound to its kind, and expires', () => {
    const now = 1_800_000_000;
    const c = signChallenge('reg', 'abc', A.emp.id, now);
    expect(readChallenge(c, 'reg', now + 10)).toEqual({ challenge: 'abc', memberId: A.emp.id });
    expect(readChallenge(c, 'auth', now + 10)).toBeNull();
    expect(readChallenge(c, 'reg', now + 301)).toBeNull();
    expect(readChallenge(c.replace('.abc.', '.abd.'), 'reg', now + 10)).toBeNull();
  });
});

describe('cover preferences', () => {
  it('a member sets their own; the phone is never echoed back', async () => {
    const out = await run(db, humanActor(A.emp), 'setMyCoverPrefs', { optIn: 'yes', smsOptIn: true, smsPhone: '+15551234567' });
    expect(out).toEqual({ optIn: 'yes', allowedLocationIds: [], smsOptIn: true, smsPhoneSet: true });
    expect(JSON.stringify(await run(db, humanActor(A.emp), 'setMyCoverPrefs', {}))).not.toContain('5551234567');
  });
});
