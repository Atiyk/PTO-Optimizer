import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { invokeCapability } from '@/capabilities/registry';
import { CapabilityError } from '@/capabilities/errors';
import { humanActorFromSession } from '@/lib/actor';
import { SESSION_COOKIE } from '@/lib/session';

const SORTS = ['name', 'payable', 'amount', 'forfeit'] as const;

/**
 * PTO payout liability as CSV, straight from getPayoutLiability (owners and admins only, the
 * same numbers as the page, audited there): ?type=<leave type key>&sort=name|payable|amount|forfeit.
 * The file starts with the "Estimate … Not legal advice." line and never contains a pay rate.
 */
export async function GET(request: NextRequest) {
  const db = await getDb();
  const actor = await humanActorFromSession(db, request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const q = request.nextUrl.searchParams;
  const sort = (SORTS as readonly string[]).includes(q.get('sort') ?? '') ? (q.get('sort') as (typeof SORTS)[number]) : 'payable';
  try {
    const r = await invokeCapability('getPayoutLiability', { db, actor, now: new Date() }, { leaveType: q.get('type') || 'vacation', sort, format: 'csv' });
    return new NextResponse(r.csv ?? '', {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="payout-${r.leaveType}.csv"`, 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof CapabilityError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
