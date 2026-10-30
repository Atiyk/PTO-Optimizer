import { getDb } from '@/db/client';
import { defer } from '@/server/defer';
import { processCommand } from '@/slack/handlers';
import { verifySlackSignature } from '@/slack/verify';

export const dynamic = 'force-dynamic';

/** `/daysoff …`: verify, ack at once (Slack allows 3 s), answer via response_url afterwards. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlackSignature(raw, req.headers, process.env.SLACK_SIGNING_SECRET)) return new Response('Invalid signature', { status: 401 });
  const f = new URLSearchParams(raw);
  const cmd = { team_id: f.get('team_id') ?? '', user_id: f.get('user_id') ?? '', text: f.get('text') ?? '', response_url: f.get('response_url') ?? '' };
  const db = await getDb();
  const now = new Date();
  defer(() => processCommand(db, cmd, now));
  return Response.json({ response_type: 'ephemeral', text: cmd.text.trim() && cmd.text.trim().toLowerCase() !== 'help' ? 'One moment…' : 'Working…' });
}
