import { getDb } from '@/db/client';
import { defer } from '@/server/defer';
import { firstReceipt, processInteraction, type BlockActions } from '@/slack/handlers';
import { verifySlackSignature } from '@/slack/verify';

export const dynamic = 'force-dynamic';

/** Button clicks. Ack with an empty 200, then update the message via response_url. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlackSignature(raw, req.headers, process.env.SLACK_SIGNING_SECRET)) return new Response('Invalid signature', { status: 401 });
  let payload: BlockActions & { trigger_id?: string; container?: { message_ts?: string } };
  try {
    payload = JSON.parse(new URLSearchParams(raw).get('payload') ?? '');
  } catch {
    return new Response('Bad payload', { status: 400 });
  }
  if (payload.type !== 'block_actions') return new Response(null, { status: 200 });
  const db = await getDb();
  // A double click delivers the same action twice; handle it once.
  const key = `ia:${payload.team?.id}:${payload.user?.id}:${payload.container?.message_ts ?? ''}:${payload.actions?.[0]?.action_id}:${payload.actions?.[0]?.value ?? ''}`;
  if (!(await firstReceipt(db, key))) return new Response(null, { status: 200 });
  const now = new Date();
  defer(() => processInteraction(db, payload, now));
  return new Response(null, { status: 200 });
}
