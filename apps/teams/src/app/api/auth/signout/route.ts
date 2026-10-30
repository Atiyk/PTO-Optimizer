import { NextResponse, type NextRequest } from 'next/server';
import { IDENTITY_COOKIE, SESSION_COOKIE } from '@/lib/session';

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/signin', request.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(IDENTITY_COOKIE);
  return res;
}
