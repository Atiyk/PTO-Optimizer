import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { appUrl } from '@/lib/appUrl';
import { cookieOptions } from '@/lib/session';

/** Sign in with Slack (OpenID Connect): https://docs.slack.dev/authentication/sign-in-with-slack/ */
export async function GET(request: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/signin?error=slack_not_configured', request.url));
  const state = randomBytes(16).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const next = request.nextUrl.searchParams.get('next');
  const url = new URL('https://slack.com/openid/connect/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    scope: 'openid profile email',
    client_id: clientId,
    state,
    nonce,
    redirect_uri: `${appUrl(request.nextUrl.origin)}/api/auth/slack/callback`,
  }).toString();
  const res = NextResponse.redirect(url);
  // `next` is only ever a same-site path (checked again in the callback).
  res.cookies.set('dt_oidc', JSON.stringify({ state, nonce, next: next?.startsWith('/') && !next.startsWith('//') ? next : null }), cookieOptions(600));
  return res;
}
