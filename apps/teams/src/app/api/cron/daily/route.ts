import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { webhookEndpoints } from '@/db/schema';
import { housekeeping } from '@/server/housekeeping';
import { deliverDue, scanExpiringBalances } from '@/server/webhooks';

/*
 * Daily job (apps/teams/vercel.json): queue balance.expiring warnings, send any webhook
 * deliveries that are due, and prune short-lived rows. Vercel calls it with `Authorization: Bearer $CRON_SECRET`.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const want = process.env.CRON_SECRET;
  if (!want) return Response.json({ error: 'CRON_SECRET is not set.' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const exp = Buffer.from(`Bearer ${want}`);
  if (got.length !== exp.length || !timingSafeEqual(got, exp)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  const db = await getDb();
  const now = new Date();
  const orgs = await db.selectDistinct({ orgId: webhookEndpoints.orgId }).from(webhookEndpoints).where(eq(webhookEndpoints.active, true));
  let queued = 0;
  for (const { orgId } of orgs) queued += await scanExpiringBalances(db, orgId, now);
  const sent = { delivered: 0, failed: 0, retrying: 0 };
  // Bounded batches so one run cannot exceed the function time limit.
  for (let i = 0; i < 8; i++) {
    const r = await deliverDue(db, new Date(), { limit: 25 });
    sent.delivered += r.delivered;
    sent.failed += r.failed;
    sent.retrying += r.retrying;
    if (r.delivered + r.failed + r.retrying < 25) break;
  }
  // Housekeeping: old rate-limit windows, expired OAuth access tokens, stale drafts.
  const cleaned = await housekeeping(db, now);
  return Response.json({ queued, ...sent, cleaned });
}
