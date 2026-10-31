import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { invokeCapability } from '@/capabilities/registry';
import { CapabilityError } from '@/capabilities/errors';
import { humanActorFromSession } from '@/lib/actor';
import { csvRow } from '@/lib/csv';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Absence report CSV, straight from getAbsenceReport (same permissions, same numbers): one row
 * per bucket (leave type, team, group, month). Health-related leave is one bucket.
 */
export async function GET(request: NextRequest) {
  const db = await getDb();
  const actor = await humanActorFromSession(db, request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const q = request.nextUrl.searchParams;
  try {
    const r = await invokeCapability('getAbsenceReport', { db, actor, now: new Date() }, {
      from: q.get('from') ?? '',
      to: q.get('to') ?? '',
      teamId: q.get('team') || undefined,
      groupId: q.get('group') || undefined,
    });
    const lines = [csvRow(['dimension', 'label', 'approved_days', 'requests'])];
    for (const [dim, rows] of [['leave_type', r.byType], ['team', r.byTeam], ['group', r.byGroup], ['month', r.byMonth]] as const) {
      for (const b of rows) lines.push(csvRow([dim, b.label, b.days, b.requests]));
    }
    lines.push(csvRow(['total', 'approved', r.totals.approvedDays, r.totals.requests]));
    lines.push(csvRow(['total', 'pending', r.totals.pendingDays, '']));
    return new NextResponse(`${lines.join('\r\n')}\r\n`, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="absence-${r.from}-to-${r.to}.csv"`, 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof CapabilityError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
