import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { apiTokens, drafts, rateCounters, webhookDeliveries } from '@/db/schema';

/** Prunes rows that only matter for a short time. Run daily by the cron route. */
export async function housekeeping(db: Db, now: Date) {
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const ninetyDays = new Date(now.getTime() - 90 * 86_400_000);
  const rate = await db.delete(rateCounters).where(lt(rateCounters.windowStart, hourAgo)).returning({ k: rateCounters.key });
  // OAuth access tokens are useless a day after expiry; keys and personal tokens stay for the audit trail.
  const access = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.kind, 'access'), isNotNull(apiTokens.expiresAt), lt(apiTokens.expiresAt, dayAgo)))
    .returning({ id: apiTokens.id });
  const expired = await db
    .update(drafts)
    .set({ status: 'expired' })
    .where(and(eq(drafts.status, 'open'), lt(drafts.expiresAt, now)))
    .returning({ id: drafts.id });
  const deliveries = await db.delete(webhookDeliveries).where(lt(webhookDeliveries.createdAt, ninetyDays)).returning({ id: webhookDeliveries.id });
  return { rateWindows: rate.length, accessTokens: access.length, draftsExpired: expired.length, deliveries: deliveries.length };
}
