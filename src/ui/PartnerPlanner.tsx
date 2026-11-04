import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Break, SolveInput } from '@daysoff/engine/solver/types';
import { formatDateRange } from '@daysoff/engine/calendar/dateFormat';
import { buildPartnerShareURL, findJointOpportunities, readPartnerAvailability, type PartnerAvailability } from '../planning/partner';
import { copyText } from './requestText';
import { downloadICS } from './icsExport';
import { Button } from './Button';
import { track } from './analytics';

export interface PartnerPlannerProps {
  breaks: Break[];
  /** Free dates using the current workweek and employer calendar, including alternate Fridays. */
  freeDays: string[];
  /** Recipient's own inputs, including reserve-adjusted budget, blackouts and policy rules. */
  input: SolveInput;
  minimumBreakLength?: number;
}

export function PartnerPlanner({ breaks, freeDays, input, minimumBreakLength = 3 }: PartnerPlannerProps) {
  const [received] = useState(() => readPartnerAvailability(typeof window === 'undefined' ? '' : window.location.search));
  const [open, setOpen] = useState(!!received.availability || received.invalid);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [includeFree, setIncludeFree] = useState(false);
  const [confirmedSelection, setConfirmedSelection] = useState<string | null>(null);
  const [prioritize, setPrioritize] = useState(() => typeof window === 'undefined' || new URLSearchParams(window.location.search).get('jp') !== '0');
  const [message, setMessage] = useState('');
  const id = useId();
  const opened = useRef(false);
  useEffect(() => {
    if (received.availability && !opened.current) { opened.current = true; track('partner_share_opened'); }
  }, [received.availability]);
  useEffect(() => {
    if (!received.availability || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (prioritize) url.searchParams.delete('jp');
    else url.searchParams.set('jp', '0');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [received.availability, prioritize]);
  const chosenBreaks = useMemo(() => selected === null ? breaks : breaks.filter(brk => selected.includes(brk.id)), [breaks, selected]);
  const selectedDays = useMemo(() => [...new Set([...chosenBreaks.flatMap(brk => brk.days), ...(includeFree ? freeDays : [])])].sort(), [chosenBreaks, includeFree, freeDays]);
  const availableSet = new Set(selectedDays);
  const disclosedFreeDays = freeDays.filter(day => availableSet.has(day)).sort();
  const selectionKey = `${selectedDays.join(',')}|${disclosedFreeDays.join(',')}`;
  const confirmed = confirmedSelection === selectionKey;
  const share: PartnerAvailability = {
    days: selectedDays,
    freeDays: disclosedFreeDays,
    status: confirmed ? 'confirmed' : 'proposed',
  };
  const opportunities = useMemo(() => received.availability && prioritize ? findJointOpportunities(input, received.availability, minimumBreakLength) : [], [input, received.availability, minimumBreakLength, prioritize]);

  return (
    <section className="rounded-[4px] border border-line bg-surface px-4 py-2 sm:px-5" aria-label="Partner vacation planner">
      <h2><button type="button" className="flex min-h-12 w-full items-center justify-between gap-3 text-left text-xl font-bold text-ink type-condensed" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        <span>Plan with someone</span><span aria-hidden="true" className="text-2xl font-normal leading-none">{open ? '−' : '+'}</span>
      </button></h2>
      {!open && <p className="pb-2 text-sm text-muted">Find dates you can both take off, without sharing your balance.</p>}
      {open && <div id={id} className="mt-2 space-y-5 pb-3">
        <p className="max-w-2xl text-sm text-muted">Choose which dates to share. Your partner uses their own country, work schedule, employer holidays, and PTO budget in the controls above.</p>
        {received.invalid && <p role="alert" className="rounded-[4px] border border-ink p-3 text-sm text-ink">This shared availability link is invalid or too large. Ask for a new link with fewer dates.</p>}
        {received.availability && <div className="rounded-[4px] bg-surface-alt p-4">
          <h3 className="font-semibold text-ink">Here are the dates you can both take off.</h3>
          <p className="mt-1 text-sm text-muted">Your partner shared {received.availability.days.length} dates as {received.availability.status} availability, from {formatDateRange(received.availability.days[0], received.availability.days[received.availability.days.length - 1])}. Dates outside that selection are undisclosed.</p>
          <p className="mt-1 text-sm text-muted">Proposed dates may still need employer approval. Gapless does not contact either employer.</p>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" checked={prioritize} onChange={event => setPrioritize(event.target.checked)} />
            Maximize days off together.
          </label>
          {prioritize && <>
            <p className="mt-2 text-sm text-muted">Choose one of these alternatives. Each fits your own budget and rules; overlapping options cannot all be booked together.</p>
            {!opportunities.length && <p role="status" className="mt-3 text-sm text-ink">No shared break of at least {Math.max(3, minimumBreakLength)} days fits your disclosed dates and PTO rules. Adjust your own dates or constraints, or share different availability.</p>}
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {opportunities.map(opportunity => <article key={opportunity.kind} className="min-w-0 rounded-[4px] border border-line bg-surface p-4">
                <h4 className="text-sm font-semibold text-ink">{opportunity.kind === 'long-weekend' ? (opportunity.break.totalDaysOff <= 4 ? 'Best shared long weekend' : 'Best shared short break') : opportunity.kind === 'week' ? 'Best shared week-long break' : 'Best shared longer vacation'}</h4>
                <p className="mt-2 font-semibold tabular-nums text-ink">{formatDateRange(opportunity.break.start, opportunity.break.end)}</p>
                <p className="mt-1 text-lg font-bold text-ink type-condensed"><span className="mark">{opportunity.break.totalDaysOff} days together</span></p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><span className="block text-muted">You</span><span className="font-semibold text-ink">{opportunity.yourPtoDays.length} PTO days</span></div>
                  <div><span className="block text-muted">Partner</span><span className="font-semibold text-ink">{opportunity.partnerPtoCost === null ? 'PTO cost undisclosed' : `${opportunity.partnerPtoCost} PTO days`}</span></div>
                </div>
                {opportunity.partnerPtoCost !== null && <p className="mt-3 text-xs leading-relaxed text-muted">{opportunity.bothFree} already off together · {opportunity.onlyYouNeedPto} need only your PTO · {opportunity.onlyPartnerNeedsPto} need only your partner’s PTO · {opportunity.bothNeedPto} need PTO from both.</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => {
                    try {
                      const pto = new Set(opportunity.yourPtoDays);
                      downloadICS([opportunity.break], day => pto.has(day));
                      setMessage('Your PTO calendar file downloaded.');
                      track('ICS downloaded');
                    } catch { setMessage('Could not download the calendar file. Please try again.'); }
                  }}>Export my PTO</Button>
                  <Button variant="quiet" size="sm" onClick={async () => {
                    try {
                      const ownFree = new Set(freeDays);
                      const shared = buildPartnerShareURL(window.location.origin, window.location.pathname, { days: opportunity.break.days, freeDays: opportunity.break.days.filter(day => ownFree.has(day)), status: 'proposed' });
                      const ok = await copyText(shared);
                      setMessage(ok ? 'Joint opportunity link copied as proposed availability.' : 'Could not copy the link. Please try again.');
                      if (ok) track('partner_share_generated');
                    } catch { setMessage('Could not create the link. Please try again.'); }
                  }}>Share these dates</Button>
                </div>
              </article>)}
            </div>
          </>}
        </div>}
        <fieldset className="min-w-0">
          <legend className="text-sm font-semibold text-ink">Choose dates to share</legend>
          {breaks.length === 0 && <p className="mt-2 text-sm text-muted">Add PTO to your plan, or share dates you already have off.</p>}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {breaks.map(brk => <label key={brk.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[3px] border border-line px-3 py-2 text-sm text-ink hover:border-line-strong">
              <input type="checkbox" checked={selected === null || selected.includes(brk.id)} onChange={event => setSelected(current => {
                const ids = current ?? breaks.map(value => value.id);
                return event.target.checked ? [...new Set([...ids, brk.id])] : ids.filter(value => value !== brk.id);
              })} />
              {formatDateRange(brk.start, brk.end)}
            </label>)}
          </div>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={includeFree} onChange={event => setIncludeFree(event.target.checked)} />Also share other dates I already have off.</label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink"><input type="checkbox" checked={confirmed} onChange={event => setConfirmedSelection(event.target.checked ? selectionKey : null)} />I have confirmed the availability I am sharing.</label>
          <p className="mt-1 text-sm text-muted">The link contains selected dates and whether they are already free or need PTO. It includes no balance, employer, notes, or private policy details. Anyone with the link can see those dates.</p>
          <Button className="mt-3" variant="secondary" disabled={!selectedDays.length} onClick={async () => {
            try {
              const link = buildPartnerShareURL(window.location.origin, window.location.pathname, share);
              const ok = await copyText(link);
              setMessage(ok ? `Partner link copied with ${selectedDays.length} ${confirmed ? 'confirmed' : 'proposed'} dates.` : 'Could not copy the link. Please try again.');
              if (ok) track('partner_share_generated');
            } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create the link.'); }
          }}>Copy partner link</Button>
        </fieldset>
        <p role="status" className="text-sm text-muted">{message}</p>
      </div>}
    </section>
  );
}
