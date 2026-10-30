import { healthReport } from '@/server/health';

export const dynamic = 'force-dynamic';

/** Machine-readable setup status for uptime checks. 503 until the database is reachable and current. */
export async function GET() {
  const r = await healthReport();
  return Response.json(r, { status: r.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
