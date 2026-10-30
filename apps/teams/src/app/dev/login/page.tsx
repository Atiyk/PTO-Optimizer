import { asc, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { members, organizations } from '@/db/schema';
import { btnPrimary, btnSecondary, Card, input, label } from '@/components/ui';
import { cookieOptions, devLoginEnabled, encodeIdentity, encodeSession, IDENTITY_COOKIE, IDENTITY_MAX_AGE, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from '@/lib/session';
import { seedDemoOrg } from '@/server/seed';

/* Dev-only sign-in for local work and tests. Disabled in production unless DEV_LOGIN=1. */

async function signInAs(formData: FormData) {
  'use server';
  if (!devLoginEnabled()) notFound();
  const db = await getDb();
  const [m] = await db.select().from(members).where(eq(members.id, String(formData.get('memberId'))));
  if (!m) notFound();
  (await cookies()).set(SESSION_COOKIE, encodeSession({ memberId: m.id, orgId: m.orgId, issuedAt: Math.floor(Date.now() / 1000) }), cookieOptions(SESSION_MAX_AGE_SEC));
  redirect('/app');
}

async function newIdentity(formData: FormData) {
  'use server';
  if (!devLoginEnabled()) notFound();
  const name = String(formData.get('name') || 'Dev User').slice(0, 80);
  (await cookies()).set(
    IDENTITY_COOKIE,
    encodeIdentity({ provider: 'dev', subject: `dev-${Date.now()}`, name, email: null, slackTeamId: null, issuedAt: Math.floor(Date.now() / 1000) }),
    cookieOptions(IDENTITY_MAX_AGE),
  );
  redirect(String(formData.get('next') || '/onboarding'));
}

async function seed() {
  'use server';
  if (!devLoginEnabled()) notFound();
  const db = await getDb();
  const { ownerId, org } = await seedDemoOrg(db, new Date().toISOString().slice(0, 10));
  (await cookies()).set(SESSION_COOKIE, encodeSession({ memberId: ownerId, orgId: org.id, issuedAt: Math.floor(Date.now() / 1000) }), cookieOptions(SESSION_MAX_AGE_SEC));
  redirect('/app');
}

export const dynamic = 'force-dynamic';

export default async function DevLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!devLoginEnabled()) notFound();
  const { next } = await searchParams;
  const db = await getDb();
  const orgs = await db.select().from(organizations).orderBy(asc(organizations.createdAt));
  const ms = await db.select().from(members).where(isNull(members.deletedAt)).orderBy(asc(members.name));
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <h1 className="text-2xl font-semibold text-ink">Dev login</h1>
      <p className="text-sm text-muted">Local development only. Production uses Sign in with Slack.</p>
      <Card title="Start fresh">
        <form action={newIdentity} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="next" value={next?.startsWith('/') ? next : '/onboarding'} />
          <div className="min-w-48 flex-1">
            <label className={label} htmlFor="name">Your name</label>
            <input id="name" name="name" className={`${input} mt-1`} defaultValue="Dev User" />
          </div>
          <button className={btnPrimary}>Continue as new person</button>
        </form>
        <form action={seed} className="mt-3">
          <button className={btnSecondary}>Create the 25-person demo org</button>
        </form>
      </Card>
      {orgs.map((o) => (
        <Card key={o.id} title={o.name}>
          <ul className="divide-y divide-line">
            {ms
              .filter((m) => m.orgId === o.id)
              .map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    {m.name} <span className="text-muted">· {m.role}</span>
                  </span>
                  <form action={signInAs}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <button className={btnSecondary}>Sign in</button>
                  </form>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </main>
  );
}
