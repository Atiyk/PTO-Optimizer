import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { invokeCapability } from '@/capabilities/registry';
import { CapabilityError } from '@/capabilities/errors';
import { humanActorFromSession } from '@/lib/actor';
import { csvRow } from '@/lib/csv';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Payroll CSV for one workweek: hours by band per person per day, straight from
 * getTimesheets (same permissions). Hours only: no pay rates, no amounts.
 */
export async function GET(request: NextRequest) {
  const db = await getDb();
  const actor = await humanActorFromSession(db, request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const week = request.nextUrl.searchParams.get('week');
  try {
    const ts = await invokeCapability('getTimesheets', { db, actor, now: new Date() }, week ? { week } : {});
    const lines = [csvRow(['member_id', 'name', 'date', 'hours', 'regular_hours', 'overtime_hours', 'overtime_multiplier', 'double_time_hours', 'double_time_multiplier', 'approved'])];
    for (const p of ts.people) {
      for (const d of p.days) {
        if (!d.hours) continue;
        lines.push(csvRow([p.memberId, p.name?.untrusted_text ?? '', d.date, d.hours, d.regular, d.overtime, p.bands.multiplier, d.doubleTime, p.bands.doubleTimeMultiplier, p.approval && !p.approval.stale ? 'yes' : 'no']));
      }
    }
    return new NextResponse(`${lines.join('\r\n')}\r\n`, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="timesheets-${ts.weekStart}.csv"`, 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof CapabilityError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
