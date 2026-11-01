import { SourceChip, type SourceChipSource } from '@/components/SourceChip';
import { fmt } from '@/components/ui';
import type { CapabilityOutput } from '@/capabilities/registry';

/*
 * The payout lines on a balance: "If you left today" and "At year end", each with a source
 * chip (the statute, the state agency's page, or the handbook sentence the policy came from).
 * Every number is the engine's (getPayoutEstimate); money only when the caller may see it.
 */

type Estimate = CapabilityOutput<'getPayoutEstimate'>;
type Result = Estimate['separation'];

export const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function payoutSource(e: Estimate, r: Result): SourceChipSource {
  const c = r.rule.citation;
  if (r.rule.basis === 'law' && c) {
    return { label: `${c.regulation.split(';')[0]} ${c.section.startsWith('§') ? c.section : ''}`.trim(), regulation: c.regulation, section: c.section, url: c.url, retrievedOn: c.retrievedOn, publisher: c.publisher as SourceChipSource['publisher'], quote: c.quote };
  }
  return { label: e.policySource ? 'Your handbook' : 'Your policy', regulation: e.policySource ? 'Your payout policy, from your handbook' : 'Your payout policy (set by your admin)', publisher: 'handbook', quote: e.policySource?.untrusted_text ?? null };
}

export function PayoutLines({ e, compact = false }: { e: Estimate; compact?: boolean }) {
  if (e.unlimited) return null;
  const sep = e.separation;
  const ye = e.yearEnd;
  const verify = sep.rule.needsVerification;
  return (
    <div className={`rounded-md border border-line bg-surface p-3 text-sm ${compact ? '' : 'mt-1'}`}>
      <p className="font-semibold text-ink">Payout</p>
      <p className="mt-1 text-ink">
        If you left today: {sep.payable > 0 ? <>about <strong>{fmt(sep.payable, e.unit)}</strong> payable</> : <>nothing payable</>}
        {sep.amount != null && sep.payable > 0 && <> (≈ <strong>{usd(sep.amount)}</strong>)</>}. <span className="text-muted">{sep.rule.label}.</span> <SourceChip source={payoutSource(e, sep)} />
      </p>
      {verify && <p className="mt-1 text-muted">Needs verification: {verify}</p>}
      {e.yearEndDate && (
        <p className="mt-2 text-ink">
          At year end ({e.yearEndDate}): {fmt(ye.carried, e.unit)} carry over
          {ye.payable > 0 && <>, {fmt(ye.payable, e.unit)} cashed out{ye.amount != null && <> (≈ {usd(ye.amount)})</>}</>}
          {ye.forfeited > 0 && <>, <strong>{fmt(ye.forfeited, e.unit)}</strong> would be lost</>}. <SourceChip source={payoutSource(e, ye)} />
        </p>
      )}
      {!compact && <p className="mt-2 text-muted">Policy: {e.policySummary}.</p>}
      {e.moneyNote && <p className="mt-1 text-muted">{e.moneyNote}</p>}
      <p className="mt-2 text-muted">{e.notice}</p>
    </div>
  );
}
