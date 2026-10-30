import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { slackInstallations, slackStatusGrants } from '@/db/schema';
import { humanActorFromSession } from '@/lib/actor';
import { appUrl } from '@/lib/appUrl';
import { sealSecret } from '@/lib/secretBox';
import { SESSION_COOKIE } from '@/lib/session';
import { writeAudit } from '@/capabilities/registry';
import { slackOAuthAccess } from '@/slack/api';
import { STATE_COOKIE } from '@/slack/config';

/** Slack OAuth callback for both installs and status permission. The signed-in session decides who and which org. */
export async function GET(request: NextRequest) {
  const back = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };
  let saved: { state: string; kind: 'workspace' | 'status' } | null = null;
  try {
    saved = JSON.parse(request.cookies.get(STATE_COOKIE)?.value ?? 'null');
  } catch {
    saved = null;
  }
  const p = request.nextUrl.searchParams;
  if (!saved || p.get('state') !== saved.state) return back('/app?slack=expired');
  const code = p.get('code');
  if (!code) return back('/app?slack=cancelled');
  const db = await getDb();
  const actor = await humanActorFromSession(db, request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) return back('/signin');
  let data: Record<string, any>;
  try {
    data = await slackOAuthAccess(code, `${appUrl(request.nextUrl.origin)}/api/slack/oauth`);
  } catch {
    return back('/app?slack=failed');
  }
  const now = new Date();
  const ctx = { db, actor, now };
  if (saved.kind === 'workspace') {
    if (actor.role !== 'owner' && actor.role !== 'admin') return back('/app?slack=admins_only');
    const values = {
      orgId: actor.orgId,
      teamId: String(data.team?.id ?? ''),
      teamName: data.team?.name ?? null,
      botUserId: String(data.bot_user_id ?? ''),
      botToken: sealSecret(String(data.access_token ?? '')),
      scopes: String(data.scope ?? '').split(',').filter(Boolean),
      installedByMemberId: actor.memberId,
    };
    try {
      await db.insert(slackInstallations).values(values).onConflictDoUpdate({ target: slackInstallations.orgId, set: values });
    } catch {
      return back('/app/admin/agents?slack=team_taken'); // that Slack workspace is linked to another org
    }
    await writeAudit(ctx, { name: 'slackInstall', effect: 'commit' }, 'ok', `Installed the Slack app in ${values.teamName ?? values.teamId}`);
    return back('/app/admin/agents?slack=installed');
  }
  const userToken = data.authed_user?.access_token;
  if (!userToken) return back('/app/agents?slack=failed');
  const row = { orgId: actor.orgId, memberId: actor.memberId!, userToken: sealSecret(String(userToken)), lastRequestId: null };
  await db.insert(slackStatusGrants).values(row).onConflictDoUpdate({ target: slackStatusGrants.memberId, set: row });
  await writeAudit(ctx, { name: 'slackStatusGrant', effect: 'commit' }, 'ok', 'Allowed Slack status updates while out');
  return back('/app/agents?slack=status_on');
}
