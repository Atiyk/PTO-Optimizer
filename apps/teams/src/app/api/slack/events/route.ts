import { getDb } from '@/db/client';
import { defer } from '@/server/defer';
import { firstReceipt, processEvent, type EventCallback } from '@/slack/handlers';
import { verifySlackSignature } from '@/slack/verify';

export const dynamic = 'force-dynamic';

/** Events API: URL check, DMs to the bot, uninstalls. Retries (X-Slack-Retry-Num) are deduped by event_id. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlackSignature(raw, req.headers, process.env.SLACK_SIGNING_SECRET)) return new Response('Invalid signature', { status: 401 });
  let body: { type: string; challenge?: string; event_id?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  if (body.type === 'url_verification') return Response.json({ challenge: body.challenge });
  if (body.type !== 'event_callback' || !body.event_id) return new Response(null, { status: 200 });
  const event = body as unknown as EventCallback;
  const db = await getDb();
  if (!(await firstReceipt(db, `ev:${body.event_id}`))) return new Response(null, { status: 200 });
  const now = new Date();
  defer(() => processEvent(db, event, now));
  return new Response(null, { status: 200 });
}
