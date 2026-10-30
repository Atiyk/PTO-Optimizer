import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { clientIp } from '@/lib/clientIp';
import { sameOrigin } from '@/lib/sameOrigin';
import { cookieOptions, encodeSession, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from '@/lib/session';
import { consumeRate } from '@/server/rateLimit';
import { redeemLoginCode } from '@/server/staffAuth';

/** Sign in with an admin-issued one-time code. Rate-limited per IP; codes are single use. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const db = await getDb();
  const now = new Date();
  try {
    await consumeRate(db, `ip:${clientIp(request.headers)}:code`, 'auth', now);
  } catch {
    return NextResponse.json({ error: 'Too many tries. Wait a minute and try again.' }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === 'string' ? body.code.slice(0, 40) : '';
  const m = code ? await redeemLoginCode(db, code, now) : null;
  if (!m) return NextResponse.json({ error: 'That code is not valid or has expired. Ask your manager for a new one.' }, { status: 400 });
  const res = NextResponse.json({ ok: true, next: '/m' });
  res.cookies.set(SESSION_COOKIE, encodeSession({ memberId: m.id, orgId: m.orgId, issuedAt: Math.floor(now.getTime() / 1000) }), cookieOptions(SESSION_MAX_AGE_SEC));
  return res;
}
