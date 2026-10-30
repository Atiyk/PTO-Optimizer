import Link from 'next/link';
import { ActionButton } from '@/components/ActionButton';
import { CapabilityForm } from '@/components/CapabilityForm';
import { RuleDraft } from '@/components/RuleDraft';
import { Badge, Card } from '@/components/ui';
import { WeekRowsEditor } from '@/components/WeekRowsEditor';
import { call, requireActor } from '@/server/page';

/*
 * Coverage setup, in the order a centre director does it: pick the state's rules per site,
 * add rooms, set how many children each room expects, then who works where.
 */
export default async function CoverageSetup() {
  const actor = await requireActor();
  const s = await call('getCoverageSetup', {}, actor);
  const members = await call('listMembers', {}, actor);
  const packs = await call('listRulePacks', {}, actor);
  const packByKey = new Map(packs.packs.map((p) => [p.key, p.pack as PackView]));
  // The org's own packs (drafted from text or edited), latest version of each key.
  const ownPacks = [...new Map(packs.packs.filter((p) => p.source !== 'seed').sort((a, b) => a.version - b.version).map((p) => [p.key, { key: p.key, version: p.version, name: (p.pack as { name: string }).name }])).values()];
  const allRooms = s.sites.flatMap((x) => x.rooms.map((r) => ({ value: r.id, label: `${r.name} (${x.name})` })));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Four steps: rules for each site, rooms, children expected, then staff schedules. Credentials are on the{' '}
        <Link className="text-accent underline" href="/app/admin/credentials">Credentials</Link> page; you can also import schedules and credentials from a{' '}
        <Link className="text-accent underline" href="/app/admin/import">CSV</Link>. Rules shown here are not legal advice: check them with your licensing agency.
      </p>

      {s.sites.map((site) => {
        const active = site.packs.filter((p) => !p.effectiveTo || p.effectiveTo >= today);
        const groupOpts = site.groups.map((g) => ({ value: g.key, label: g.label }));
        return (
          <Card key={site.id} title={`${site.name}`} actions={<Badge>{site.timezone}</Badge>}>
            <h3 className="text-sm font-semibold text-ink">1. Rules</h3>
            {active.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No rule pack yet.</p>
            ) : (
              <ul className="mt-1 space-y-2 text-sm">
                {active.map((p) => (
                  <li key={`${p.key}-${p.version}`}>
                    <details className="rounded-md border border-line p-2">
                      <summary className="cursor-pointer font-medium text-ink">
                        {p.name} <span className="font-normal text-muted">v{p.version}, from {p.effectiveFrom}</span>
                      </summary>
                      <PackRules pack={packByKey.get(p.key)} />
                    </details>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2">
              <CapabilityForm
                capability="manageSchedule"
                fixed={{ op: 'selectRulePack', locationId: site.id }}
                fields={[
                  {
                    name: 'packKey',
                    label: 'Rule pack',
                    type: 'select',
                    options: [...s.seedPacks.map((p) => ({ value: p.key, label: `${p.name} (${p.jurisdiction})` })), ...ownPacks.map((p) => ({ value: p.key, label: `${p.name} (yours, v${p.version})` }))],
                  },
                  {
                    name: 'sickPolicy',
                    label: 'Sick leave (labour packs)',
                    type: 'select',
                    options: [
                      { value: 'accrue', label: 'Accrue per hours worked' },
                      { value: 'frontload', label: 'Front-load at the start of the year' },
                      { value: 'none', label: 'Do not create a sick policy' },
                    ],
                  },
                  { name: 'effectiveFrom', label: 'From', type: 'date', defaultValue: today },
                ]}
                submitLabel="Use this pack"
              />
            </div>

            {site.timezone === 'UTC' && (
              <div className="mt-3 rounded-md border border-dashed border-ink p-2">
                <p className="text-sm text-ink">This site’s time zone is UTC. Set the local one so shifts and gaps line up with the clock on the wall.</p>
                <CapabilityForm
                  capability="manageSchedule"
                  fixed={{ op: 'setTimezone', locationId: site.id }}
                  fields={[{ name: 'timezone', label: 'Time zone', type: 'select', options: TIMEZONES.map((t) => ({ value: t, label: t })) }]}
                  submitLabel="Set time zone"
                />
              </div>
            )}

            <h3 className="mt-5 text-sm font-semibold text-ink">2. Rooms</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {site.rooms.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    {r.name} {r.groupKey && <Badge>{site.groups.find((g) => g.key === r.groupKey)?.label ?? r.groupKey}</Badge>}
                  </span>
                  <ActionButton capability="manageSchedule" input={{ op: 'archiveRoom', roomId: r.id }} confirm={`Archive ${r.name}? Its schedule stays in history.`}>
                    Archive
                  </ActionButton>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <CapabilityForm
                capability="manageSchedule"
                fixed={{ op: 'upsertRoom', locationId: site.id }}
                fields={[
                  { name: 'name', label: 'Room name', type: 'text', required: true, placeholder: 'Toddlers' },
                  { name: 'groupKey', label: 'Main age group', type: 'select', options: groupOpts, emptyLabel: 'Mixed or none' },
                ]}
                submitLabel="Add room"
              />
            </div>

            {site.rooms.length > 0 && groupOpts.length > 0 && (
              <>
                <h3 className="mt-5 text-sm font-semibold text-ink">3. Children expected (counts only, never names)</h3>
                <div className="mt-1 space-y-3">
                  {site.rooms.map((r) => (
                    <details key={r.id} className="rounded-md border border-line p-2" open={r.demand.length === 0}>
                      <summary className="cursor-pointer text-sm font-medium text-ink">
                        {r.name} <span className="font-normal text-muted">{r.demand.length ? `${r.demand.length} time slots a week` : 'not set'}</span>
                      </summary>
                      <div className="mt-2">
                        <WeekRowsEditor
                          capability="manageSchedule"
                          fixed={{ op: 'setDemand', roomId: r.id }}
                          extra={[
                            { name: 'group', label: 'Age group', type: 'select', options: r.groupKey ? [...groupOpts.filter((g) => g.value === r.groupKey), ...groupOpts.filter((g) => g.value !== r.groupKey)] : groupOpts },
                            { name: 'count', label: 'Children', type: 'number', min: 0 },
                          ]}
                          initial={r.demand}
                          saveLabel="Save children expected"
                        />
                      </div>
                    </details>
                  ))}
                </div>
              </>
            )}
          </Card>
        );
      })}

      <details className="rounded-lg border border-line bg-page p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Rules for another state, or your own policy? Draft them from text</summary>
        <div className="mt-3">
          <RuleDraft />
        </div>
      </details>

      {allRooms.length > 0 && (
        <Card title="4. Staff schedules">
          <div className="space-y-3">
            {members.members.map((m) => {
              const rows = s.shifts.filter((x) => x.memberId === m.id);
              return (
                <details key={m.id} className="rounded-md border border-line p-2">
                  <summary className="cursor-pointer text-sm font-medium text-ink">
                    {m.name} <span className="font-normal text-muted">{rows.length ? `${rows.length} shifts a week` : 'no schedule'}</span>
                  </summary>
                  <div className="mt-2">
                    <WeekRowsEditor
                      capability="manageSchedule"
                      fixed={{ op: 'setShifts', memberId: m.id }}
                      extra={[{ name: 'roomId', label: 'Room', type: 'select', options: allRooms }]}
                      initial={rows}
                      saveLabel="Save schedule"
                    />
                  </div>
                </details>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

const TIMEZONES = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'UTC'];

type PackView = {
  notes?: string[];
  rules: { id: string; label: string; basis: string; needsVerification?: boolean; citation?: { regulation: string; section: string; url: string; retrievedOn: string } }[];
};

function PackRules({ pack }: { pack: PackView | undefined }) {
  if (!pack) return null;
  return (
    <div className="mt-2 space-y-1 text-sm">
      <ul className="space-y-1">
        {pack.rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-ink">{r.label}</span>
            {r.citation ? (
              <a className="text-muted underline" href={r.citation.url} target="_blank" rel="noreferrer">
                {r.citation.regulation} {r.citation.section} (retrieved {r.citation.retrievedOn})
              </a>
            ) : (
              <span className="text-muted">{r.basis === 'org_policy' ? 'your policy' : ''}</span>
            )}
            {r.needsVerification && <Badge tone="warn">needs verification</Badge>}
          </li>
        ))}
      </ul>
      {pack.notes?.map((n) => <p key={n} className="text-xs text-muted">{n}</p>)}
    </div>
  );
}
