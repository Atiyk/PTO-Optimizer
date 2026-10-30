import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { btnPrimary, btnSecondary } from '@/components/ui';
import { CapabilityError } from '@/capabilities/errors';
import { PRODUCT_NAME } from '@/lib/brand';
import { cookieOptions, decodeIdentity, devLoginEnabled, encodeSession, IDENTITY_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from '@/lib/session';
import { acceptInvite } from '@/server/bootstrap';

async function join(formData: FormData) {
  'use server';
  const token = String(formData.get('token'));
  const jar = await cookies();
  const identity = decodeIdentity(jar.get(IDENTITY_COOKIE)?.value);
  if (!identity) redirect(`/signin?next=/join/${encodeURIComponent(token)}`);
  const db = await getDb();
  try {
    const m = await acceptInvite(db, token, identity, new Date());
    jar.set(SESSION_COOKIE, encodeSession({ memberId: m.id, orgId: m.orgId, issuedAt: Math.floor(Date.now() / 1000) }), cookieOptions(SESSION_MAX_AGE_SEC));
  } catch (e) {
    if (e instanceof CapabilityError) redirect(`/join/${encodeURIComponent(token)}?error=1`);
    throw e;
  }
  redirect('/app');
}

export default async function Join({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const identity = decodeIdentity((await cookies()).get(IDENTITY_COOKIE)?.value);
  const next = `/join/${encodeURIComponent(token)}`;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold text-ink">Join your team on {PRODUCT_NAME}</h1>
      {error && <p role="alert" className="mt-3 text-sm text-ink">This invite link is invalid, used up or expired. Ask your admin for a new one.</p>}
      {identity ? (
        <form action={join} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-muted">Joining as {identity.name}.</p>
          <button className={`${btnPrimary} mt-4 w-full`}>Join</button>
        </form>
      ) : (
        <>
          <a href={`/api/auth/slack/start?next=${encodeURIComponent(next)}`} className={`${btnPrimary} mt-6 w-full`}>Sign in with Slack to join</a>
          {devLoginEnabled() && <Link href={`/dev/login?next=${encodeURIComponent(next)}`} className={`${btnSecondary} mt-3 w-full`}>Dev login</Link>}
        </>
      )}
    </main>
  );
}
