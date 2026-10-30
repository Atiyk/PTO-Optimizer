import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { humanActorFromSession } from '@/lib/actor';
import { clientIp } from '@/lib/clientIp';
import { sameOrigin } from '@/lib/sameOrigin';
import { cookieOptions, encodeSession, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from '@/lib/session';
import { consumeRate } from '@/server/rateLimit';
import { authenticationOptions, CHALLENGE_COOKIE, readChallenge, registrationOptions, signChallenge, verifyAuthentication, verifyRegistration } from '@/server/staffAuth';

/*
 * Passkey ceremonies. register-*: the signed-in person adds a passkey. login-*: sign in
 * with a discoverable passkey (no username typed).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ step: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const { step } = await params;
  const db = await getDb();
  const now = new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  try {
    await consumeRate(db, `ip:${clientIp(request.headers)}:passkey`, 'auth', now);
  } catch {
    return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 });
  }
  try {
    if (step === 'register-options' || step === 'register-verify') {
      const actor = await humanActorFromSession(db, request.cookies.get(SESSION_COOKIE)?.value);
      if (!actor?.memberId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
      if (step === 'register-options') {
        const options = await registrationOptions(db, actor.orgId, actor.memberId);
        const res = NextResponse.json(options);
        res.cookies.set(CHALLENGE_COOKIE, signChallenge('reg', options.challenge, actor.memberId, nowSec), cookieOptions(300));
        return res;
      }
      const ch = readChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, 'reg', nowSec);
      if (!ch || ch.memberId !== actor.memberId) return NextResponse.json({ error: 'That took too long. Try again.' }, { status: 400 });
      await verifyRegistration(db, actor.orgId, actor.memberId, ch.challenge, await request.json(), now);
      const res = NextResponse.json({ ok: true });
      res.cookies.delete(CHALLENGE_COOKIE);
      return res;
    }
    if (step === 'login-options') {
      const options = await authenticationOptions();
      const res = NextResponse.json(options);
      res.cookies.set(CHALLENGE_COOKIE, signChallenge('auth', options.challenge, null, nowSec), cookieOptions(300));
      return res;
    }
    if (step === 'login-verify') {
      const ch = readChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, 'auth', nowSec);
      if (!ch) return NextResponse.json({ error: 'That took too long. Try again.' }, { status: 400 });
      const m = await verifyAuthentication(db, ch.challenge, await request.json(), now);
      if (!m) return NextResponse.json({ error: 'That passkey is not registered here. Use a code from your manager.' }, { status: 400 });
      const res = NextResponse.json({ ok: true, next: '/m' });
      res.cookies.delete(CHALLENGE_COOKIE);
      res.cookies.set(SESSION_COOKIE, encodeSession({ memberId: m.id, orgId: m.orgId, issuedAt: nowSec }), cookieOptions(SESSION_MAX_AGE_SEC));
      return res;
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 400 });
  }
  return NextResponse.json({ error: 'Unknown step.' }, { status: 404 });
}
