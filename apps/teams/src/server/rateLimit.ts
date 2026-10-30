import { sql } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { rateCounters } from '@/db/schema';
import { CapabilityError } from '@/capabilities/errors';
import type { RateLimitClass } from '@/capabilities/types';

/** Requests per minute per token, by capability class. Override with RATE_LIMIT_<CLASS>. */
const DEFAULT_PER_MINUTE: Record<RateLimitClass | 'auth', number> = { read: 120, write: 30, ai: 10, planner: 10, auth: 20 };

export function limitFor(cls: RateLimitClass | 'auth'): number {
  const v = Number(process.env[`RATE_LIMIT_${cls.toUpperCase()}`]);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_PER_MINUTE[cls];
}

/**
 * Fixed one-minute window counter in the database, so the limit holds across serverless
 * instances. One upsert per call; throws rate_limited with the retry time.
 */
export async function consumeRate(db: Db, subject: string, cls: RateLimitClass | 'auth', now: Date): Promise<void> {
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const key = `${subject}:${cls}`;
  const [row] = await db
    .insert(rateCounters)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateCounters.key,
      set: {
        count: sql`case when ${rateCounters.windowStart} = ${windowStart.toISOString()}::timestamptz then ${rateCounters.count} + 1 else 1 end`,
        windowStart,
      },
    })
    .returning({ count: rateCounters.count });
  if ((row?.count ?? 0) > limitFor(cls)) {
    const retry = Math.ceil((windowStart.getTime() + 60_000 - now.getTime()) / 1000);
    throw new CapabilityError('rate_limited', `Too many ${cls} requests for this token. Retry in ${retry} s.`, { retryAfterSeconds: retry });
  }
}
