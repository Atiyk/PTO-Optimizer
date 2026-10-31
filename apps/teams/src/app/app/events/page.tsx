import { ActionButton } from '@/components/ActionButton';
import { CapabilityForm } from '@/components/CapabilityForm';
import { Badge, btnPrimary, Card, formatRange, input, label } from '@/components/ui';
import { call, requireActor } from '@/server/page';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Team events, and the best dates for a new one (fewest people on leave, off or on a holiday). */
export default async function Events({ searchParams }: { searchParams: Promise<{ sfrom?: string; sto?: string; steam?: string; sgroup?: string }> }) {
  const actor = await requireActor();
  const manager = actor.role !== 'employee';
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const setup = await call('getOrgSetup', {}, actor);
  const sfrom = sp.sfrom && ISO.test(sp.sfrom) ? sp.sfrom : addDays(today, 1);
  const sto = sp.sto && ISO.test(sp.sto) ? sp.sto : addDays(sfrom, 13);
  const steam = setup.teams.some((t) => t.id === sp.steam) ? sp.steam : undefined;
  const sgroup = setup.groups.some((g) => g.id === sp.sgroup) ? sp.sgroup : undefined;
  const asked = manager && (sp.sfrom || sp.sto || sp.steam || sp.sgroup);
  let suggestions: { date: string; available: number; out: number; reasons: { leave: number; notWorking: number; holiday: number } }[] | null = null;
  let suggestError: string | null = null;
  let events: Awaited<ReturnType<typeof call<'getTeamEvents'>>>['events'] = [];
  try {
    const r = await call('getTeamEvents', { from: today, to: addDays(today, 180), ...(asked ? { suggest: { from: sfrom, to: sto, teamIds: steam ? [steam] : [], groupIds: sgroup ? [sgroup] : [] } } : {}) }, actor);
    events = r.events;
    suggestions = r.suggestions;
  } catch (e) {
    suggestError = e instanceof Error ? e.message : 'Could not look for dates.';
    events = (await call('getTeamEvents', { from: today, to: addDays(today, 180) }, actor)).events;
  }
  const teamName = new Map(setup.teams.map((t) => [t.id, t.name]));
  const groupName = new Map(setup.groups.map((g) => [g.id, g.name]));
  const siteName = new Map(setup.locations.map((l) => [l.id, l.name]));
  const audienceText = (e: (typeof events)[number]) =>
    [e.locationId ? siteName.get(e.locationId) : null, ...e.teamIds.map((t) => teamName.get(t)), ...e.groupIds.map((g) => groupName.get(g))].filter(Boolean).join(', ') || 'Everyone';

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <h1 className="text-xl font-semibold text-ink">Team events</h1>
        <Card title={`Coming up (${events.length})`}>
          {events.length === 0 ? <p className="text-sm text-muted">No events in the next six months.</p> : (
            <ul className="divide-y divide-line">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium text-ink">{e.title.untrusted_text}</span>
                    {e.includesMe && <> <Badge tone="accent">You</Badge></>}
                    <span className="block text-muted">
                      {formatRange(e.date, e.date)}{e.start ? `, ${e.start}–${e.end}` : ''} · {audienceText(e)} · {e.expected - e.away} of {e.expected} can make it
                    </span>
                  </span>
                  {manager && <ActionButton capability="manageTeamEvents" input={{ op: 'delete', eventId: e.id }} confirm="Delete this event?">Delete</ActionButton>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {manager && (
          <Card title="Add an event">
            <CapabilityForm
              capability="manageTeamEvents"
              fixed={{ op: 'create' }}
              submitLabel="Add event"
              onDoneMessage="Added. People with leave that day will see it when they request."
              fields={[
                { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Staff meeting' },
                { name: 'date', label: 'Date', type: 'date', required: true },
                { name: 'start', label: 'Starts (optional)', type: 'text', placeholder: '09:00' },
                { name: 'end', label: 'Ends (optional)', type: 'text', placeholder: '10:00' },
                { name: 'locationId', label: 'Site', type: 'select', emptyLabel: 'Every site', options: setup.locations.map((l) => ({ value: l.id, label: l.name })) },
                { name: 'teamIds', label: 'For teams', type: 'multiselect', hint: 'None ticked = everyone.', options: setup.teams.map((t) => ({ value: t.id, label: t.name })) },
                { name: 'groupIds', label: 'For groups', type: 'multiselect', options: setup.groups.map((g) => ({ value: g.id, label: g.name })) },
              ]}
            />
          </Card>
        )}
      </div>
      {manager && (
        <div className="space-y-4 lg:col-span-2">
          <Card title="Find the best date">
            <form method="get" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="s-from">From</label>
                  <input id="s-from" name="sfrom" type="date" defaultValue={sfrom} className={`${input} mt-1`} />
                </div>
                <div>
                  <label className={label} htmlFor="s-to">To</label>
                  <input id="s-to" name="sto" type="date" defaultValue={sto} className={`${input} mt-1`} />
                </div>
              </div>
              <div>
                <label className={label} htmlFor="s-team">Team</label>
                <select id="s-team" name="steam" defaultValue={steam ?? ''} className={`${input} mt-1`}>
                  <option value="">Everyone</option>
                  {setup.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="s-group">Group</label>
                <select id="s-group" name="sgroup" defaultValue={sgroup ?? ''} className={`${input} mt-1`}>
                  <option value="">Any</option>
                  {setup.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <button className={btnPrimary}>Find dates</button>
            </form>
            {suggestError && <p role="alert" className="mt-3 text-sm text-ink">{suggestError}</p>}
            {suggestions && (
              <ol className="mt-3 space-y-2 text-sm">
                {suggestions.map((s, i) => (
                  <li key={s.date} className="rounded-md border border-line p-2">
                    <span className="font-medium text-ink">{i + 1}. {formatRange(s.date, s.date)}</span>
                    <span className="block text-muted">
                      {s.available} can make it{s.out ? ` · ${[s.reasons.leave && `${s.reasons.leave} on leave`, s.reasons.notWorking && `${s.reasons.notWorking} not working`, s.reasons.holiday && `${s.reasons.holiday} on a holiday`].filter(Boolean).join(', ')}` : ' · nobody away'}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
