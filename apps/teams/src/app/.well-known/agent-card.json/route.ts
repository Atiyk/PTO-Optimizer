import { a2aEnabled, agentCard } from '@/server/discovery';
import { appUrl } from '@/lib/appUrl';

export const dynamic = 'force-dynamic';

/** A2A Agent Card, behind the A2A_ENABLED flag (off by default). */
export function GET(req: Request) {
  if (!a2aEnabled()) return Response.json({ error: 'Not found.' }, { status: 404 });
  return Response.json(agentCard(appUrl(new URL(req.url).origin)), { headers: { 'cache-control': 'public, max-age=3600' } });
}
