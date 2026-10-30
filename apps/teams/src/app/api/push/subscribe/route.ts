import { and, eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { pushSubscriptions } from '@/db/schema';
import { humanActorFromSession } from '@/lib/actor';
import { sameOrigin } from '@/lib/sameOrigin';
import { SESSION_COOKIE } from '@/lib/session';

/** Save (POST) or remove (DELETE) this device's Web Push subscription for cover offers. */
export async function POST(request: NextRequest) {
  return handle(request, 'save');
}
export async function DELETE(request: NextRequest) {
  return handle(request, 'remove');
}

async function handle(request: NextRequest, op: 'save' | 'remove') {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 });
  const db = await getDb();
  const actor = await humanActorFromSession(db, request.cookies.get(SESSION_COOKIE)?.value);
  if (!actor?.memberId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof body.endpoint === 'string' && /^https:\/\//.test(body.endpoint) ? body.endpoint.slice(0, 1000) : null;
  if (!endpoint) return NextResponse.json({ error: 'Bad subscription.' }, { status: 400 });
  if (op === 'remove') {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.orgId, actor.orgId), eq(pushSubscriptions.memberId, actor.memberId), eq(pushSubscriptions.endpoint, endpoint)));
    return NextResponse.json({ ok: true });
  }
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh.slice(0, 200) : null;
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth.slice(0, 100) : null;
  if (!p256dh || !auth) return NextResponse.json({ error: 'Bad subscription.' }, { status: 400 });
  await db
    .insert(pushSubscriptions)
    .values({ orgId: actor.orgId, memberId: actor.memberId, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { orgId: actor.orgId, memberId: actor.memberId, p256dh, auth } });
  return NextResponse.json({ ok: true });
}
