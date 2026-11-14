import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWholeDayDraft } from './useWholeDayDraft';
import { initialPolicyPreferences } from '../personal/policyPreferences';
import { buildSchoolCalendar } from '../personal/schoolCalendar';
import { familyParentFreeDays, MAX_FAMILY_PTO, planFamilyTime, type FamilyPlanResult, type SchoolBreak, type FamilyBreakPlan } from '../personal/familyPlan';
import { findDistrictPreset, presetLabels, presetOffDays, SCHOOL_DISTRICT_PRESETS } from '../content/schoolDistricts';
import type { PartnerAvailability } from '../planning/partner';
import { addDays, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { formatCardDateRange, formatLong, formatShort, formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { CountrySelect } from './CountrySelect';
import { Button } from './Button';
import { getPrerenderedAt } from './prerenderedAt';
import { geolocateCountry } from './geo';
import { todayISO } from './today';
import { weekStartForCountry } from './locale';
import { copyText } from './requestText';
import { downloadFamilyPtoICS } from './icsExport';
import { buildFamilyShareURL, encodeDateRanges, MAX_FAMILY_DATES_PARAM, readFamilyBrowserState, writeFamilyBrowserState } from './familyUrlState';
import { FamilyCalendar, FamilyLegend, type FamilyDayState } from './FamilyCalendar';
import { DistrictPicker, ImportSources } from './FamilySources';
import { openFamilySource } from './familySourceFocus';
import { FamilyShare } from './FamilyShare';
import { FAMILY_FAQ_ITEMS } from './familyFaqItems';
import { useRequestCalendar } from './useRequestCalendar';
import { usePersonalWorkspace } from './usePersonalWorkspace';
import { committedRequestDays, fullDayLeaveDates } from '../personal/workspace';
import { ShareDatePreview } from './ShareDatePreview';
import { track } from './analytics';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * F08: a first visit (US, no district, no added dates, nothing shared) plans live against
 * this sourced preset so /family shows a result like every other planner. It is labelled as
 * an example wherever results appear, and nothing about it is written to the URL: the
 * example is a pure function of "no school calendar yet", so a bare or shared link with
 * the same public inputs reproduces exactly what the sender saw.
 */
const FAMILY_EXAMPLE_DISTRICT_ID = 'fairfax-fcps-2026-27';
const DISTRICT_SEARCH_ID = 'family-district-search';
const PTO_INPUT_ID = 'family-pto';
const START_INPUT_ID = 'family-from';
const schoolYearLabel = (y: string) => y.replace('-', '–');
/** Every preset is a US district; other countries lead with pasted or typed dates. */
const PRESET_COUNTRY = 'US';

function focusField(id: string) {
  const el = typeof document === 'undefined' ? null : document.getElementById(id);
  if (!el) return;
  el.scrollIntoView?.({ block: 'center' });
  el.focus({ preventScroll: true });
}

/**
 * /family: plan PTO around school breaks. Modelled on /sabbatical - its own route, the same
 * holiday data and drawing language - answering two questions live, with no submit step:
 * which school breaks to take off for the most days with your kids within your PTO, and
 * which school days off are still uncovered. Only public inputs round-trip through the URL.
 * School dates come from a sourced district preset and/or dates the
 * person adds (file, link, photo, pasted text, typed); everything is dates only.
 */
export function Family() {
  const prerenderedAt = useMemo(() => getPrerenderedAt(), []);
  const today = todayISO();
  const search = typeof window !== 'undefined' ? window.location.search : '';
  // Read once at mount, like /sabbatical (SSR-safe: prerendering has an empty search).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => readFamilyBrowserState(search, typeof window === 'undefined' ? undefined : window.history.state?.familyDraft), []);
  const received = { availability: initial.availability ?? null, invalid: initial.invalid.includes('pp') || initial.invalid.includes('search') };

  const [country, setCountry] = useState<string>(() => initial.country ?? geolocateCountry());
  const [start, setStart] = useState(initial.start ?? today);
  const [ptoBudget, setPtoBudget] = useState(initial.ptoBudget);
  const [prioritizeCoverage, setPrioritizeCoverage] = useState(initial.prioritizeCoverage === true);
  const [districtId, setDistrictId] = useState<string | undefined>(initial.districtId);
  const [customOffDays, setCustomOffDays] = useState<string[]>(initial.customOffDays);
  const [excludedBreaks, setExcludedBreaks] = useState<string[]>(initial.excludedBreaks);
  const ask = initial.ask;
  const [sendBackMessage, setSendBackMessage] = useState('');
  const [skippedParams, setSkippedParams] = useState<string[]>([]);
  const [budgetMessage, setBudgetMessage] = useState('');
  const incomingTracked = useRef(false);
  const incomingShare = useRef(new URLSearchParams(search));
  useEffect(() => {
    const incoming = incomingShare.current;
    if (!incomingTracked.current && (initial.ask || (incoming.has('sd') && initial.customOffDays.length > 0) || (incoming.has('pp') && initial.availability))) {
      incomingTracked.current = true;
      track('family_share_opened');
    }
  }, [initial]);

  const end = addDays(start, 364);

  const preferences = useMemo(() => initialPolicyPreferences('', country), [country]);
  const savedSchedule = preferences.country === country ? preferences : undefined;
  const savedWeek = savedSchedule?.workWeek;
  const savedRegion = savedSchedule?.subdivision;
  const savedBalance = savedSchedule?.balanceEntered && savedSchedule.accrualKind !== 'unlimited' &&
    (savedSchedule.unit === 'days' || (!savedSchedule.shiftMinutes && Number.isFinite(savedSchedule.hoursPerDay) && savedSchedule.hoursPerDay > 0))
    ? savedSchedule : undefined;
  const workspace = usePersonalWorkspace();
  // Tracked requests after the saved balance date are deducted once (workspace rule),
  // using the basis the balance was saved with.
  const committed = useMemo(() => savedBalance
    ? committedRequestDays(workspace.requests, { asOf: savedBalance.balanceAsOf, includesApprovedLeave: savedBalance.balanceIncludesApprovedLeave === true }, workspace.schedule)
    : { approvedDays: 0, tentativeDays: 0 }, [savedBalance, workspace.requests, workspace.schedule]);
  const balanceInDays = savedBalance
    ? savedBalance.currentBalance / (savedBalance.unit === 'hours' ? savedBalance.hoursPerDay : 1) - committed.approvedDays - committed.tentativeDays : null;
  const savedBudget = balanceInDays !== null && Number.isFinite(balanceInDays)
    ? Math.max(0, Math.min(MAX_FAMILY_PTO, Math.floor(balanceInDays))) : null;
  const { calendar, holidayNames, loading: workCalendarLoading, degraded: workCalendarDegraded } = useRequestCalendar({
    country,
    subdivision: savedRegion?.startsWith(`${country}-`) ? savedRegion : undefined,
    rangeStart: start,
    rangeEnd: end,
    workWeek: savedWeek?.some(Boolean) ? savedWeek : DEFAULT_WORK_WEEK,
    altFridayStart: savedSchedule?.altFridayStart,
  });

  // Retain legacy and shared inputs in the history entry without leaving them in the address.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const { search: publicSearch, draft, skipped } = writeFamilyBrowserState({
      country, start, defaultStart: today, ptoBudget, prioritizeCoverage, districtId, customOffDays, excludedBreaks, availability: initial.availability ?? null, ask,
    });
    setSkippedParams((cur) => (cur.join() === skipped.join() ? cur : skipped));
    const previous = window.history.state;
    if (previous?.familyDraft === draft && url.search.slice(1) === publicSearch) return;
    url.search = publicSearch;
    window.history.replaceState({ ...previous, familyDraft: draft }, '', `${url.pathname}${url.search}${url.hash}`);
  }, [country, start, ptoBudget, prioritizeCoverage, districtId, customOffDays, excludedBreaks, ask, today, initial.availability]);

  const presetsApply = country === PRESET_COUNTRY;
  const examplePreset = useMemo(() => findDistrictPreset(FAMILY_EXAMPLE_DISTRICT_ID), []);
  // Only when there is no school calendar of the person's own, and nothing shared or asked
  // that the example could be confused with.
  const exampleCandidate = presetsApply && !!examplePreset && !districtId && customOffDays.length === 0 &&
    !ask && !received.availability && !received.invalid && !initial.invalid.includes('sd');
  const preset = districtId ? findDistrictPreset(districtId) : exampleCandidate ? examplePreset : undefined;
  const schoolYearStart = preset
    ? Number(preset.schoolYear.slice(0, 4))
    : Number(start.slice(5, 7)) >= 7 ? Number(start.slice(0, 4)) : Number(start.slice(0, 4)) - 1;

  const presetDates = useMemo(() => preset ? presetOffDays(preset) : [], [preset]);
  const schoolOffDays = useMemo(() => {
    const merged = [...presetDates, ...customOffDays];
    if (merged.length === 0) return [];
    return buildSchoolCalendar({ manualOffDays: merged })?.offDays ?? [];
  }, [presetDates, customOffDays]);
  const schoolSources = useMemo(() => {
    const district = new Set(presetDates);
    const added = new Set(customOffDays);
    return new Map(schoolOffDays.map(date => [date, preset && district.has(date)
      ? (added.has(date) ? `${preset.shortName} and added dates` : exampleCandidate ? `Example: ${preset.shortName}` : preset.shortName)
      : 'Added or shared dates']));
  }, [preset, presetDates, customOffDays, schoolOffDays, exampleCandidate]);
  const schoolLabels = useMemo(() => (preset ? presetLabels(preset) : {}), [preset]);

  // Whole days of tracked approved and tentative leave are already off (workspace rule), so
  // the family plan never spends PTO on them again; their cost is deducted from the saved
  // balance above, once. A partly booked day (an hourly appointment) is still a workday:
  // someone has to have the kids, so it stays a coverage gap.
  const committedOffDays = useMemo(
    () => fullDayLeaveDates(workspace.requests, { start, end }, workspace.schedule),
    [workspace.requests, workspace.schedule, start, end],
  );
  const parentFreeDays = useMemo(
    () => familyParentFreeDays({ start, end, workWeek: calendar.workWeek, offDays: [...calendar.offDays, ...committedOffDays] }),
    [start, end, calendar.offDays, calendar.workWeek, committedOffDays],
  );
  const parentFreeSet = useMemo(() => new Set(parentFreeDays), [parentFreeDays]);
  const otherAdultDays = received.availability?.days;
  const otherAdultConfirmed = received.availability?.status === 'confirmed';

  const plan: FamilyPlanResult | null = useMemo(
    () => (schoolOffDays.length ? planFamilyTime({ start, end, schoolOffDays, schoolLabels, parentFreeDays, ptoBudget, otherAdultDays, otherAdultConfirmed, excludedBreaks, prioritizeCoverage }) : null),
    [start, end, schoolOffDays, schoolLabels, parentFreeDays, ptoBudget, otherAdultDays, otherAdultConfirmed, excludedBreaks, prioritizeCoverage],
  );

  const calendarReady = !workCalendarLoading && !workCalendarDegraded;
  const hasSchoolDates = schoolOffDays.length > 0;
  const hasBreaks = !!plan && plan.breaks.length > 0;
  // An example with no breaks in this window is not shown at all: the empty state teaches instead.
  const isExample = exampleCandidate && hasBreaks;
  const hasOwnSchoolDates = hasSchoolDates && !exampleCandidate;
  const exampleTag = isExample ? ' (example)' : '';
  const sdTooLong = skippedParams.includes('sd') || encodeDateRanges(customOffDays).length > MAX_FAMILY_DATES_PARAM;
  const unknownDistrict = !!districtId && !preset;

  // Breaks switched off while looking at the example must not carry into the person's own plan.
  const leaveExample = () => { if (exampleCandidate) setExcludedBreaks([]); };
  const addCustom = (dates: string[]) => {
    leaveExample();
    if (dates.some(date => !customOffDays.includes(date))) track('family_source_applied');
    setCustomOffDays(cur => [...new Set([...cur, ...dates])].sort());
  };
  const toggleBreak = (id: string, include: boolean) =>
    setExcludedBreaks((cur) => (include ? cur.filter((x) => x !== id) : [...new Set([...cur, id])].sort()));

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicPlanLink = () => {
    const { search } = writeFamilyBrowserState({ country, start, ptoBudget, prioritizeCoverage, customOffDays: [], excludedBreaks: [] });
    return `${origin}/family${search ? `?${search}` : ''}`;
  };
  // Shared links carry dates only, like the /pto partner link: never the sender's country,
  // so the person who opens one plans with their own country's holidays and weekends.
  const askLink = () => buildFamilyShareURL(origin, { customOffDays: [], ask: true });
  const sendBackLink = () => buildFamilyShareURL(origin, { customOffDays: schoolOffDays });
  const shareLink = ({ includeSchool, availability }: { includeSchool: boolean; availability?: PartnerAvailability }) =>
    buildFamilyShareURL(origin, { customOffDays: includeSchool ? schoolOffDays : [], availability });

  const stepBtn = `flex h-11 w-11 shrink-0 items-center justify-center text-lg font-semibold text-ink transition-colors duration-150 hover:bg-surface-alt disabled:opacity-40 ${FOCUS}`;
  const numberInput = 'h-11 w-14 min-w-0 border-x border-line-strong bg-surface text-center text-base font-semibold text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
  const setBudget = (n: number) => {
    setPtoBudget(Math.max(0, Math.min(MAX_FAMILY_PTO, Math.round(n))));
    setBudgetMessage('');
  };
  const budgetDraft = useWholeDayDraft(ptoBudget, setBudget);

  const districtPicker = (
    <DistrictPicker
      inputId={DISTRICT_SEARCH_ID}
      exampleDistrictId={isExample ? FAMILY_EXAMPLE_DISTRICT_ID : undefined}
      districtId={districtId}
      onChange={next => {
        if (next && next !== districtId) track('family_source_applied');
        if (next) leaveExample();
        setDistrictId(next);
      }}
    />
  );

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="family" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pb-12 pt-6 sm:px-6 lg:pt-10">
          {ask && (
            <section aria-labelledby="family-ask-heading" className="mb-6 rounded-[10px] border-2 border-ink bg-surface p-4 sm:p-5">
              <h2 id="family-ask-heading" className="text-xl font-bold text-ink type-condensed">Someone asked you to add the school calendar</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink">
                Pick the school district below, or add the school&apos;s days off from a file, a photo, pasted text or by typing them. Then copy the link and send it back. The link carries only the dates.
              </p>
              {hasSchoolDates && <div className="mt-3"><ShareDatePreview expanded schoolDates={schoolOffDays} /></div>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={!hasSchoolDates} onClick={async () => {
                  try {
                    const ok = await copyText(sendBackLink());
                    if (ok) track('family_share_generated');
                    setSendBackMessage(ok ? `Link copied with ${plural(schoolOffDays.length, 'school day')} off.` : 'Could not copy the link. Please try again.');
                  } catch (err) {
                    setSendBackMessage(err instanceof Error ? err.message : 'Could not create the link.');
                  }
                }}>Copy link with these dates</Button>
                <span role="status" className="text-sm text-muted">{sendBackMessage || (hasSchoolDates ? '' : 'Add the school dates first.')}</span>
              </div>
            </section>
          )}

          <header className="max-w-4xl">
            {plan && isExample && preset ? (
              <ExampleSummary
                plan={plan}
                district={preset.district}
                schoolYear={preset.schoolYear}
                ptoBudget={ptoBudget}
                prioritizeCoverage={prioritizeCoverage}
                onPickDistrict={() => focusField(DISTRICT_SEARCH_ID)}
                onAddDates={() => openFamilySource('family-source-paste')}
              />
            ) : plan && hasBreaks ? (
              <>
                {prioritizeCoverage ? (
                  <>
                    <h1 className="text-h1 type-display text-ink">
                      {plan.uncoveredDays.length > 0
                        ? <><span className="mark">{plural(plan.uncoveredDays.length, 'school closure')}</span> still {plan.uncoveredDays.length === 1 ? 'needs' : 'need'} care.</>
                        : <><span className="mark">No gaps found</span> in the dates you added.</>}
                    </h1>
                    <p className="mt-3 text-base text-muted">{plural(plan.gaps.length, 'listed closure')} between {formatLong(start)} and {formatLong(end)}. {plural(plan.ptoUsed, 'PTO day')} planned.</p>
                  </>
                ) : (
                  <>
                    <h1 className="text-h1 type-display text-ink">
                      <span className="mark">{plural(plan.togetherDaysTotal, 'day')} with your kids</span>{' '}
                      {plan.ptoUsed > 0 ? <>for {plural(plan.ptoUsed, 'PTO day')}.</> : <>without using PTO.</>}
                    </h1>
                    <p className="mt-3 text-base text-muted">
                      {plural(plan.breaks.length, 'school break')} between {formatLong(start)} and {formatLong(end)}.{' '}
                      {plan.uncoveredDays.length > 0
                        ? `${plural(plan.uncoveredDays.length, 'school day')} off still uncovered in the dates you added.`
                        : 'No gaps found in the dates you added.'}{' '}
                      Day counts include the weekends that join each break.
                    </p>
                  </>
                )}
                {plan.uncoveredDays.length > 0 && (
                  <a href="#family-uncovered-heading" className={`link-mark mt-2 inline-block text-sm font-semibold ${FOCUS}`}>See dates that need care</a>
                )}
                {preset && (start < preset.firstDay || end > preset.lastDay) && (
                  <p className="mt-1 text-sm text-muted">
                    The {preset.shortName} preset covers the {preset.schoolYear} school year, from {formatLong(preset.firstDay)} through {formatLong(preset.lastDay)}. Add any closures outside those dates.
                  </p>
                )}
              </>
            ) : (
              <>
                <h1 className="text-h1 type-display text-ink">Line up your PTO with school breaks</h1>
                <p className="mt-3 max-w-2xl text-base text-muted">
                  {hasOwnSchoolDates
                    ? `None of the school dates you added fall between ${formatLong(start)} and ${formatLong(end)}. Move the start date or add dates for this school year.`
                    : presetsApply
                      ? 'Pick your school district or add your school’s days off. This shows which breaks to take off for the most days with your kids, and which school days off still need cover.'
                      : 'Paste or type your school’s days off. This shows which breaks to take off for the most days with your kids, and which school days off still need cover.'}
                </p>
              </>
            )}
            {prerenderedAt && plan && (
              <p className="mt-1 text-xs text-muted">Dates as of {formatShort(prerenderedAt.slice(0, 10))}. They update once the page loads.</p>
            )}
          </header>

          <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-12">
            <div className="min-w-0">
              <h2 className="sr-only">Your details and school calendar</h2>
              <div className="flex flex-col gap-6 rounded-[10px] border border-line bg-surface p-4 sm:p-5">
                <fieldset className="min-w-0">
                  <legend className="text-base font-bold type-condensed text-ink">You</legend>
                  <div className="mt-3 flex flex-col gap-4 sm:grid sm:grid-cols-3 lg:flex">
                    <CountrySelect country={country} onChangeCountry={next => { setCountry(next); setBudgetMessage(''); }} widthClass="w-full" />
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-ink" htmlFor={START_INPUT_ID}>Plan from</label>
                      <input
                        id={START_INPUT_ID}
                        type="date"
                        value={start}
                        onChange={(e) => e.target.value && setStart(e.target.value)}
                        className={`mt-1.5 h-11 w-full min-w-0 rounded-[6px] border border-line-strong bg-surface px-3 text-base text-ink ${FOCUS}`}
                      />
                      <p className="mt-1 text-xs text-muted">Through {formatShortWithYear(end)}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-ink" htmlFor={PTO_INPUT_ID}>PTO for school breaks</label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="inline-flex items-stretch overflow-hidden rounded-[6px] border border-line-strong bg-surface">
                          <button type="button" aria-label="One fewer PTO day" disabled={ptoBudget <= 0} onClick={() => setBudget(ptoBudget - 1)} className={stepBtn}>&minus;</button>
                          <input id={PTO_INPUT_ID} type="number" min={0} max={MAX_FAMILY_PTO} step={1} value={budgetDraft.text} aria-describedby={budgetDraft.empty ? 'family-pto-hint' : undefined} onChange={(e) => budgetDraft.onChange(e.target.value)} onBlur={budgetDraft.onBlur} className={numberInput} />
                          <button type="button" aria-label="One more PTO day" disabled={ptoBudget >= MAX_FAMILY_PTO} onClick={() => setBudget(ptoBudget + 1)} className={stepBtn}>+</button>
                        </div>
                        <span className="text-sm text-muted">days</span>
                      </div>
                      <p id="family-pto-hint" role="status" className={budgetDraft.empty ? 'mt-1.5 text-sm text-muted' : 'sr-only'}>
                        {budgetDraft.empty ? 'Enter your PTO days. Enter 0 if you have none.' : ''}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted">Choose how many PTO days to use for school closures. Changes here apply to this plan.</p>
                  {savedBudget !== null && savedBalance && (
                    <div className="mt-2">
                      <Button variant="secondary" size="sm" onClick={() => {
                        setPtoBudget(savedBudget);
                        setBudgetMessage(`Set to ${plural(savedBudget, 'day')} for school closures.`);
                      }}>Use my saved balance</Button>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        {plural(savedBudget, 'whole day')} from My PTO as of {formatShortWithYear(savedBalance.balanceAsOf)}.
                        {savedBalance.unit === 'hours' ? ` At ${savedBalance.hoursPerDay} hours per workday.` : ''}
                        {balanceInDays !== null && balanceInDays > MAX_FAMILY_PTO ? ` This planner uses up to ${MAX_FAMILY_PTO} days.` : ''}
                        {balanceInDays !== null && balanceInDays < 0 ? ' The saved balance is negative.' : ''}
                        {committed.approvedDays || committed.tentativeDays ? ` That is after ${committed.approvedDays} approved and ${committed.tentativeDays} tentative tracked ${committed.approvedDays + committed.tentativeDays === 1 ? 'day' : 'days'}.` : ''}
                        {' '}Check what you can spend after balance changes.
                      </p>
                    </div>
                  )}
                  {budgetMessage && <p role="status" className="mt-2 text-xs text-muted">{budgetMessage}</p>}
                  <p className="mt-3 text-xs leading-5 text-muted">
                    {savedWeek?.some(Boolean) || savedSchedule?.altFridayStart ? 'Uses your saved work schedule and employer holidays for this calendar.' : 'Assumes you work Monday to Friday and uses employer holidays saved for this calendar.'}{' '}
                    <a href="/policy#requests" className={`link-mark ${FOCUS}`}>Set and save your work schedule in My PTO.</a>
                  </p>
                  {(workCalendarLoading || workCalendarDegraded) && (
                    <p role="status" className="mt-2 text-sm text-muted">
                      {workCalendarLoading ? 'Updating observed holidays for this planning window…' : 'Some holiday data is unavailable. This plan may overestimate the PTO you need.'}
                    </p>
                  )}
                </fieldset>

                <fieldset className="min-w-0 border-t border-line pt-5">
                  <legend className="float-left w-full text-base font-bold type-condensed text-ink">School calendar</legend>
                  <div className="clear-both flex flex-col gap-4 pt-3">
                    {presetsApply ? districtPicker : (
                      <p className="text-sm text-ink">
                        District presets cover {SCHOOL_DISTRICT_PRESETS.length} large US school districts only. Paste your school&apos;s calendar text or type the days off.
                      </p>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-ink">{presetsApply ? 'Add or correct dates' : 'Add your school’s dates'}</p>
                      <ImportSources
                        lead={presetsApply ? 'file' : 'text'}
                        schoolYearStart={schoolYearStart}
                        customDates={customOffDays}
                        onAddDates={addCustom}
                        onRemoveDate={(d) => setCustomOffDays((cur) => cur.filter((x) => x !== d))}
                        onClearDates={() => setCustomOffDays([])}
                        askLink={askLink}
                      />
                      {unknownDistrict && (
                        <p role="alert" className="mt-2 text-sm font-semibold text-error">
                          The district in this link isn&apos;t in the preset list any more. Pick one above or add the school&apos;s dates.
                        </p>
                      )}
                      {skippedParams.some((p) => p !== 'sd') && (
                        <p role="alert" className="mt-2 text-sm font-semibold text-error">
                          Some of this plan is too large to keep on reload ({skippedParams.filter((p) => p !== 'sd').map((p) => (p === 'x' ? 'switched-off breaks' : p === 'pp' ? 'shared days' : p)).join(', ')}). The page still uses it for this visit.
                        </p>
                      )}
                      {sdTooLong && (
                        <p role="alert" className="mt-2 text-sm font-semibold text-error">
                          That&apos;s more added dates than can be shared or kept on reload. The plan here uses them for this visit. Remove dates you don&apos;t need.
                        </p>
                      )}
                    </div>
                    {!presetsApply && (
                      <details id="family-us-presets" className="group border-b border-line" open={districtId ? true : undefined}>
                        <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                          <span className="text-[15px] font-semibold text-ink">US district presets</span>
                          <span aria-hidden="true" className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-ink group-open:bg-ink">
                            <span className="absolute h-[1.5px] w-2.5 bg-ink group-open:bg-white" />
                            <span className="absolute h-2.5 w-[1.5px] bg-ink group-open:hidden" />
                          </span>
                        </summary>
                        <div className="pb-4">{districtPicker}</div>
                      </details>
                    )}
                  </div>
                </fieldset>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-10 lg:gap-12">
              {received.invalid && (
                <p role="alert" className="rounded-[10px] border border-error bg-error-soft p-3 text-sm text-ink">The shared availability in this link is invalid or too large. Ask for a new link.</p>
              )}
              {initial.invalid.includes('sd') && (
                <p role="alert" className="rounded-[10px] border border-error bg-error-soft p-3 text-sm text-ink">The school dates in this link couldn&apos;t be read. Ask for a new link, or add the dates here.</p>
              )}
              {received.availability && (
                <OtherAdultNote availability={received.availability} plan={plan} />
              )}

              {!hasBreaks ? (
                <EmptyResults
                  hasOwnSchoolDates={hasOwnSchoolDates}
                  presetsApply={presetsApply}
                  ownDateSpan={hasOwnSchoolDates ? [schoolOffDays[0], schoolOffDays[schoolOffDays.length - 1]] : undefined}
                />
              ) : (
                <>
                  <section aria-labelledby="family-breaks-heading">
                    <h2 id="family-breaks-heading" className="text-h2 font-bold type-condensed text-ink">School breaks{exampleTag}</h2>
                    <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
                      <input type="checkbox" checked={prioritizeCoverage} onChange={event => {
                        setPrioritizeCoverage(event.target.checked);
                        track('family_coverage_priority_changed');
                      }} />
                      Cover school days first
                    </label>
                    <p className="text-xs text-muted">{prioritizeCoverage
                      ? 'Use PTO for the earliest listed closures that still need care. Confirmed cover from another adult frees up your PTO.'
                      : 'Use PTO for longer stretches of time with your kids.'}</p>
                    {ptoBudget === 0 ? (
                      <div role="status" className="mt-2 rounded-[10px] bg-surface-alt p-3 text-sm text-ink">
                        <p>PTO for school breaks is 0, so this plan only counts days you&apos;re already off. Add the PTO days you can spend to see which breaks are worth taking.</p>
                        <Button variant="quiet" size="sm" className="-ml-2.5 mt-1 min-h-11" onClick={() => focusField(PTO_INPUT_ID)}>Change PTO days</Button>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-muted">
                        {plural(plan.ptoUsed, 'PTO day')} used, {plan.ptoLeft} left of {ptoBudget}. Switch a break off to make its PTO available for other breaks.
                      </p>
                    )}
                    <ul className="mt-4 flex flex-col gap-2">
                      {plan.breaks.map((brk, i) => (
                        <BreakRow key={brk.id} brk={brk} plan={plan.plans[i]} onToggle={(include) => toggleBreak(brk.id, include)} />
                      ))}
                    </ul>
                  </section>

                  <CalendarSection
                    plan={plan}
                    weekStart={weekStartForCountry(country)}
                    today={today}
                    parentFreeSet={parentFreeSet}
                    holidayNames={holidayNames}
                    schoolLabels={schoolLabels}
                    otherAdultStatus={received.availability?.status}
                    headingSuffix={exampleTag}
                  />

                  <UncoveredSection plan={plan} schoolSources={schoolSources} calendarReady={calendarReady} isExample={isExample} />

                  <section aria-labelledby="family-export-heading">
                    <h2 id="family-export-heading" className="text-h2 font-bold type-condensed text-ink">Keep it</h2>
                    {isExample ? (
                      <>
                        <p className="mt-1 max-w-2xl text-sm text-muted">
                          The calendar file and share links are for your own plan, so they aren&apos;t offered for this example. Pick your district or add your school&apos;s dates first.
                        </p>
                        <Button className="mt-3" variant="secondary" onClick={() => focusField(DISTRICT_SEARCH_ID)}>Pick your district</Button>
                      </>
                    ) : <ExportRow plan={plan} calendarReady={calendarReady} publicPlanLink={publicPlanLink} />}
                  </section>

                  {!isExample && (
                    <FamilyShare
                      schoolDates={schoolOffDays}
                      availableDays={calendarReady ? plan.gaps.filter((g) => g.cover === 'you-off' || g.cover === 'pto').map((g) => g.date) : []}
                      freeDays={calendarReady ? plan.gaps.filter((g) => g.cover === 'you-off').map((g) => g.date) : []}
                      buildLink={shareLink}
                    />
                  )}
                </>
              )}

              <p className="text-base text-muted">
                Planning the rest of your time off too? <a href="/pto" className={`link-mark font-semibold ${FOCUS}`}>Plan time off &rarr;</a>
              </p>

              <FamilyFAQ />
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

function EmptyResults({ hasOwnSchoolDates, presetsApply, ownDateSpan }: {
  hasOwnSchoolDates: boolean;
  presetsApply: boolean;
  /** First and last school day off the person added, when none fall in the window. */
  ownDateSpan?: [string, string];
}) {
  if (hasOwnSchoolDates && ownDateSpan) {
    return (
      <section aria-labelledby="family-empty-heading" className="rounded-[10px] bg-surface-alt p-5 sm:p-6">
        <h2 id="family-empty-heading" className="text-h2 font-bold type-condensed text-ink">No school breaks in this window</h2>
        <p className="mt-3 max-w-2xl text-base text-ink">
          Your school dates run from {formatShortWithYear(ownDateSpan[0])} to {formatShortWithYear(ownDateSpan[1])}. Set &ldquo;Plan from&rdquo; to a date in that school year, or add dates for the year you&apos;re planning.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => focusField(START_INPUT_ID)}>Change the start date</Button>
          <Button variant="secondary" onClick={() => openFamilySource('family-source-type')}>Add more dates</Button>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="family-empty-heading" className="rounded-[10px] bg-surface-alt p-5 sm:p-6">
      <h2 id="family-empty-heading" className="text-h2 font-bold type-condensed text-ink">Start with the school calendar</h2>
      <p className="mt-3 max-w-2xl text-base text-ink">
        {presetsApply
          ? 'Your plan appears here as soon as there are school days off to plan around. Pick your district if it’s one of the presets, or add the dates from the school’s calendar.'
          : 'Your plan appears here as soon as there are school days off to plan around. Paste the school’s calendar text or type the dates.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {presetsApply && <Button variant="primary" onClick={() => focusField(DISTRICT_SEARCH_ID)}>Pick your district</Button>}
        <Button variant={presetsApply ? 'secondary' : 'primary'} onClick={() => openFamilySource('family-source-paste')}>Paste calendar text</Button>
        <Button variant="secondary" onClick={() => openFamilySource('family-source-type')}>Type dates</Button>
      </div>
      <p className="mt-4 text-sm text-muted">You can also upload the school&apos;s calendar file, use a photo of a printed calendar, or ask a co-parent to add the dates. School dates stay in this tab unless you choose to share them. Imported files stay on your device.</p>
    </section>
  );
}

function ExampleSummary({ plan, district, schoolYear, ptoBudget, prioritizeCoverage, onPickDistrict, onAddDates }: {
  plan: FamilyPlanResult;
  district: string;
  schoolYear: string;
  ptoBudget: number;
  prioritizeCoverage: boolean;
  onPickDistrict: () => void;
  onAddDates: () => void;
}) {
  return (
    <>
      <h1 className="text-h1 type-display text-ink">Line up your PTO with school breaks</h1>
      <p className="mt-3 max-w-2xl text-base text-muted">See which breaks to take off for the most days with your kids, and which school days off still need cover.</p>
      <section aria-labelledby="family-example-heading" className="mt-5 max-w-2xl rounded-[10px] border border-dashed border-line-strong bg-surface p-4 sm:p-5">
        <h2 id="family-example-heading" className="text-sm font-semibold text-ink">Example: {district} {schoolYearLabel(schoolYear)}</h2>
        <p className="mt-1.5 text-xl font-bold text-ink type-condensed sm:text-2xl">
          {prioritizeCoverage
            ? (plan.uncoveredDays.length > 0
              ? <><span className="mark">{plural(plan.uncoveredDays.length, 'school closure')}</span> still {plan.uncoveredDays.length === 1 ? 'needs' : 'need'} care.</>
              : <><span className="mark">No gaps</span> in the example closures.</>)
            : <><span className="mark">{plural(plan.togetherDaysTotal, 'day')} with the kids</span>{' '}{plan.ptoUsed > 0 ? <>for {plural(plan.ptoUsed, 'PTO day')}.</> : <>without using PTO.</>}</>}
        </p>
        <p className="mt-1.5 text-sm text-muted">
          This isn&apos;t your calendar yet. It uses this district&apos;s published closures and {plural(ptoBudget, 'PTO day')}, and updates as you change the controls. Pick your district or add your own dates.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onPickDistrict}>Pick your district</Button>
          <Button variant="secondary" onClick={onAddDates}>Add your own dates</Button>
        </div>
      </section>
    </>
  );
}

function BreakRow({ brk, plan, onToggle }: { brk: SchoolBreak; plan: FamilyBreakPlan; onToggle: (include: boolean) => void }) {
  const title = brk.label ?? (brk.schoolOffWeekdays.length === 1 ? 'Day off school' : 'School break');
  const range = formatCardDateRange(brk.start, brk.end);
  const included = !plan.excluded;
  const work = brk.parentWorkdays.length;
  const left = work - plan.ptoDays.length;
  let outcome: ReactNode;
  if (!included) outcome = <span className="text-muted">Switched off. {work ? `${plural(work, 'workday')} without your PTO.` : ''}</span>;
  else if (work === 0) outcome = <><span className="mark font-semibold">{plural(plan.togetherDays, 'day')} together</span> <span className="text-muted">· you&apos;re already off</span></>;
  else if (plan.ptoDays.length > 0) outcome = (
    <>
      <span className="font-semibold">{plural(plan.ptoDays.length, 'PTO day')}</span> &rarr;{' '}
      <span className="mark font-semibold">{plural(plan.togetherDays, 'day')} together</span>
      {plan.togetherStart && plan.togetherEnd && <span className="text-muted"> ({formatCardDateRange(plan.togetherStart, plan.togetherEnd)})</span>}
      {left > 0 && <span className="text-muted"> · {plural(left, 'workday')} without your PTO</span>}
    </>
  );
  else outcome = <span className="text-muted">No PTO planned. Taking the whole break off would use {plural(work, 'PTO day')}.{plan.togetherDays ? ` ${plural(plan.togetherDays, 'day')} together anyway.` : ''}</span>;

  return (
    <li className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-[10px] border bg-surface p-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center sm:p-4 ${included ? 'border-line' : 'border-dashed border-line-strong'}`}>
      <div className="min-w-0">
        <p className={`text-base font-bold ${included ? 'text-ink' : 'text-muted'}`}>{title}</p>
        <p className="text-sm text-muted">{range} · {plural(brk.schoolOffWeekdays.length, 'school day')} off, you work {work}</p>
      </div>
      <p className="col-span-2 row-start-2 min-w-0 text-sm text-ink sm:col-span-1 sm:col-start-2 sm:row-start-1">{outcome}</p>
      <label className="col-start-2 row-start-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink sm:col-start-3">
        <input type="checkbox" role="switch" className="h-4 w-4" checked={included} onChange={(e) => onToggle(e.target.checked)} aria-label={`Include ${title}, ${range}`} />
        <span aria-hidden="true">Include</span>
      </label>
    </li>
  );
}

function monthsOf(breaks: readonly SchoolBreak[]): string[] {
  const set = new Set<string>();
  for (const b of breaks) {
    for (let m = `${b.start.slice(0, 7)}-01`; m <= b.end; ) {
      set.add(m);
      const [y, mo] = m.split('-').map(Number);
      m = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    }
  }
  return [...set].sort();
}

function CalendarSection({
  plan, weekStart, today, parentFreeSet, holidayNames, schoolLabels, otherAdultStatus, headingSuffix = '',
}: {
  headingSuffix?: string;
  plan: FamilyPlanResult;
  weekStart: 0 | 1;
  today: string;
  parentFreeSet: ReadonlySet<string>;
  holidayNames: ReadonlyMap<string, string>;
  schoolLabels: Readonly<Record<string, string>>;
  otherAdultStatus?: PartnerAvailability['status'];
}) {
  const coverByDate = useMemo(() => new Map(plan.gaps.map((g) => [g.date, g.cover])), [plan.gaps]);
  const breakByDate = useMemo(() => {
    const map = new Map<string, SchoolBreak>();
    for (const b of plan.breaks) for (const d of rangeISO(b.start, b.end)) map.set(d, b);
    return map;
  }, [plan.breaks]);
  const months = useMemo(() => monthsOf(plan.breaks), [plan.breaks]);

  const stateFor = (iso: string): FamilyDayState => {
    const cover = coverByDate.get(iso);
    if (cover === 'you-off') return 'together';
    if (cover === 'pto') return 'pto';
    if (cover === 'other-adult' || cover === 'other-adult-proposed') return cover;
    if (cover === 'uncovered') return 'uncovered';
    if (breakByDate.has(iso) && parentFreeSet.has(iso)) return 'together';
    return parentFreeSet.has(iso) ? 'free' : 'none';
  };

  return (
    <section aria-labelledby="family-calendar-heading">
      <h2 id="family-calendar-heading" className="text-h2 font-bold type-condensed text-ink">On the calendar{headingSuffix}</h2>
      <FamilyLegend otherAdultStatus={otherAdultStatus} />
      <FamilyCalendar
        months={months}
        weekStart={weekStart}
        today={today}
        stateFor={stateFor}
        holidayNameFor={(iso) => holidayNames.get(iso)}
        labelFor={(iso) => schoolLabels[iso] ?? breakByDate.get(iso)?.label}
      />
    </section>
  );
}

function UncoveredSection({ plan, schoolSources, calendarReady, isExample = false }: {
  isExample?: boolean;
  plan: FamilyPlanResult;
  schoolSources: ReadonlyMap<string, string>;
  calendarReady: boolean;
}) {
  const uncovered = new Set(plan.uncoveredDays);
  const tentative = new Set(plan.gaps.filter(g => g.cover === 'other-adult-proposed').map(g => g.date));
  const reviewKey = !isExample && calendarReady && plan.gaps.length && !uncovered.size ? plan.gaps.map(g => `${g.date}:${g.cover}`).join(',') : null;
  const [confirmedReview, setConfirmedReview] = useState<string | null>(null);
  if (confirmedReview !== null && confirmedReview !== reviewKey) setConfirmedReview(null);
  const groups = plan.breaks
    .map((b) => ({ brk: b, days: b.schoolOffWeekdays.filter((d) => uncovered.has(d)) }))
    .filter((g) => g.days.length > 0);
  const otherCovered = plan.gaps.filter((g) => g.cover === 'other-adult').length;

  return (
    <section aria-labelledby="family-uncovered-heading">
      <h2 id="family-uncovered-heading" className="scroll-mt-24 text-h2 font-bold type-condensed text-ink">Uncovered school days{isExample ? ' (example)' : ''}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        These listed school closures still need confirmed care. Coverage is partial and uses only the closure dates in your plan.
      </p>
      {otherCovered > 0 && <p className="mt-2 text-sm text-ink">The other adult confirmed care for {plural(otherCovered, 'school day')}.</p>}
      {groups.length === 0 ? (
        <>
          <p className="mt-3 text-base font-semibold text-ink">No gaps found in the dates you added.</p>
          {reviewKey && (confirmedReview === reviewKey
            ? <p role="status" className="mt-2 text-sm text-ink">Coverage confirmed for these listed closures.</p>
            : <Button className="mt-3" variant="secondary" size="sm" onClick={() => {
              setConfirmedReview(reviewKey);
              track('family_listed_coverage_confirmed');
            }}>I&apos;ve confirmed care for these closures</Button>)}
        </>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line border-y border-line">
          {groups.map(({ brk, days }) => (
            <li key={brk.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink">{brk.label ?? 'School break'} · {formatCardDateRange(brk.start, brk.end)}</p>
                <ul className="mt-1 text-sm text-muted">
                  {days.map(date => <li key={date}>
                    <time dateTime={date}>{formatShortWithYear(date)}</time> · {schoolSources.get(date)}
                    {tentative.has(date) && ' · Other adult proposed'}
                  </li>)}
                </ul>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-ink">{plural(days.length, 'day')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExportRow({ plan, calendarReady, publicPlanLink }: { plan: FamilyPlanResult; calendarReady: boolean; publicPlanLink: () => string }) {
  const [message, setMessage] = useState('');
  const chosen = plan.breaks
    .map((b, i) => ({ start: b.start, end: b.end, label: b.label, ptoDays: plan.plans[i].ptoDays }))
    .filter((b) => b.ptoDays.length > 0);
  return (
    <>
      <p className="mt-1 max-w-2xl text-sm text-muted">The calendar file has one event per PTO day. The plan link includes your planning window, country, PTO budget and coverage preference. To include school dates or your availability, use Share with family below.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={chosen.length === 0 || !calendarReady} onClick={() => {
          try { downloadFamilyPtoICS(chosen); setMessage('Calendar file downloaded.'); } catch { setMessage('Could not create the calendar file.'); }
        }}>Add my PTO to calendar (.ics)</Button>
        <Button variant="secondary" onClick={async () => {
          const ok = await copyText(publicPlanLink());
          setMessage(ok ? 'Plan link copied.' : 'Could not copy. Try selecting the address bar.');
        }}>Copy plan link</Button>
        <span role="status" className="text-sm text-muted">{message}</span>
      </div>
    </>
  );
}

function OtherAdultNote({ availability, plan }: { availability: PartnerAvailability; plan: FamilyPlanResult | null }) {
  const covered = plan ? plan.gaps.filter((g) => g.cover === 'other-adult' || g.cover === 'other-adult-proposed').length : 0;
  // Their days that land on school days off you already cover (off anyway, or your PTO).
  const shared = new Set(availability.days);
  const overlapYours = plan ? plan.gaps.filter((g) => (g.cover === 'you-off' || g.cover === 'pto') && shared.has(g.date)).length : 0;
  const overlapNote = overlapYours > 0 ? ` ${plural(overlapYours, 'of their days falls', 'of their days fall')} on school days off you already cover.` : '';
  return (
    <section aria-labelledby="family-other-heading" className="rounded-[10px] border border-ink bg-surface p-4">
      <h2 id="family-other-heading" className="text-lg font-bold text-ink type-condensed">Another adult shared their days</h2>
      <p className="mt-1 text-sm text-ink">
        {plural(availability.days.length, 'date')}, {availability.status === 'confirmed' ? 'confirmed' : 'proposed'}.{' '}
        {plan ? (covered > 0
          ? `They ${availability.status === 'confirmed' ? 'cover' : 'could cover'} ${plural(covered, 'school day')} off that you'd otherwise have uncovered.${overlapNote}`
          : `They don’t cover any of your remaining uncovered school days.${overlapNote}`)
          : 'Add school dates to see which gaps they could cover.'}
      </p>
      <p className="mt-1 text-xs text-muted">Dates outside what they shared are unknown. Proposed dates still need confirmation.</p>
      <div className="mt-3"><ShareDatePreview title="See dates they shared" dates={availability.days} status={availability.status} freeDays={availability.freeDays} /></div>
    </section>
  );
}

function FamilyFAQ() {
  return (
    <section id="questions" aria-labelledby="family-questions-heading" className="scroll-mt-24">
      <h2 id="family-questions-heading" className="text-h2 font-bold type-condensed text-ink">Questions</h2>
      <div className="mt-3 flex max-w-3xl flex-col divide-y divide-line border-y border-line">
        {FAMILY_FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group">
            <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden ${FOCUS}`}>
              <h3 className="text-base font-semibold text-ink">{item.question}</h3>
              <span aria-hidden="true" className="shrink-0 text-xl leading-none text-ink group-open:rotate-45 motion-safe:transition-transform">+</span>
            </summary>
            <p className="max-w-prose pb-4 text-base leading-relaxed text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
