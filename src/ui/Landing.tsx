import { useEffect, useMemo, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { CountrySelect } from './CountrySelect';
import { YearStrip } from './YearStrip';
import { getHolidaysWithStatus, getPreloadedHolidays, type Holiday } from '../data/holidays';
import { getPrerenderedAt } from './prerenderedAt';
import { geolocateCountry } from './geo';
import { todayISO } from './useAppState';
import { addDays, mondayIndexedDow } from '../solver/dateUtils';
import { weekdayName } from './requestDeadline';
import { formatLong, formatShort } from './dateFormat';
import { downloadHolidaysICS } from './icsExport';
import { copyCanvasImage, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT } from './imageExport';
import { copyText } from './requestText';
import { COLORS } from './colorScheme';
import {
  daysBetween,
  daysOffRemainingThisYear,
  findBridges,
  longestDrySpell,
  longestStretchAhead,
  nextHoliday,
  remainingHolidays,
  runLength,
} from './landingData';
import { solve } from '../solver/solve';
import type { Break } from '../solver/types';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import { breakReason } from './breakReason';
import { bestPlacements, placementNote } from './sabbaticalData';
import holidayCoverage from '../data/holidayCoverage.json';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold tabular-nums leading-tight text-slate-900">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

/** A small, dependency-light day-by-day strip for one real break - not the full
 * Calendar/DayCell machinery (built for an interactive multi-month grid with many
 * required props this teaser doesn't need), but the same colour tokens, so it never
 * invents a treatment the real calendar doesn't have. */
function MiniBreakStrip({ brk, holidaySet }: { brk: Break; holidaySet: ReadonlySet<string> }) {
  return (
    <div className="flex flex-wrap gap-1" role="img" aria-label={`${formatShort(brk.start)} to ${formatShort(brk.end)}, ${brk.totalDaysOff} days off for ${brk.ptoCost} PTO day${brk.ptoCost === 1 ? '' : 's'}`}>
      {brk.days.map((d) => {
        const isHoliday = holidaySet.has(d);
        const isWeekend = mondayIndexedDow(d) >= 5;
        const isPto = !isHoliday && !isWeekend;
        return (
          <div
            key={d}
            className={`flex h-8 w-8 items-center justify-center rounded text-[11px] font-medium tabular-nums ${
              isPto ? `border ${COLORS.ptoBorder} ${COLORS.ptoBg} ${COLORS.ptoText}` : isHoliday ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'
            }`}
          >
            {Number(d.slice(8, 10))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Site restructure, Phase 3; rebuilt Phase 5. Useful on its own with zero input (country
 * is the only one, detected from locale) - answers "when do I next get a break" and hands
 * off to /pto or /sabbatical at the natural point a visitor would want to act.
 *
 * Fully reuses the existing holiday fetch/cache (getHolidaysWithStatus), the observed-date
 * field already on Holiday (date vs nominalDate), the .ics generator (downloadHolidaysICS),
 * the solver (solve), breakReason.ts, and sabbaticalData.ts's bestPlacements - every
 * section below shows the real product with real data, never a mock-up.
 */
export function Landing() {
  const prerenderedAt = useMemo(() => getPrerenderedAt(), []);
  const [country, setCountry] = useState<string>(() => geolocateCountry());
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const yearEnd = `${year}-12-31`;
  const stripEnd = addDays(today, 364);
  const fetchEnd = stripEnd > yearEnd ? stripEnd : yearEnd;

  // Phase 2: starts from this route's own prerendered embed (see holidays.ts's
  // getPreloadedHolidays) instead of an empty list - the countdown/stats/year strip and
  // the holiday list below are then real on first paint, not just after the fetch effect
  // resolves a tick later.
  const [holidayState, setHolidayState] = useState<{ holidays: Holiday[]; degraded: boolean }>(() => ({
    holidays: getPreloadedHolidays(country),
    degraded: false,
  }));
  useEffect(() => {
    let cancelled = false;
    getHolidaysWithStatus(country, today, fetchEnd).then((result) => {
      if (!cancelled) setHolidayState(result);
    });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on `country` alone, not `today`/`fetchEnd` - those are both
    // derived from `todayISO()` on every render and would otherwise re-trigger the fetch
    // on every re-render once the clock ticks past midnight mid-session, which the existing
    // holiday-fetch effect in useAppState.ts doesn't do either (it's keyed on the actual
    // rangeStart/rangeEnd state, not a live clock read).
  }, [country]);

  const holidaySet = useMemo(() => new Set(holidayState.holidays.map((h) => h.date)), [holidayState.holidays]);

  // 5A/K1 ("weekends are not news"): the NEXT PUBLIC HOLIDAY, not the next day off in
  // general - a plain Saturday used to lead the hero, which is never news.
  const nextHol = useMemo(() => nextHoliday(today, stripEnd, holidayState.holidays), [today, stripEnd, holidayState.holidays]);

  const daysOffLeft = daysOffRemainingThisYear(today, yearEnd, holidaySet);
  // 5G: "longest stretch ahead" now looks at the next 12 months (stripEnd), not to Dec 31 -
  // in late October, a Dec-31 horizon only ever sees the Christmas/New Year stretch, which
  // makes the stat read the same for weeks regardless of what's actually coming up sooner.
  // The 12-month rolling window is what the year strip right below it already shows, so the
  // two now agree on what "ahead" means.
  const stretch = longestStretchAhead(today, stripEnd, holidaySet);
  const dry = longestDrySpell(today, stripEnd, holidaySet);

  const bridges = useMemo(() => findBridges(today, stripEnd, holidaySet), [today, stripEnd, holidaySet]);

  const remaining = useMemo(() => remainingHolidays(today, yearEnd, holidayState.holidays), [today, yearEnd, holidayState.holidays]);
  const bridgeableHolidayDates = useMemo(
    () => new Set(remaining.filter((r) => r.runLength >= 3 || r.isBridgeable).map((r) => r.holiday.date)),
    [remaining],
  );

  const ptoHref = (date?: string) => `/pto?c=${encodeURIComponent(country)}${date ? `&p=${date}` : ''}`;

  // 5C "Optimize"/"Understand": one real solve() at a modest default budget, shared by
  // both sections so they describe the exact same plan rather than two unrelated ones.
  // A single solve() call costs roughly 100ms (see useAppState.ts's own comment on the
  // same function) - within budget on its own, computed via useMemo so it only re-runs
  // when the real inputs change, exactly like the interactive /pto page already does on
  // every slider move.
  const OPTIMIZE_BUDGET = 10;
  const optimizeResult = useMemo(() => {
    if (holidayState.holidays.length === 0) return null;
    return solve({
      offDays: holidayState.holidays.map((h) => h.date),
      rangeStart: today,
      rangeEnd: fetchEnd,
      budget: OPTIMIZE_BUDGET,
      country,
      workWeek: DEFAULT_WORK_WEEK,
    });
  }, [holidayState.holidays, today, fetchEnd, country]);
  const bestBreak = optimizeResult?.primary.slice().sort((a, b) => b.multiplier - a.multiplier)[0];
  const optimizeTotalDaysOff = optimizeResult?.primary.reduce((sum, b) => sum + b.totalDaysOff, 0) ?? 0;

  // 5C "Longer breaks": the exact Phase 3/4 sabbatical solver, a real 4-week placement
  // from today.
  const sabbaticalPlacements = useMemo(
    () => bestPlacements(today, stripEnd, 4, 5, 0, holidayState.holidays, country, DEFAULT_WORK_WEEK, today),
    [today, stripEnd, holidayState.holidays, country],
  );
  const bestSabbatical = sabbaticalPlacements.placements[0];

  // 5E: three MORE solve() calls (budgets 5/10/15) would add ~300ms on top of the
  // Optimize section's own call above - measured against useAppState.ts's documented
  // ~100ms-per-call figure, that's enough to be worth deferring off the initial render
  // rather than blocking first paint on a slow phone, per spec. Runs once, after mount;
  // starts empty (a skeleton, not a wrong number) and fills in a moment later.
  const [whatPtoBuys, setWhatPtoBuys] = useState<{ budget: number; totalDaysOff: number }[] | null>(null);
  useEffect(() => {
    if (holidayState.holidays.length === 0) return;
    const offDays = holidayState.holidays.map((h) => h.date);
    const id = window.setTimeout(() => {
      const budgets = [5, 10, 15];
      setWhatPtoBuys(
        budgets.map((budget) => {
          const result = solve({ offDays, rangeStart: today, rangeEnd: fetchEnd, budget, country, workWeek: DEFAULT_WORK_WEEK });
          return { budget, totalDaysOff: result.primary.reduce((sum, b) => sum + b.totalDaysOff, 0) };
        }),
      );
    }, 0);
    return () => window.clearTimeout(id);
  }, [holidayState.holidays, today, fetchEnd, country]);

  const exportImage = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_IMAGE_WIDTH;
    canvas.height = SHARE_IMAGE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      nextHol ? `Your next holiday is ${nextHol.holiday.name}, ${nextHol.daysAway} days away.` : 'Make every PTO day count.',
      48,
      110,
    );
    ctx.font = '400 24px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    if (nextHol) {
      ctx.fillText(`${weekdayName(nextHol.holiday.date)}, ${formatLong(nextHol.holiday.date)}`, 48, 150);
    }
    ctx.font = '400 15px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(window.location.host, 48, SHARE_IMAGE_HEIGHT - 32);
    await copyCanvasImage(canvas, 'days-off.png');
  };

  const [linkMessage, setLinkMessage] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader active="landing" />
      <main>
        <Container className="flex flex-col gap-10 px-4 py-10">
          {/* 5A. Hero. The core promise appears here, once, as the h1, and nowhere else
              on the site. The country selector is the page's only input, embedded in a
              sentence rather than a bare label above the headline. */}
          <section className="flex flex-col gap-4">
            <h1 className="m-0 max-w-2xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">Make every PTO day count.</h1>
            <p className="max-w-2xl text-lg text-slate-600">See every day off coming, then turn your PTO into longer breaks.</p>

            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 px-2.5 py-1">Free, no sign-up</span>
              <span className="rounded-full border border-slate-200 px-2.5 py-1">{holidayCoverage.countriesWithData} countries</span>
              <span className="rounded-full border border-slate-200 px-2.5 py-1">Your plan never leaves your browser</span>
            </div>

            <p className="text-sm text-slate-600">
              Showing holidays for{' '}
              <span className="inline-flex w-44 align-middle">
                <CountrySelect country={country} onChangeCountry={setCountry} />
              </span>
            </p>

            {/* Hero visual: the live tool with real data - the next real public holiday,
                never a plain weekend (K1/5A "weekends are not news"). When none falls in
                the next 12 months, leads with the gap itself instead. */}
            {holidayState.holidays.length === 0 ? (
              <p className="text-lg text-slate-500">Loading your next holiday&hellip;</p>
            ) : nextHol ? (
              <div>
                <p className="text-2xl font-semibold tabular-nums leading-snug text-slate-900 sm:text-3xl">
                  Your next holiday is {nextHol.holiday.name}, {nextHol.daysAway} day{nextHol.daysAway === 1 ? '' : 's'} away.
                </p>
                <p className="mt-1 text-lg text-slate-600">
                  {weekdayName(nextHol.holiday.date)}, {formatLong(nextHol.holiday.date)}
                  {nextHol.runLength > 1 ? ` — already a ${nextHol.runLength}-day break.` : '.'}
                  {nextHol.bridge
                    ? ` One PTO day on ${weekdayName(nextHol.bridge.bridgeDate)} makes it ${runLength(nextHol.bridge.combined)} days.`
                    : ''}
                </p>
              </div>
            ) : (
              <p className="text-2xl font-semibold tabular-nums leading-snug text-slate-900 sm:text-3xl">
                No public holiday for {dry ? runLength(dry) : daysBetween(today, stripEnd)} days
                {dry ? `, the longest stretch until ${formatLong(addDays(dry.end, 1))}.` : '.'}
              </p>
            )}

            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <Stat value={String(daysOffLeft)} label="Days off left this year" />
              <Stat value={stretch ? `${runLength(stretch)}` : '—'} label="Longest stretch ahead (days)" />
              <Stat value={dry ? `${runLength(dry)}` : '—'} label="Longest dry spell (days)" />
            </div>

            <a
              href={ptoHref()}
              className="w-fit rounded-md bg-[var(--pto-bg,#1e3a8a)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--focus-ring,#1e3a8a)]"
            >
              Plan my time off &rarr;
            </a>

            {prerenderedAt && (
              <p className="text-xs text-slate-400">
                Dates above as of {formatShort(prerenderedAt.slice(0, 10))} — this page recomputes live once it loads in your browser.
              </p>
            )}
          </section>

          {/* 5B. Year strip - the one memorable visual. */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">The next 12 months</h2>
            <YearStrip today={today} stripEnd={stripEnd} holidays={holidayState.holidays} bridgeableHolidayDates={bridgeableHolidayDates} />
          </section>

          {/* 5C. Optimize. */}
          <section className="border-t border-slate-200 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optimize</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Turn {OPTIMIZE_BUDGET} days into {optimizeTotalDaysOff || '—'}.
            </h2>
            <p className="mt-1 max-w-prose text-sm text-slate-600">
              The optimizer finds which days to take so a small PTO budget buys the most time off, every time - not a rule of thumb, a
              real calculation against this year's actual calendar.
            </p>
            {bestBreak ? (
              <div className="mt-3">
                <MiniBreakStrip brk={bestBreak} holidaySet={holidaySet} />
                <p className="mt-2 text-sm text-slate-600">
                  {formatShort(bestBreak.start)}–{formatShort(bestBreak.end)}: {bestBreak.ptoCost} PTO day{bestBreak.ptoCost === 1 ? '' : 's'} buys{' '}
                  {bestBreak.totalDaysOff} days off ({bestBreak.multiplier.toFixed(1)}x).
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Loading&hellip;</p>
            )}
            <a href={ptoHref()} className="mt-3 inline-block text-sm font-medium text-[var(--pto-bg,#1e3a8a)] underline">
              PTO Optimizer &rarr;
            </a>
          </section>

          {/* 5C. Understand. */}
          <section className="border-t border-slate-200 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Understand</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Know why each date was chosen.</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-600">
              Every suggested day comes with the real reason it was picked - a bridge, a quiet travel window, an efficient swap - never
              just a highlighted square.
            </p>
            {bestBreak ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium tabular-nums text-slate-900">
                  {formatShort(bestBreak.start)}–{formatShort(bestBreak.end)}
                </p>
                <p className="mt-1 text-sm text-slate-600">{breakReason(bestBreak, (iso) => holidayState.holidays.find((h) => h.date === iso)?.name)}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Loading&hellip;</p>
            )}
          </section>

          {/* 5C. Longer breaks. */}
          <section className="border-t border-slate-200 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Longer breaks</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Place a sabbatical where it buys the most time.</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-600">
              A few weeks off is a different planning problem than a handful of PTO days - the same search, run once, shows where a
              longer break sits best.
            </p>
            {bestSabbatical ? (
              <p className="mt-3 text-sm text-slate-700">
                {formatShort(bestSabbatical.start)}: {placementNote(bestSabbatical)}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No placement found in the next 12 months.</p>
            )}
            <a href="/sabbatical" className="mt-3 inline-block text-sm font-medium text-[var(--pto-bg,#1e3a8a)] underline">
              Sabbatical Planning &rarr;
            </a>
          </section>

          {/* 5C. Your calendar. */}
          <section className="border-t border-slate-200 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your calendar</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Export, share, or request it.</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-600">Free, no sign-up, no email.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportImage}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Copy as image
              </button>
              <button
                type="button"
                onClick={() => downloadHolidaysICS(holidayState.holidays)}
                disabled={holidayState.holidays.length === 0}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download all holidays (.ics)
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await copyText(window.location.href);
                  setLinkMessage(ok ? 'Copied!' : 'Could not copy - try selecting the address bar');
                  setTimeout(() => setLinkMessage(null), 2000);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Copy link
              </button>
              {linkMessage && <span className="text-sm text-slate-500">{linkMessage}</span>}
            </div>
          </section>

          {/* 5D. Every remaining day off. */}
          <section className="border-t border-slate-200 pt-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Every remaining day off this year</h2>
            {remaining.length === 0 ? (
              <p className="text-sm text-slate-500">
                {holidayState.degraded
                  ? "Couldn't reach public holiday data right now — try again shortly."
                  : /* K5: these were literal HTML-entity text ("&rsquo;", "&hellip;") inside a
                       JS string inside JSX, which renders the literal characters, not a real
                       apostrophe/ellipsis - confirmed in dist/index.html as the double-escaped
                       "&amp;rsquo;". Real Unicode characters below instead. */
                    'Loading the rest of the year’s holidays…'}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-slate-100 p-0 text-sm">
                {remaining.map((r) => (
                  <li key={r.holiday.date} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium tabular-nums text-slate-900">{formatLong(r.holiday.date)}</span>
                      <span className="text-slate-500">{r.weekday}</span>
                      <span className="text-slate-700">{r.holiday.name}</span>
                      {r.isObserved && <span className="text-xs text-slate-400">(observed)</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      <span className="tabular-nums">{r.daysAway} days away</span>
                      <span className="tabular-nums">
                        {r.runLength} day{r.runLength === 1 ? '' : 's'} off
                      </span>
                      {r.isBridgeable &&
                        (() => {
                          const bridge = bridges.find((b) => b.combined.start === r.run.start || b.combined.end === r.run.end);
                          return bridge ? (
                            <a href={ptoHref(bridge.bridgeDate)} className="font-medium text-[var(--pto-bg,#1e3a8a)] underline">
                              Take {weekdayName(bridge.bridgeDate)} for a {runLength(bridge.combined)}-day weekend &middot; 1 PTO day
                            </a>
                          ) : null;
                        })()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 5E. What a few PTO days would buy. */}
          <section className="border-t border-slate-200 pt-6">
            <h2 className="mb-1 text-sm font-semibold text-slate-700">What a few PTO days would buy</h2>
            {whatPtoBuys ? (
              <p className="max-w-prose text-base text-slate-700">
                {whatPtoBuys.map((w, i) => (
                  <span key={w.budget}>
                    {i > 0 ? ' ' : ''}
                    With {w.budget} PTO day{w.budget === 1 ? '' : 's'} you&rsquo;d get{' '}
                    <a href={`${ptoHref()}&b=${w.budget}`} className="font-medium text-[var(--pto-bg,#1e3a8a)] underline">
                      {w.totalDaysOff} days off
                    </a>
                    .
                  </span>
                ))}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Calculating&hellip;</p>
            )}
          </section>

          {/* 5F. Closing CTA. The core promise is the h1 above, once - this heading is
              deliberately different text, not a repeat of it. */}
          <section className="flex flex-col items-start gap-3 border-t border-slate-200 pt-6">
            <h2 className="text-xl font-semibold text-slate-900">Ready to see your own plan?</h2>
            <a
              href={ptoHref()}
              className="w-fit rounded-md bg-[var(--pto-bg,#1e3a8a)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--focus-ring,#1e3a8a)]"
            >
              Plan my time off &rarr;
            </a>
          </section>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
