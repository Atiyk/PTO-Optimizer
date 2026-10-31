import { getDb } from '@/db/client';
import { defer } from '@/server/defer';
import { firstReceipt } from '@/slack/handlers';
import type { Activity } from '@/msteams/actor';
import { processActivity } from '@/msteams/handlers';
import { verifyConnectorToken } from '@/msteams/jwt';

export const dynamic = 'force-dynamic';

/**
 * Microsoft Teams bot messaging endpoint (set it as the Azure Bot's "Messaging endpoint").
 * Verifies the Bot Connector's signed token, acks with 200 at once, and replies through the
 * Bot Connector REST API after the response. Retries of the same activity are handled once.
 */
export async function POST(req: Request) {
  let activity: Activity;
  try {
    activity = (await req.json()) as Activity;
  } catch {
    return new Response('Bad payload', { status: 400 });
  }
  const v = await verifyConnectorToken(req.headers.get('authorization'), activity);
  if (!v.ok) return new Response(v.reason, { status: v.status });
  const db = await getDb();
  if (activity.id && !(await firstReceipt(db, `teams:${activity.conversation?.id ?? ''}:${activity.id}`))) return new Response(null, { status: 200 });
  const now = new Date();
  defer(() => processActivity(db, activity, now));
  return new Response(null, { status: 200 });
}
