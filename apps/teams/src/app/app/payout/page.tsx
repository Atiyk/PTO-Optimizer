import Link from 'next/link';
import { redirect } from 'next/navigation';
import { payoutConflicts, statePayoutRule, type PayoutPolicy } from '@daysoff/engine/leave/payout';
import { CapabilityForm } from '@/components/CapabilityForm';
import { usd } from '@/components/PayoutLines';
import { SourceChip, type SourceChipSource } from '@/components/SourceChip';
import { Badge, btnSecondary, Card, fmt, Stat } from '@/components/ui';
import { describePayoutPolicy } from '@/domain/describePolicy';
import { call, requireActor } from '@/server/page';

/*
 * PTO payout (Gapless Phase 4), for managers and admins: the policy in plain words with the
 * state rules behind it, a per-person liability table (sortable; CSV for admins), and the
 * year-end forecast. Every number is the engine's via getPayoutLiability / getPayoutEstimate;
 * this page never sees a pay rate. Estimates only: the payroll provider pays.
 */

const SORTS = { name: 'Name', payable: 'If they left today', amount: 'Estimated amount', forfeit: 'Lost at year end' } as const;
type Sort = keyof typeof SORTS;

function stateSource(s: ReturnType<typeof statePayoutRule>): SourceChipSource | null {
  const c = s.citation;
  if (!c) return null;
  return { label: `${c.regulation.split(';')[0]} ${c.section.startsWith('§') ? c.section : ''}`.trim(), regulation: c.regulation, section: c.section, url: c.url, retrievedOn: c.retrievedOn, publisher: c.publisher, quote: c.quote ?? null };
}

export default async function Payout({ searchParams }: { searchParams: Promise<{ type?: string; sort?: string }> }) {
  const actor = await requireActor();
  if (actor.role === 'employee') redirect('/app');
  const admin = actor.role === 'owner' || actor.role === 'admin';
  const q = await searchParams;
  const setup = await call('getOrgSetup', {}, actor);
  const types = setup.leaveTypes.filter((t) => t.countsAgainstBalance);
  const type = types.find((t) => t.key === q.type) ?? types.find((t) => t.key === 'vacation') ?? types[0];
  const sort: Sort = q.sort && q.sort in SORTS ? (q.sort as Sort) : 'payable';
  if (!type) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-ink">PTO payout</h1>
        <p className="text-sm text-muted">No leave type uses a balance yet, so there is nothing to pay out.</p>
      </div>
    );
  }

  const liability = await call('getPayoutLiability', { leaveType: type.key, sort }, actor);
  const settings = admin ? await call('managePayout', { op: 'get' }, actor) : null;
  const mine = await call('getPayoutEstimate', { leaveType: type.key }, actor).catch(() => null);
  const stored = settings?.policies.find((p) => p.leaveType === type.key);
  const policy: PayoutPolicy | null = (stored?.policy as PayoutPolicy | undefined) ?? (mine?.policy as PayoutPolicy | undefined) ?? null;
  const sourceQuote = stored?.sourceQuote?.untrusted_text ?? mine?.policySource?.untrusted_text ?? null;
  const unit = liability.unit;
  const isSick = type.isHealthRelated || type.key === 'sick';

  const states = [...new Set(setup.locations.filter((l) => l.countryCode === 'US' && l.subdivisionCode).map((l) => l.subdivisionCode!.replace(/^US-/, '')))].sort();
  const stateRules = states.map((s) => statePayoutRule(s));
  const conflicts = policy && !isSick ? states.flatMap((s) => payoutConflicts(policy, s)) : [];
  const href = (o: { type?: string; sort?: Sort }) => `/app/payout?type=${encodeURIComponent(o.type ?? type.key)}&sort=${o.sort ?? sort}`;
  const columns: { key: Sort | null; label: string; show: boolean }[] = [
    { key: 'name', label: 'Name', show: true },
    { key: null, label: 'State', show: true },
    { key: null, label: 'Balance', show: true },
    { key: 'payable', label: 'If they left today', show: true },
    { key: 'amount', label: 'Estimated amount', show: liability.moneyShown },
    { key: null, label: 'Year end: carries over', show: true },
    { key: null, label: 'Cashed out', show: true },
    { key: 'forfeit', label: 'Lost', show: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">PTO payout</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          What unused leave would be worth if someone left today, and what happens to it at year end, from each person&rsquo;s ledger balance, your payout policy and
          the state rule where they work.
        </p>
        <p className="mt-2 inline-block rounded-md border border-line bg-surface px-2 py-1 text-sm font-medium text-ink">Estimate. Your payroll provider pays; not legal advice.</p>
      </div>

      {types.length > 1 && (
        <nav aria-label="Leave type" className="flex flex-wrap gap-2">
          {types.map((t) => (
            <Link key={t.key} href={href({ type: t.key })} aria-current={t.key === type.key ? 'page' : undefined} className={`rounded-full border px-3 py-1 text-sm ${t.key === type.key ? 'border-accent bg-accent-soft font-semibold text-accent-strong' : 'border-line bg-page text-ink hover:bg-surface-alt'}`}>
              {t.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`${type.name}: payout policy`}>
          {policy ? (
            <p className="text-sm text-ink">
              {describePayoutPolicy(policy, unit)}.{' '}
              <SourceChip
                source={{
                  label: sourceQuote ? 'Your handbook' : 'Your policy',
                  regulation: sourceQuote ? 'Your payout policy, from your handbook' : 'Your payout policy (set by your admin)',
                  publisher: 'handbook',
                  quote: sourceQuote,
                }}
              />
            </p>
          ) : (
            <p className="text-sm text-muted">No payout policy set for {type.name} yet; the defaults apply (state law at separation, excess lost at year end where allowed).</p>
          )}
          {isSick && <p className="mt-2 text-sm text-muted">Sick leave is excluded from payout unless the policy says otherwise.</p>}
          {conflicts.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-md border-l-4 border-gap-line bg-gap-bg p-3 text-sm text-ink" aria-label="Conflicts with state law">
              {conflicts.map((c) => (
                <li key={c}>
                  <span className="font-semibold">Conflicts with state law:</span> {c} The state rule is what the numbers use.
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="State rules where you have sites">
          {stateRules.length === 0 ? (
            <p className="text-sm text-muted">No US sites with a state set, so estimates follow your written policy.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {stateRules.map((s) => {
                const src = stateSource(s);
                return (
                  <li key={s.state}>
                    <p className="text-ink">
                      {s.summary} {src && <SourceChip source={src} />}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {s.separationRequired && <Badge tone="warn">Paid at separation: set by law</Badge>}
                      {s.forfeitureBanned && <Badge tone="warn">No use-it-or-lose-it</Badge>}
                      {s.needsVerification && <Badge>Needs verification</Badge>}
                    </p>
                    {s.needsVerification && <p className="mt-1 text-muted">Needs verification: {s.needsVerification}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Year-end forecast and liability">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Payable if all left today" value={fmt(liability.totals.separationPayable, unit)} />
          {liability.moneyShown && <Stat label="Estimated amount" value={liability.totals.separationAmount != null ? usd(liability.totals.separationAmount) : 'No rates'} />}
          <Stat label="Cashed out at year end" value={fmt(liability.totals.yearEndCashedOut, unit)} />
          <Stat label="Lost at year end" value={fmt(liability.totals.yearEndForfeited, unit)} />
        </div>
      </Card>

      <Card
        title={`Per person (${liability.rows.length})`}
        actions={
          admin ? (
            <a href={`/api/reports/payout?type=${encodeURIComponent(type.key)}&sort=${sort}`} className={btnSecondary}>
              Download CSV
            </a>
          ) : undefined
        }
      >
        {liability.rows.length === 0 ? (
          <p className="text-sm text-muted">Nobody to show for {type.name}.</p>
        ) : (
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label={`Payout per person, ${type.name}`}>
            <table className="w-full text-left text-sm tabular-nums">
              <caption className="sr-only">
                {type.name} payout estimate per person, sorted by {SORTS[sort].toLowerCase()}. {liability.notice}
              </caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  {columns
                    .filter((c) => c.show)
                    .map((c) => (
                      <th key={c.label} scope="col" className="px-2 py-2 font-medium whitespace-nowrap" aria-sort={c.key === sort ? (sort === 'name' ? 'ascending' : 'descending') : undefined}>
                        {c.key ? (
                          <Link href={href({ sort: c.key })} className="underline-offset-2 hover:underline">
                            {c.label}
                            {c.key === sort && <span aria-hidden="true"> {sort === 'name' ? '↑' : '↓'}</span>}
                          </Link>
                        ) : (
                          c.label
                        )}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {liability.rows.map((r) => (
                  <tr key={r.memberId} className="border-b border-line last:border-0">
                    <th scope="row" className="px-2 py-2 font-medium whitespace-nowrap text-ink">
                      {r.name.untrusted_text}
                    </th>
                    <td className="px-2 py-2 text-ink">{r.state ?? '—'}</td>
                    <td className="px-2 py-2 text-ink">{fmt(r.balance, unit)}</td>
                    <td className="px-2 py-2 text-ink">
                      {fmt(r.separationPayable, unit)}
                      <span className="block text-muted">{r.rule}</span>
                    </td>
                    {liability.moneyShown && <td className="px-2 py-2 text-ink">{r.separationAmount != null ? usd(r.separationAmount) : <span className="text-muted">No rate</span>}</td>}
                    <td className="px-2 py-2 text-ink">{fmt(r.yearEndCarried, unit)}</td>
                    <td className="px-2 py-2 text-ink">{fmt(r.yearEndCashedOut, unit)}</td>
                    <td className={`px-2 py-2 ${r.yearEndForfeited > 0 ? 'font-semibold text-gap-text' : 'text-ink'}`}>{fmt(r.yearEndForfeited, unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-muted">{liability.notice}</p>
      </Card>

      {settings && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`Set the ${type.name} payout policy`}>
            <p className="mb-3 text-sm text-muted">
              Where a state requires payout at separation or bans forfeiture, the state rule wins in the numbers whatever you choose here, and the choice is flagged. Paste the
              handbook sentence so everyone can see where the rule came from. Changes are recorded in the audit log.
            </p>
            <CapabilityForm
              capability="managePayout"
              fixed={{ op: 'setPolicy', leaveType: type.key }}
              fields={[
                {
                  name: 'separation',
                  label: 'Pay unused balance at separation',
                  type: 'select',
                  defaultValue: policy?.separation.mode ?? 'state_law',
                  options: [
                    { value: 'state_law', label: 'Only where state law requires it' },
                    { value: 'yes', label: 'Yes, all of it' },
                    { value: 'up_to_cap', label: 'Yes, up to a cap' },
                    { value: 'no', label: 'No (state law still applies)' },
                  ],
                },
                { name: 'separationCap', label: `Cap (${unit}), if paying up to a cap`, type: 'number', step: '0.5', defaultValue: policy?.separation.mode === 'up_to_cap' ? policy.separation.cap : undefined },
                {
                  name: 'yearEnd',
                  label: 'At year end, anything over the carry-over limit',
                  type: 'select',
                  defaultValue: policy?.yearEnd ?? 'forfeit_excess',
                  options: [
                    { value: 'forfeit_excess', label: 'Is lost (where state law allows)' },
                    { value: 'cash_out_excess', label: 'Is cashed out' },
                  ],
                },
                { name: 'cashOutAllowed', label: 'Allow cash-out on request', type: 'checkbox', defaultValue: policy?.voluntaryCashOut.allowed ?? false },
                { name: 'cashOutMinKept', label: `Minimum balance kept after a cash-out (${unit})`, type: 'number', step: '0.5', defaultValue: policy?.voluntaryCashOut.minBalanceKept ?? 0 },
                { name: 'cashOutMaxPerYear', label: `Most cashed out per year (${unit}, blank for no limit)`, type: 'number', step: '0.5', defaultValue: policy?.voluntaryCashOut.maxPerYear ?? undefined },
                { name: 'excludeSick', label: 'Never pay out sick leave', type: 'checkbox', defaultValue: policy?.excludeSick ?? true },
                { name: 'sourceQuote', label: 'Handbook sentence (optional)', type: 'text', placeholder: 'Unused vacation is paid out at separation…', defaultValue: sourceQuote ?? undefined },
              ]}
              submitLabel="Save payout policy"
            />
          </Card>

          <div className="space-y-4">
            <Card title="Who sees money">
              <p className="mb-3 text-sm text-muted">
                Off by default. With money estimates on, managers and admins see amounts for the people they can see (never the rates). Employees see their own amount
                only if you also turn that on. Agents and API tokens never get amounts or rates. Changes are recorded in the audit log.
              </p>
              <CapabilityForm
                capability="managePayout"
                fixed={{ op: 'setVisibility' }}
                fields={[
                  { name: 'moneyEstimates', label: 'Show payout estimates in money to managers and admins', type: 'checkbox', defaultValue: settings.moneyEstimates },
                  { name: 'employeeEstimates', label: 'Show employees their own payout estimate in money', type: 'checkbox', defaultValue: settings.employeeEstimates },
                ]}
                submitLabel="Save who sees money"
              />
            </Card>

            <Card title="Pay rates">
              {settings.moneyEstimates || settings.costAwareRanking ? (
                <>
                  <p className="mb-3 text-sm text-muted">
                    {settings.ratesOnFile} {settings.ratesOnFile === 1 ? 'person has' : 'people have'} a rate on file. Rates are only stored while money estimates (or
                    cost-aware ranking) are on, are never shown back, and are deleted when both are off. The audit log records that a rate changed, not the rate.
                  </p>
                  <CapabilityForm
                    capability="managePayout"
                    fixed={{ op: 'setPayRate' }}
                    fields={[
                      { name: 'memberId', label: 'Person', type: 'select', options: liability.rows.map((r) => ({ value: r.memberId, label: r.name.untrusted_text })) },
                      { name: 'hourlyRate', label: 'Hourly rate (USD)', type: 'number', step: '0.01', required: true },
                      { name: 'effectiveFrom', label: 'Effective from', type: 'date', required: true },
                    ]}
                    submitLabel="Save pay rate"
                  />
                </>
              ) : (
                <p className="text-sm text-muted">Turn on money estimates to add pay rates. Until then no rates are stored.</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
