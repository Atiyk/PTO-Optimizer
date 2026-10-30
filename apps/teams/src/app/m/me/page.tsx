import { CoverPrefs } from '@/components/mobile/CoverPrefs';
import { AddPasskey } from '@/components/mobile/Passkeys';
import { PushToggle } from '@/components/mobile/PushToggle';
import { Shell } from '@/components/mobile/Shell';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { call, requireActor } from '@/server/page';
import { smsChannel } from '@/server/messaging';

const BAND = { expired: 'Expired', '7': 'Expires within 7 days', '14': 'Expires within 14 days', '30': 'Expires within 30 days' } as const;

/** Your sign-in (passkeys), notifications, cover preferences and your own credentials. */
export default async function StaffMe() {
  const actor = await requireActor('/m/signin');
  const org = await getOrg(await getDb(), actor.orgId);
  const prefs = await call('setMyCoverPrefs', {}, actor);
  const { records } = await call('getCredentials', {}, actor).catch(() => ({ records: [] as never[] }));

  return (
    <Shell title="Me" org={org.name} active="/m/me">
      <section aria-labelledby="signin" className="space-y-2 rounded-lg border border-line bg-page p-4">
        <h2 id="signin" className="text-base font-semibold text-ink">
          Sign-in
        </h2>
        <AddPasskey count={prefs.passkeyCount} />
      </section>
      <section aria-labelledby="notify" className="space-y-2 rounded-lg border border-line bg-page p-4">
        <h2 id="notify" className="text-base font-semibold text-ink">
          Notifications
        </h2>
        <PushToggle vapidKey={process.env.VAPID_PUBLIC_KEY ?? null} />
      </section>
      <section aria-labelledby="cover" className="space-y-2 rounded-lg border border-line bg-page p-4">
        <h2 id="cover" className="text-base font-semibold text-ink">
          Covering shifts
        </h2>
        <CoverPrefs optIn={prefs.optIn} smsAvailable={smsChannel() !== null} smsOptIn={prefs.smsOptIn} smsPhoneSet={prefs.smsPhoneSet} />
      </section>
      {records.length > 0 && (
        <section aria-labelledby="creds" className="space-y-2 rounded-lg border border-line bg-page p-4">
          <h2 id="creds" className="text-base font-semibold text-ink">
            Your certifications
          </h2>
          <ul className="space-y-2">
            {records.map((r) => (
              <li key={r.id} className="text-sm text-ink">
                <span className="font-medium">{r.name}</span>
                <span className="block text-muted">
                  {r.expiresOn ? `Expires ${r.expiresOn}` : 'No expiry date'}
                  {r.band && ` · ${BAND[r.band]}`}
                  {!r.verified && ' · not yet verified'}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Renewed one? Show the new card to your manager so they can update it.</p>
        </section>
      )}
      <form action="/api/auth/signout?to=m" method="post">
        <button className="min-h-12 w-full rounded-md border border-line bg-page text-base text-ink">Sign out</button>
      </form>
    </Shell>
  );
}
