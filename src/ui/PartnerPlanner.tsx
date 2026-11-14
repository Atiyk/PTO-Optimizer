import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Break, SolveInput } from '@daysoff/engine/solver/types';
import { formatDateRange } from '@daysoff/engine/calendar/dateFormat';

/** Native checkboxes render at 13px; give the visible box a 20px size inside a 44px row. */
const CHECK = 'h-5 w-5 shrink-0';
import { buildPartnerShareURL, findJointOpportunities, readPartnerAvailability, type PartnerAvailability } from '../planning/partner';
import { copyText } from './requestText';
import { downloadICS } from './icsExport';
import { Button } from './Button';
import { PlusMinus } from './Chevron';
import { track, trackBreakAction, trackOnceInDocument } from './analytics';
import { readBrowserPlanSearch } from './urlState';
import { ShareDatePreview } from './ShareDatePreview';

export interface PartnerPlannerProps {
  breaks: Break[];
  /** Free dates using the current workweek and employer calendar, including alternate Fridays. */
  freeDays: string[];
  /** Recipient's own inputs, including reserve-adjusted budget, blackouts and policy rules. */
  input: SolveInput;
  minimumBreakLength?: number;
  /** Bumped by "Plan with a partner" in the export row: opens this panel and moves focus to it. */
  openKey?: number;
  /** The break chosen from its result card, if this open request came from one. */
  selectedBreakId?: string;
}

export function PartnerPlanner({ breaks, freeDays, input, minimumBreakLength = 3, openKey = 0, selectedBreakId }: PartnerPlannerProps) {
  const [received] = useState(() => readPartnerAvailability(typeof window === 'undefined' ? '' : readBrowserPlanSearch(window.location.search, window.history.state)));
  const [open, setOpen] = useState(!!openKey || !!received.availability || received.invalid);
  const [selected, setSelected] = useState<string[]>(() => selectedBreakId ? [selectedBreakId] : []);
  const [proposalDays, setProposalDays] = useState<string[] | null>(null);
  const [includeFree, setIncludeFree] = useState(false);
  const [discloseFree, setDiscloseFree] = useState(false);
  const [confirmedSelection, setConfirmedSelection] = useState<string | null>(null);
  const [prioritize, setPrioritize] = useState(() => typeof window === 'undefined' || new URLSearchParams(window.location.search).get('jp') !== '0');
  const [message, setMessage] = useState('');
  const id = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const draftRef = useRef<HTMLFieldSetElement>(null);
  const [seenOpenKey, setSeenOpenKey] = useState(openKey);
  if (openKey !== seenOpenKey) {
    setSeenOpenKey(openKey);
    if (openKey) {
      setOpen(true);
      setSelected(selectedBreakId ? [selectedBreakId] : []);
      setProposalDays(null);
      setIncludeFree(false);
      setDiscloseFree(false);
      setConfirmedSelection(null);
      setMessage('');
    }
  }
  useEffect(() => {
    if (!openKey) return;
    (selectedBreakId ? draftRef.current : toggleRef.current)?.focus({ preventScroll: true });
    if (selectedBreakId) {
      const frame = requestAnimationFrame(() => draftRef.current?.scrollIntoView?.({ block: 'start' }));
      return () => cancelAnimationFrame(frame);
    }
  }, [openKey, selectedBreakId]);
  useEffect(() => {
    if (received.availability) trackOnceInDocument('partner_share_opened');
  }, [received.availability]);
  useEffect(() => {
    if (!received.availability || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (prioritize) url.searchParams.delete('jp');
    else url.searchParams.set('jp', '0');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [received.availability, prioritize]);
  const opportunities = useMemo(() => received.availability && prioritize ? findJointOpportunities(input, received.availability, minimumBreakLength) : [], [input, received.availability, minimumBreakLength, prioritize]);
  if (proposalDays && !opportunities.some(({ break: brk }) => brk.start === proposalDays[0] && brk.end === proposalDays.at(-1))) {
    setProposalDays(null);
    setDiscloseFree(false);
    setMessage('Your plan changed, so those dates no longer fit. Pick another option to propose.');
  }
  const chosenBreaks = useMemo(() => breaks.filter(brk => selected.includes(brk.id)), [breaks, selected]);
  const selectedDays = useMemo(
    () => [...new Set([...(proposalDays ?? chosenBreaks.flatMap(brk => brk.days)), ...(includeFree ? freeDays : [])])].sort(),
    [proposalDays, chosenBreaks, includeFree, freeDays],
  );
  const availableSet = new Set(selectedDays);
  const disclosedFreeDays = discloseFree ? [...new Set(freeDays.filter(day => availableSet.has(day)))].sort() : null;
  const selectionKey = `${selectedDays.join(',')}|${disclosedFreeDays?.join(',') ?? '-'}`;
  if (confirmedSelection !== null && confirmedSelection !== selectionKey) setConfirmedSelection(null);
  const confirmed = confirmedSelection === selectionKey;
  const share: PartnerAvailability = {
    days: selectedDays,
    freeDays: disclosedFreeDays,
    status: confirmed ? 'confirmed' : 'proposed',
  };
  const reviewProposal = (days: string[]) => {
    setProposalDays(days);
    setSelected([]);
    setIncludeFree(false);
    setDiscloseFree(false);
    setConfirmedSelection(null);
    setMessage('');
    draftRef.current?.focus({ preventScroll: true });
    requestAnimationFrame(() => draftRef.current?.scrollIntoView?.({ block: 'center' }));
  };

  return (
    <section className="rounded-[10px] border border-line bg-surface px-4 py-2 sm:px-5" aria-label="Partner vacation planner">
      <h2><button ref={toggleRef} type="button" className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-xl font-bold text-ink type-condensed" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        <span>Plan with someone</span><PlusMinus open={open} className="h-4 w-4" />
      </button></h2>
      {!open && <p className="pb-2 text-sm text-muted">Find dates you can both take off, without sharing your balance.</p>}
      {open && <div id={id} className="mt-2 space-y-5 pb-3">
        <p className="max-w-2xl text-sm text-muted">{received.availability
          ? 'Below are the dates your partner shared, checked against your own country, work schedule, employer holidays and PTO from the controls above.'
          : 'Pick dates you could take off and copy a link for your partner. When they open it, Timebower checks those dates against their own country, work schedule and PTO and shows the options that work for both of you.'}</p>
        {received.invalid && <p role="alert" className="rounded-[10px] border border-ink p-3 text-sm text-ink">This shared availability link is invalid or too large. Ask for a new link with fewer dates.</p>}
        {received.availability && <div className="border-t border-line pt-4">
          <h3 className="font-semibold text-ink">Possible dates together</h3>
          <p className="mt-1 text-sm text-muted">Your partner shared {received.availability.days.length} dates they {received.availability.status === 'confirmed' ? 'have confirmed they can take off' : 'could take off (not yet confirmed)'}. They didn&apos;t share anything about other dates.</p>
          <p className="mt-1 text-sm text-muted">Proposed dates may still need employer approval. Timebower does not contact either employer.</p>
          <div className="mt-3"><ShareDatePreview title="See dates they shared" dates={received.availability.days} status={received.availability.status} freeDays={received.availability.freeDays} /></div>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" className={CHECK} checked={prioritize} onChange={event => setPrioritize(event.target.checked)} />
            Show options for time off together.
          </label>
          {prioritize && <>
            <p className="mt-2 text-sm text-muted">Pick one option. Each fits your own PTO and rules. Options that overlap canPick one option. Each fits your own PTO and rules, but they overlap, so you can book only one.apos;t both be booked.</p>
            {!opportunities.length && <p role="status" className="mt-3 text-sm text-ink">No shared break of at least {Math.max(3, minimumBreakLength)} days fits your disclosed dates and PTO rules. Adjust your own dates or constraints, or share different availability.</p>}
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {opportunities.map(opportunity => <article key={opportunity.kind} className="min-w-0 rounded-[10px] border border-line bg-surface p-4">
                <h4 className="text-sm font-semibold text-ink">{opportunity.kind === 'long-weekend' ? (opportunity.break.totalDaysOff <= 4 ? 'Best shared long weekend' : 'Best shared short break') : opportunity.kind === 'week' ? 'Best shared week-long break' : 'Best shared longer vacation'}</h4>
                <p className="mt-2 font-semibold tabular-nums text-ink">{formatDateRange(opportunity.break.start, opportunity.break.end)}</p>
                <p className="mt-1 text-lg font-bold text-ink type-condensed"><span className="mark">{opportunity.break.totalDaysOff} days together</span></p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><span className="block text-muted">You</span><span className="font-semibold text-ink">{opportunity.yourPtoDays.length} PTO {opportunity.yourPtoDays.length === 1 ? 'day' : 'days'}</span></div>
                  <div><span className="block text-muted">Partner</span><span className="font-semibold text-ink">{opportunity.partnerPtoCost === null ? 'PTO not shared' : `${opportunity.partnerPtoCost} PTO ${opportunity.partnerPtoCost === 1 ? 'day' : 'days'}`}</span></div>
                </div>
                {opportunity.partnerPtoCost !== null && <p className="mt-3 text-xs leading-relaxed text-muted">{opportunity.bothFree} already off together · {opportunity.onlyYouNeedPto} need only your PTO · {opportunity.onlyPartnerNeedsPto} need only your partner’s PTO · {opportunity.bothNeedPto} need PTO from both.</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" className="min-h-11" onClick={() => {
                    try {
                      const pto = new Set(opportunity.yourPtoDays);
                      downloadICS([opportunity.break], day => pto.has(day));
                      setMessage('Your PTO calendar file downloaded.');
                      track('ICS downloaded');
                    } catch { setMessage('Could not download the calendar file. Please try again.'); }
                  }}>Add my PTO to calendar</Button>
                  <Button variant="quiet" size="sm" className="min-h-11" onClick={() => reviewProposal(opportunity.break.days)}>Propose these dates</Button>
                </div>
              </article>)}
            </div>
          </>}
        </div>}
        <fieldset ref={draftRef} tabIndex={-1} className="min-w-0 scroll-mt-24">
          <legend className="text-base font-semibold text-ink">{proposalDays ? 'Send these dates back' : received.availability ? 'Or share your own dates' : 'Dates you could take off'}</legend>
          {proposalDays ? (
            <p className="mt-2 text-sm text-ink">You&apos;re proposing {formatDateRange(proposalDays[0], proposalDays[proposalDays.length - 1])}. Your partner opens the link and checks these dates against their own calendar.</p>
          ) : <>
            {breaks.length === 0 && <p className="mt-2 text-sm text-muted">Your plan has no breaks yet. Add PTO days in the controls above, or share dates you already have off.</p>}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {breaks.map(brk => <label key={brk.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[6px] border border-line px-3 py-2 text-sm text-ink hover:border-line-strong">
                <input type="checkbox" className={CHECK} checked={selected.includes(brk.id)} onChange={event => {
                  const checked = event.target.checked;
                  setSelected(current => checked ? [...new Set([...current, brk.id])] : current.filter(value => value !== brk.id));
                }} />
                {formatDateRange(brk.start, brk.end)}
              </label>)}
            </div>
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" className={CHECK} checked={includeFree} onChange={event => setIncludeFree(event.target.checked)} />Also share other dates I already have off.</label>
          </>}
          <p className="mt-3 text-sm font-semibold text-ink">Optional</p>
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" className={CHECK} checked={discloseFree} disabled={!selectedDays.length} onChange={event => setDiscloseFree(event.target.checked)} />Show which of these dates I already have off.</label>
          {!proposalDays && <label className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" className={CHECK} checked={confirmed} disabled={!selectedDays.length} onChange={event => setConfirmedSelection(event.target.checked ? selectionKey : null)} />I have confirmed the availability I am sharing.</label>}
          {!proposalDays && <p className="mt-1 text-sm text-muted">Leave &ldquo;confirmed&rdquo; unticked and your partner sees these as proposed dates.</p>}
          {selectedDays.length > 0
            ? <div className="mt-3"><ShareDatePreview expanded title="What your partner will see" dates={share.days} status={share.status} freeDays={share.freeDays} /></div>
            : <p className="mt-3 text-sm text-ink">Tick at least one set of dates to make a link.</p>}
          <p className="mt-2 text-sm text-muted">Anyone with the link sees only these dates and whether they&apos;re proposed or confirmed. Your balance, employer and private notes stay in your plan.</p>
          <Button className="mt-3" variant="secondary" disabled={!selectedDays.length} onClick={async () => {
            try {
              const link = buildPartnerShareURL(window.location.origin, window.location.pathname, share);
              const ok = await copyText(link);
              setMessage(ok ? `${proposalDays ? 'Proposal link' : 'Partner link'} copied with ${selectedDays.length} ${share.status} ${selectedDays.length === 1 ? 'date' : 'dates'}. Send it to your partner in any message.` : 'Could not copy the link. Please try again.');
              if (ok) {
                track(proposalDays ? 'partner_proposal_generated' : 'partner_share_generated');
                if (!proposalDays && !includeFree && selectedBreakId && selected.length === 1 && selected[0] === selectedBreakId) {
                  trackBreakAction('shared');
                }
              }
            } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create the link.'); }
          }}>{proposalDays ? 'Copy proposal link' : 'Copy partner link'}</Button>
          {proposalDays && <Button className="ml-2 mt-3" variant="quiet" onClick={() => {
            setProposalDays(null);
            setDiscloseFree(false);
            setMessage('');
          }}>Choose different dates</Button>}
        </fieldset>
        <p role="status" className="text-sm text-muted">{message}</p>
      </div>}
    </section>
  );
}
