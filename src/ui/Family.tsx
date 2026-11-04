import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getConsumerHolidaysWithStatus as getHolidaysWithStatus } from '../personal/consumerHolidays';
import { buildSchoolCalendar } from '../personal/schoolCalendar';
import { MAX_FAMILY_PTO, planFamilyTime, type FamilyPlanResult, type SchoolBreak, type FamilyBreakPlan } from '../personal/familyPlan';
import { findDistrictPreset, presetLabels, presetOffDays } from '../content/schoolDistricts';
import type { PartnerAvailability } from '../planning/partner';
import { getPreloadedHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { formatCardDateRange, formatLong, formatShort, formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { CountrySelect } from './CountrySelect';
import { Button } from './Button';
import { getPrerenderedAt } from './prerenderedAt';
import { geolocateCountry } from './geo';
import { todayISO } from './useAppState';
import { weekStartForCountry } from './locale';
import { copyText } from './requestText';
import { downloadFamilyPtoICS } from './icsExport';
import { buildFamilyShareURL, encodeDateRanges, MAX_FAMILY_DATES_PARAM, readFamilyStateFromURL, writeFamilyStateToURL } from './familyUrlState';
import { FamilyCalendar, FamilyLegend, type FamilyDayState } from './FamilyCalendar';
import { DistrictPicker, ImportSources } from './FamilySources';
import { FamilyShare } from './FamilyShare';
import { FAMILY_FAQ_ITEMS } from './familyFaqItems';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * /family: plan PTO around school breaks. Modelled on /sabbatical - its own route, the same
 * holiday data and drawing language - answering two questions live, with no submit step:
 * which school breaks to take off for the most days with your kids within your PTO, and
 * which school days off are still uncovered. Every control round-trips through the URL
 * (familyUrlState.ts). School dates come from a sourced district preset and/or dates the
 * person adds (file, link, photo, pasted text, typed); everything is dates only.
 */
export function Family() {
  const prerenderedAt = useMemo(() => getPrerenderedAt(), []);
  const today = todayISO();
  const search = typeof window !== 'undefined' ? window.location.search : '';
  // Read once at mount, like /sabbatical (SSR-safe: prerendering has an empty search).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => readFamilyStateFromURL(search), []);
  const received = { availability: initial.availability ?? null, invalid: initial.invalid.includes('pp') || initial.invalid.includes('search') };

  const [country, setCountry] = useState<string>(() => initial.country ?? geolocateCountry());
  const [start, setStart] = useState(initial.start ?? today);
  const [ptoBudget, setPtoBudget] = useState(initial.ptoBudget);
  const [districtId, setDistrictId] = useState<string | undefined>(initial.districtId);
  const [customOffDays, setCustomOffDays] = useState<string[]>(initial.customOffDays);
  const [excludedBreaks, setExcludedBreaks] = useState<string[]>(initial.excludedBreaks);
  const ask = initial.ask;
  const [sendBackMessage, setSendBackMessage] = useState('');
  const [skippedParams, setSkippedParams] = useState<string[]>([]);

  const end = addDays(start, 364);

  const [holidayState, setHolidayState] = useState<{ holidays: Holiday[]; degraded: boolean }>(() => ({ holidays: getPreloadedHolidays(country), degraded: false }));
  useEffect(() => {
    let cancelled = false;
    getHolidaysWithStatus(country, start, end).then((result) => { if (!cancelled) setHolidayState(result); });
    return () => { cancelled = true; };
  }, [country, start, end]);

  // Every control in the link. pp (shared availability) is left exactly as received.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const skipped = writeFamilyStateToURL(url.searchParams, {
      country, start, defaultStart: today, ptoBudget, districtId, customOffDays, excludedBreaks, availability: initial.availability ?? null, ask,
    });
    setSkippedParams((cur) => (cur.join() === skipped.join() ? cur : skipped));
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [country, start, ptoBudget, districtId, customOffDays, excludedBreaks, ask, today, initial.availability]);

  const preset = districtId ? findDistrictPreset(districtId) : undefined;
  const schoolYearStart = preset
    ? Number(preset.schoolYear.slice(0, 4))
    : Number(start.slice(5, 7)) >= 7 ? Number(start.slice(0, 4)) : Number(start.slice(0, 4)) - 1;

  const schoolOffDays = useMemo(() => {
    const merged = [...(preset ? presetOffDays(preset) : []), ...customOffDays];
    if (merged.length === 0) return [];
    return buildSchoolCalendar({ manualOffDays: merged })?.offDays ?? [];
  }, [preset, customOffDays]);
  const schoolLabels = useMemo(() => (preset ? presetLabels(preset) : {}), [preset]);

  const holidayNames = useMemo(() => new Map(holidayState.holidays.map((h) => [h.date, h.name])), [holidayState.holidays]);
  const parentFreeDays = useMemo(
    () => rangeISO(start, end).filter((d) => !DEFAULT_WORK_WEEK[mondayIndexedDow(d)] || holidayNames.has(d)),
    [start, end, holidayNames],
  );
  const parentFreeSet = useMemo(() => new Set(parentFreeDays), [parentFreeDays]);
  const otherAdultDays = received.availability?.days;

  const plan: FamilyPlanResult | null = useMemo(
    () => (schoolOffDays.length ? planFamilyTime({ start, end, schoolOffDays, schoolLabels, parentFreeDays, ptoBudget, otherAdultDays, excludedBreaks }) : null),
    [start, end, schoolOffDays, schoolLabels, parentFreeDays, ptoBudget, otherAdultDays, excludedBreaks],
  );

  const hasSchoolDates = schoolOffDays.length > 0;
  const hasBreaks = !!plan && plan.breaks.length > 0;
  const sdTooLong = skippedParams.includes('sd') || encodeDateRanges(customOffDays).length > MAX_FAMILY_DATES_PARAM;
  const unknownDistrict = !!districtId && !preset;

  const addCustom = (dates: string[]) => setCustomOffDays((cur) => [...new Set([...cur, ...dates])].sort());
  const toggleBreak = (id: string, include: boolean) =>
    setExcludedBreaks((cur) => (include ? cur.filter((x) => x !== id) : [...new Set([...cur, id])].sort()));

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Shared links carry dates only, like the /pto partner link: never the sender's country,
  // so the person who opens one plans with their own country's holidays and weekends.
  const askLink = () => buildFamilyShareURL(origin, { customOffDays: [], ask: true });
  const sendBackLink = () => buildFamilyShareURL(origin, { districtId, customOffDays });
  const shareLink = ({ includeSchool, availability }: { includeSchool: boolean; availability?: PartnerAvailability }) =>
    buildFamilyShareURL(origin, { districtId: includeSchool ? districtId : undefined, customOffDays: includeSchool ? customOffDays : [], availability });

  const stepBtn = `flex h-11 w-11 shrink-0 items-center justify-center text-lg font-semibold text-ink transition-colors duration-150 hover:bg-surface-alt disabled:opacity-40 ${FOCUS}`;
  const numberInput = 'h-11 w-14 min-w-0 border-x border-line-strong bg-surface text-center text-base font-semibold text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
  const setBudget = (n: number) => setPtoBudget(Math.max(0, Math.min(MAX_FAMILY_PTO, Math.round(n))));

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="family" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pb-12 pt-6 sm:px-6 lg:pt-10">
          {ask && (
            <section aria-labelledby="family-ask-heading" className="mb-6 rounded-[4px] border-2 border-ink bg-surface p-4 sm:p-5">
              <h2 id="family-ask-heading" className="text-xl font-bold text-ink type-condensed">Someone asked you to add the school calendar</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink">
                Pick the school district below, or add the school&apos;s days off from a file, a photo, pasted text or by typing them. Then copy the link and send it back. The link carries only the dates.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={!hasSchoolDates} onClick={async () => {
                  try {
                    const ok = await copyText(sendBackLink());
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
            {plan && hasBreaks ? (
              <>
                <h1 className="text-h1 type-display text-ink">
                  <span className="mark">{plural(plan.togetherDaysTotal, 'day')} with your kids</span>{' '}
                  {plan.ptoUsed > 0 ? <>for {plural(plan.ptoUsed, 'PTO day')}.</> : <>without using PTO.</>}
                </h1>
                <p className="mt-3 text-base text-muted">
                  {plural(plan.breaks.length, 'school break')} between {formatLong(start)} and {formatLong(end)}.{' '}
                  {plan.uncoveredDays.length > 0
                    ? `${plural(plan.uncoveredDays.length, 'school day')} off still uncovered in the dates you added.`
                    : 'No gaps found in the dates you added.'}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-h1 type-display text-ink">Line up your PTO with school breaks</h1>
                <p className="mt-3 max-w-2xl text-base text-muted">
                  {hasSchoolDates
                    ? `None of the school dates you added fall between ${formatLong(start)} and ${formatLong(end)}. Move the start date or add dates for this school year.`
                    : 'Pick your school district or add your school’s days off. This shows which breaks to take off for the most days with your kids, and which school days off still need cover.'}
                </p>
              </>
            )}
            {prerenderedAt && plan && (
              <p className="mt-1 text-xs text-muted">Dates as of {formatShort(prerenderedAt.slice(0, 10))}; this page recomputes live once it loads.</p>
            )}
          </header>

          <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-12">
            <div className="min-w-0">
              <h2 className="sr-only">Your details and school calendar</h2>
              <div className="flex flex-col gap-6 rounded-[4px] border border-line bg-surface p-4 sm:p-5">
                <fieldset className="min-w-0">
                  <legend className="text-base font-bold type-condensed text-ink">You</legend>
                  <div className="mt-3 flex flex-col gap-4 sm:grid sm:grid-cols-3 lg:flex">
                    <CountrySelect country={country} onChangeCountry={setCountry} widthClass="w-full" />
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-ink" htmlFor="family-from">Plan from</label>
                      <input
                        id="family-from"
                        type="date"
                        value={start}
                        onChange={(e) => e.target.value && setStart(e.target.value)}
                        className={`mt-1.5 h-11 w-full min-w-0 rounded-[3px] border border-line-strong bg-surface px-3 text-base text-ink ${FOCUS}`}
                      />
                      <p className="mt-1 text-xs text-muted">Through {formatShortWithYear(end)}</p>
                    </div>
                    <div className="min-w-0">
                      <label className="block text-sm font-semibold text-ink" htmlFor="family-pto">PTO for school breaks</label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="inline-flex items-stretch overflow-hidden rounded-[3px] border border-line-strong bg-surface">
                          <button type="button" aria-label="One fewer PTO day" disabled={ptoBudget <= 0} onClick={() => setBudget(ptoBudget - 1)} className={stepBtn}>&minus;</button>
                          <input id="family-pto" type="number" min={0} max={MAX_FAMILY_PTO} step={1} value={ptoBudget} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setBudget(n); }} className={numberInput} />
                          <button type="button" aria-label="One more PTO day" disabled={ptoBudget >= MAX_FAMILY_PTO} onClick={() => setBudget(ptoBudget + 1)} className={stepBtn}>+</button>
                        </div>
                        <span className="text-sm text-muted">days</span>
                      </div>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="min-w-0 border-t border-line pt-5">
                  <legend className="float-left w-full text-base font-bold type-condensed text-ink">School calendar</legend>
                  <div className="clear-both flex flex-col gap-4 pt-3">
                    <DistrictPicker districtId={districtId} onChange={setDistrictId} />
                    <div>
                      <p className="text-sm font-semibold text-ink">Add or correct dates</p>
                      <ImportSources
                        schoolYearStart={schoolYearStart}
                        customDates={customOffDays}
                        onAddDates={addCustom}
                        onRemoveDate={(d) => setCustomOffDays((cur) => cur.filter((x) => x !== d))}
                        onClearDates={() => setCustomOffDays([])}
                        askLink={askLink}
                      />
                      {unknownDistrict && (
                        <p role="alert" className="mt-2 text-sm font-semibold text-ink">
                          The district in this link isn&apos;t in the preset list any more. Pick one above or add the school&apos;s dates.
                        </p>
                      )}
                      {skippedParams.some((p) => p !== 'sd') && (
                        <p role="alert" className="mt-2 text-sm font-semibold text-ink">
                          Some of this plan is too large to fit in the link ({skippedParams.filter((p) => p !== 'sd').map((p) => (p === 'x' ? 'switched-off breaks' : p === 'pp' ? 'shared days' : p)).join(', ')}). The page still uses it, but a copied link won&apos;t.
                        </p>
                      )}
                      {sdTooLong && (
                        <p role="alert" className="mt-2 text-sm font-semibold text-ink">
                          That&apos;s more added dates than a link can carry. The plan here uses all of them, but a copied link may not. Remove dates you don&apos;t need.
                        </p>
                      )}
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-10 lg:gap-12">
              {received.invalid && (
                <p role="alert" className="rounded-[4px] border border-ink p-3 text-sm text-ink">The shared availability in this link is invalid or too large. Ask for a new link.</p>
              )}
              {initial.invalid.includes('sd') && (
                <p role="alert" className="rounded-[4px] border border-ink p-3 text-sm text-ink">The school dates in this link couldn&apos;t be read. Ask for a new link, or add the dates here.</p>
              )}
              {received.availability && (
                <OtherAdultNote availability={received.availability} plan={plan} />
              )}

              {!hasBreaks ? (
                <EmptyResults hasSchoolDates={hasSchoolDates} />
              ) : (
                <>
                  <section aria-labelledby="family-breaks-heading">
                    <h2 id="family-breaks-heading" className="text-h2 font-bold type-condensed text-ink">School breaks</h2>
                    <p className="mt-1 text-sm text-muted">
                      {plural(plan.ptoUsed, 'PTO day')} used, {plan.ptoLeft} left of {ptoBudget}. Switch a break off and its days move to the others.
                    </p>
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
                    showOtherAdult={!!received.availability}
                  />

                  <UncoveredSection plan={plan} />

                  <section aria-labelledby="family-export-heading">
                    <h2 id="family-export-heading" className="text-h2 font-bold type-condensed text-ink">Keep it</h2>
                    <ExportRow plan={plan} />
                  </section>

                  <FamilyShare
                    schoolDayCount={schoolOffDays.length}
                    availableDays={plan.gaps.filter((g) => g.cover === 'you-off' || g.cover === 'pto').map((g) => g.date)}
                    freeDays={plan.gaps.filter((g) => g.cover === 'you-off').map((g) => g.date)}
                    buildLink={shareLink}
                  />
                </>
              )}

              <p className="text-base text-muted">
                Planning the rest of your time off too? <a href="/pto" className={`link-mark font-semibold ${FOCUS}`}>Plan PTO &rarr;</a>
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

function EmptyResults({ hasSchoolDates }: { hasSchoolDates: boolean }) {
  return (
    <section aria-labelledby="family-empty-heading" className="rounded-[4px] bg-surface-alt p-5 sm:p-6">
      <h2 id="family-empty-heading" className="text-h2 font-bold type-condensed text-ink">{hasSchoolDates ? 'No school breaks in this window' : 'Start with the school calendar'}</h2>
      <ul className="mt-3 flex max-w-2xl list-disc flex-col gap-1.5 pl-5 text-base text-ink">
        <li>Choose a district preset, if yours is listed.</li>
        <li>Or add the dates: upload the school&apos;s calendar file, take a photo of the printed calendar, paste the text, or type them.</li>
        <li>Or ask a co-parent to add them and send the link back.</li>
      </ul>
      <p className="mt-3 text-sm text-muted">Everything stays in this page and its link. Nothing is uploaded or saved.</p>
    </section>
  );
}

function BreakRow({ brk, plan, onToggle }: { brk: SchoolBreak; plan: FamilyBreakPlan; onToggle: (include: boolean) => void }) {
  const title = brk.label ?? (brk.schoolOffWeekdays.length === 1 ? 'Day off school' : 'School break');
  const range = formatCardDateRange(brk.start, brk.end);
  const included = !plan.excluded;
  const work = brk.parentWorkdays.length;
  const left = work - plan.ptoDays.length;
  let outcome: ReactNode;
  if (!included) outcome = <span className="text-muted">Switched off. {work ? `${plural(work, 'school day')} without cover from you.` : ''}</span>;
  else if (work === 0) outcome = <><span className="mark font-semibold">{plural(plan.togetherDays, 'day')} together</span> <span className="text-muted">· you&apos;re already off</span></>;
  else if (plan.ptoDays.length > 0) outcome = (
    <>
      <span className="font-semibold">{plural(plan.ptoDays.length, 'PTO day')}</span> &rarr;{' '}
      <span className="mark font-semibold">{plural(plan.togetherDays, 'day')} together</span>
      {plan.togetherStart && plan.togetherEnd && <span className="text-muted"> ({formatCardDateRange(plan.togetherStart, plan.togetherEnd)})</span>}
      {left > 0 && <span className="text-muted"> · {plural(left, 'day')} still uncovered</span>}
    </>
  );
  else outcome = <span className="text-muted">Not chosen: covering it takes {plural(work, 'PTO day')}.{plan.togetherDays ? ` ${plural(plan.togetherDays, 'day')} together anyway.` : ''}</span>;

  return (
    <li className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-[4px] border bg-surface p-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center sm:p-4 ${included ? 'border-line' : 'border-dashed border-line-strong'}`}>
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
  plan, weekStart, today, parentFreeSet, holidayNames, schoolLabels, showOtherAdult,
}: {
  plan: FamilyPlanResult;
  weekStart: 0 | 1;
  today: string;
  parentFreeSet: ReadonlySet<string>;
  holidayNames: ReadonlyMap<string, string>;
  schoolLabels: Readonly<Record<string, string>>;
  showOtherAdult: boolean;
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
    if (cover === 'other-adult') return 'other-adult';
    if (cover === 'uncovered') return 'uncovered';
    if (breakByDate.has(iso) && parentFreeSet.has(iso)) return 'together';
    return parentFreeSet.has(iso) ? 'free' : 'none';
  };

  return (
    <section aria-labelledby="family-calendar-heading">
      <h2 id="family-calendar-heading" className="text-h2 font-bold type-condensed text-ink">On the calendar</h2>
      <FamilyLegend showOtherAdult={showOtherAdult} />
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

function UncoveredSection({ plan }: { plan: FamilyPlanResult }) {
  const uncovered = new Set(plan.uncoveredDays);
  const groups = plan.breaks
    .map((b) => ({ brk: b, days: b.schoolOffWeekdays.filter((d) => uncovered.has(d)) }))
    .filter((g) => g.days.length > 0);
  const otherCovered = plan.gaps.filter((g) => g.cover === 'other-adult').length;

  return (
    <section aria-labelledby="family-uncovered-heading">
      <h2 id="family-uncovered-heading" className="text-h2 font-bold type-condensed text-ink">Uncovered school days</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        School is off, you&apos;re working and nobody else is covering. Coverage is partial: this only knows the school dates you added, and dates not listed aren&apos;t assumed to be school days.
      </p>
      {otherCovered > 0 && <p className="mt-2 text-sm text-ink">The other adult&apos;s shared days cover {plural(otherCovered, 'more school day')}.</p>}
      {groups.length === 0 ? (
        <p className="mt-3 text-base font-semibold text-ink">No gaps found in the dates you added.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line border-y border-line">
          {groups.map(({ brk, days }) => (
            <li key={brk.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <span className="min-w-0">
                <span className="block text-base font-semibold text-ink">{brk.label ?? 'School break'} · {formatCardDateRange(brk.start, brk.end)}</span>
                <span className="block text-sm text-muted">{days.map((d) => formatShort(d)).join(', ')}</span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-ink">{plural(days.length, 'day')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ExportRow({ plan }: { plan: FamilyPlanResult }) {
  const [message, setMessage] = useState('');
  const chosen = plan.breaks
    .map((b, i) => ({ start: b.start, end: b.end, label: b.label, ptoDays: plan.plans[i].ptoDays }))
    .filter((b) => b.ptoDays.length > 0);
  return (
    <>
      <p className="mt-1 max-w-2xl text-sm text-muted">The calendar file has one event per PTO day. The plan link reproduces this view, including your PTO number; to send only dates, use Share with family below.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={chosen.length === 0} onClick={() => {
          try { downloadFamilyPtoICS(chosen); setMessage('Calendar file downloaded.'); } catch { setMessage('Could not create the calendar file.'); }
        }}>Add my PTO to calendar (.ics)</Button>
        <Button variant="secondary" onClick={async () => {
          const ok = await copyText(window.location.href);
          setMessage(ok ? 'Plan link copied.' : 'Could not copy. Try selecting the address bar.');
        }}>Copy plan link</Button>
        <span role="status" className="text-sm text-muted">{message}</span>
      </div>
    </>
  );
}

function OtherAdultNote({ availability, plan }: { availability: PartnerAvailability; plan: FamilyPlanResult | null }) {
  const covered = plan ? plan.gaps.filter((g) => g.cover === 'other-adult').length : 0;
  // Their days that land on school days off you already cover (off anyway, or your PTO).
  const shared = new Set(availability.days);
  const overlapYours = plan ? plan.gaps.filter((g) => (g.cover === 'you-off' || g.cover === 'pto') && shared.has(g.date)).length : 0;
  const overlapNote = overlapYours > 0 ? ` ${plural(overlapYours, 'of their days falls', 'of their days fall')} on school days off you already cover.` : '';
  const first = availability.days[0];
  const last = availability.days[availability.days.length - 1];
  return (
    <section aria-labelledby="family-other-heading" className="rounded-[4px] border border-ink bg-surface p-4">
      <h2 id="family-other-heading" className="text-lg font-bold text-ink type-condensed">Another adult shared their days</h2>
      <p className="mt-1 text-sm text-ink">
        {plural(availability.days.length, 'date')} between {formatShortWithYear(first)} and {formatShortWithYear(last)}, {availability.status === 'confirmed' ? 'marked as confirmed' : 'proposed, not yet confirmed'}.{' '}
        {plan ? (covered > 0 ? `They cover ${plural(covered, 'school day')} off that you'd otherwise have uncovered.${overlapNote}` : `They don’t cover any of your remaining uncovered school days.${overlapNote}`) : 'Add school dates to see which gaps they cover.'}
      </p>
      <p className="mt-1 text-xs text-muted">Shown here as childcare cover only. Dates outside what they shared are unknown.</p>
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
