import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/db/client';
import { advanceWaves } from '@/domain/coverFlow';

/*
 * Sends the next wave of cover offers where the wait has passed. Waves also advance on
 * every cover read and decline, so this is only a backstop. Vercel Hobby crons run at most
 * daily, so a frequent schedule must come from elsewhere (see PROGRESS, Questions: Q6).
 * Auth: `Authorization: Bearer $CRON_SECRET`.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const want = process.env.CRON_SECRET;
  if (!want) return Response.json({ error: 'CRON_SECRET is not set.' }, { status: 503 });
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const exp = Buffer.from(`Bearer ${want}`);
  if (got.length !== exp.length || !timingSafeEqual(got, exp)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  const waves = await advanceWaves(await getDb(), null, new Date());
  return Response.json({ waves });
}
