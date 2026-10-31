import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/db/client';
import { advanceWaves } from '@/domain/coverFlow';
import { advanceEscalations } from '@/domain/escalation';

/*
 * Sends the next wave of cover offers where the wait has passed. Waves also advance on
 * every cover read and decline, so this is only a backstop. Vercel Hobby crons run at most
 * daily, so a frequent schedule must come from elsewhere (see PROGRESS, Questions: Q6).
 * Also sends approval reminders and escalations (src/domain/escalation.ts), which need the
 * same frequent schedule to be timely.
 * Auth: `Authorization: Bearer $CRON_SECRET`.
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
  const waves = await advanceWaves(db, null, now);
  const escalations = (await advanceEscalations(db, null, now)).length;
  return Response.json({ waves, escalations });
}
