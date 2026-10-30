import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { appUrl } from '@/lib/appUrl';
import { cookieOptions, encodeIdentity, encodeSession, IDENTITY_COOKIE, IDENTITY_MAX_AGE, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from '@/lib/session';
import { membersForSlackUser } from '@/server/bootstrap';

interface UserInfo {
  ok: boolean;
  sub?: string;
  name?: string;
  email?: string;
  'https://slack.com/team_id'?: string;
}

export async function GET(request: NextRequest) {
  const fail = (code: string) => NextResponse.redirect(new URL(`/signin?error=${code}`, request.url));
  const params = request.nextUrl.searchParams;
  let saved: { state: string; nonce: string; next: string | null } | null = null;
  try {
    saved = JSON.parse(request.cookies.get('dt_oidc')?.value ?? 'null');
  } catch {
    saved = null;
  }
  if (!saved || !params.get('state') || params.get('state') !== saved.state) return fail('state');
  const code = params.get('code');
  if (!code) return fail('denied');

  const base = appUrl(request.nextUrl.origin);
  const tokenRes = await fetch('https://slack.com/api/openid.connect.token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID ?? '',
      client_secret: process.env.SLACK_CLIENT_SECRET ?? '',
      redirect_uri: `${base}/api/auth/slack/callback`,
    }),
  });
  const token = (await tokenRes.json()) as { ok: boolean; access_token?: string };
  if (!token.ok || !token.access_token) return fail('token');
  // The access token came straight from Slack's token endpoint over TLS, so userInfo is
  // authoritative for who this is (OIDC Core §3.1.3.7 permits skipping ID-token checks here).
  const infoRes = await fetch('https://slack.com/api/openid.connect.userInfo', { headers: { authorization: `Bearer ${token.access_token}` } });
  const info = (await infoRes.json()) as UserInfo;
  if (!info.ok || !info.sub) return fail('userinfo');

  const db = await getDb();
  const linked = await membersForSlackUser(db, info.sub);
  const nowSec = Math.floor(Date.now() / 1000);
  const res = NextResponse.redirect(new URL(saved.next ?? (linked.length ? '/app' : '/onboarding'), base));
  res.cookies.delete('dt_oidc');
  // Always keep a short-lived identity, so an invite link can attach this person to another org.
  res.cookies.set(
    IDENTITY_COOKIE,
    encodeIdentity({ provider: 'slack', subject: info.sub, name: info.name ?? 'Slack user', email: info.email ?? null, slackTeamId: info['https://slack.com/team_id'] ?? null, issuedAt: nowSec }),
    cookieOptions(IDENTITY_MAX_AGE),
  );
  if (linked.length) {
    const m = linked[0]!;
    res.cookies.set(SESSION_COOKIE, encodeSession({ memberId: m.id, orgId: m.orgId, issuedAt: nowSec }), cookieOptions(SESSION_MAX_AGE_SEC));
  }
  return res;
}
