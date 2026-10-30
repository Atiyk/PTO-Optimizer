import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COUNTRIES } from '@daysoff/engine/data/countries';
import { getDb } from '@/db/client';
import { btnPrimary, input, label } from '@/components/ui';
import { PRODUCT_NAME } from '@/lib/brand';
import { cookieOptions, decodeIdentity, encodeSession, IDENTITY_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_SEC } from '@/lib/session';
import { createOrganization } from '@/server/bootstrap';

async function create(formData: FormData) {
  'use server';
  const jar = await cookies();
  const identity = decodeIdentity(jar.get(IDENTITY_COOKIE)?.value);
  if (!identity) redirect('/signin');
  const orgName = String(formData.get('orgName') ?? '').trim().slice(0, 120);
  const countryCode = String(formData.get('countryCode') ?? '');
  if (!orgName || !COUNTRIES.some((c) => c.code === countryCode)) redirect('/onboarding?error=1');
  const db = await getDb();
  const { owner, org } = await createOrganization(db, identity, {
    orgName,
    countryCode,
    subdivisionCode: String(formData.get('subdivisionCode') ?? '').trim() || null,
    teamName: String(formData.get('teamName') ?? '').trim() || undefined,
    today: new Date().toISOString().slice(0, 10),
  });
  jar.set(SESSION_COOKIE, encodeSession({ memberId: owner.id, orgId: org.id, issuedAt: Math.floor(Date.now() / 1000) }), cookieOptions(SESSION_MAX_AGE_SEC));
  redirect('/app/admin?welcome=1');
}

export const dynamic = 'force-dynamic';

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const identity = decodeIdentity((await cookies()).get(IDENTITY_COOKIE)?.value);
  if (!identity) redirect('/signin?next=/onboarding');
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold text-ink">Set up {PRODUCT_NAME}</h1>
      <p className="mt-2 text-sm text-muted">
        Hi {identity.name}. Name your workspace and pick where your team is based; public holidays come from that country. You can add more
        locations, teams and policies afterwards.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-ink">Please enter a name and pick a country.</p>}
      <form action={create} className="mt-6 space-y-4">
        <div>
          <label className={label} htmlFor="orgName">Company or team name</label>
          <input id="orgName" name="orgName" required maxLength={120} className={`${input} mt-1`} placeholder="Acme Ltd" />
        </div>
        <div>
          <label className={label} htmlFor="countryCode">Country</label>
          <select id="countryCode" name="countryCode" defaultValue="US" className={`${input} mt-1`}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="subdivisionCode">State or region code <span className="font-normal text-muted">(optional, e.g. US-CA, GB-SCT)</span></label>
          <input id="subdivisionCode" name="subdivisionCode" maxLength={10} className={`${input} mt-1`} />
        </div>
        <div>
          <label className={label} htmlFor="teamName">First team <span className="font-normal text-muted">(optional)</span></label>
          <input id="teamName" name="teamName" maxLength={120} className={`${input} mt-1`} placeholder="Team" />
        </div>
        <p className="text-sm text-muted">Starts with: Vacation (20 days a year, up to 5 carry over), Sick (tracked, no balance, no notes stored), Personal and Unpaid.</p>
        <button className={`${btnPrimary} w-full`}>Create workspace</button>
      </form>
    </main>
  );
}
