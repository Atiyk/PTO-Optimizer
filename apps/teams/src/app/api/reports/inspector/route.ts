import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { invokeCapability } from '@/capabilities/registry';
import { CapabilityError } from '@/capabilities/errors';
import { humanActorFromSession } from '@/lib/actor';
import { SESSION_COOKIE } from '@/lib/session';

const FILES = ['ratio-checks', 'gaps', 'audit'] as const;

/**
 * Inspector export as CSV, straight from getInspectorReport (same permissions, same numbers,
 * audited there): ?location=<site id>&from=YYYY-MM-DD&to=YYYY-MM-DD&file=ratio-checks|gaps|audit.
 * Each file starts with a "Not legal advice" line.
 */
export async function GET(request: NextRequest) {
  const db = await getDb();
  const actor = await humanActorFromSession(db, request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const q = request.nextUrl.searchParams;
  const file = (FILES as readonly string[]).includes(q.get('file') ?? '') ? (q.get('file') as (typeof FILES)[number]) : 'ratio-checks';
  try {
    const r = await invokeCapability('getInspectorReport', { db, actor, now: new Date() }, { locationId: q.get('location') ?? '', from: q.get('from') ?? '', to: q.get('to') ?? '' });
    const body = `"${r.site.name.replace(/"/g, '""')}, ${r.from} to ${r.to}. Generated ${r.generatedAt}. ${r.notice.replace(/"/g, '""')}"\n${r.files[`${file}.csv`] ?? ''}`;
    return new NextResponse(body, {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="inspector-${file}-${r.from}-to-${r.to}.csv"`, 'cache-control': 'no-store' },
    });
  } catch (e) {
    if (e instanceof CapabilityError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
