import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { humanActorFromSession } from '@/lib/actor';
import { appUrl } from '@/lib/appUrl';
import { cookieOptions, SESSION_COOKIE } from '@/lib/session';
import { BOT_SCOPES, STATE_COOKIE, USER_SCOPES } from '@/slack/config';

/**
 * Starts Slack OAuth. `?for=workspace` (admins: add the bot) or `?for=status` (anyone: let us set
 * their Slack status while they're out). Both come back to /api/slack/oauth.
 */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('for') === 'status' ? 'status' : 'workspace';
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL('/app?slack=not_configured', request.url));
  const actor = await humanActorFromSession(await getDb(), request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) return NextResponse.redirect(new URL('/signin', request.url));
  if (kind === 'workspace' && actor.role !== 'owner' && actor.role !== 'admin') return NextResponse.redirect(new URL('/app?slack=admins_only', request.url));
  const state = randomBytes(16).toString('base64url');
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    scope: kind === 'workspace' ? BOT_SCOPES.join(',') : '',
    user_scope: kind === 'status' ? USER_SCOPES.join(',') : '',
    redirect_uri: `${appUrl(request.nextUrl.origin)}/api/slack/oauth`,
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, kind }), cookieOptions(600));
  return res;
}
