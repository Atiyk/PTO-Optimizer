import { NextResponse, type NextRequest } from 'next/server';
import { IDENTITY_COOKIE, SESSION_COOKIE } from '@/lib/session';
import { sameOrigin } from '@/lib/sameOrigin';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  // The staff app signs out to its own sign-in screen (?to=m); nothing else is accepted.
  const res = NextResponse.redirect(new URL(request.nextUrl.searchParams.get('to') === 'm' ? '/m/signin' : '/signin', request.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(IDENTITY_COOKIE);
  return res;
}
