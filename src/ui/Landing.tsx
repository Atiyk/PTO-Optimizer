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
import { addDays } from '../solver/dateUtils';
import { weekdayName } from './requestDeadline';
import { formatLong, formatShort } from './dateFormat';
import { downloadHolidaysICS } from './icsExport';
import { copyCanvasImage, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT } from './imageExport';
import {
  daysBetween,
  daysOffRemainingThisYear,
  findBridges,
  longestDrySpell,
  longestStretchAhead,
  nextDayOff,
  remainingHolidays,
  runLength,
} from './landingData';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold tabular-nums leading-tight text-slate-900">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

/**
 * Site restructure, Phase 3: the landing page. Useful on its own with zero input (country
 * is the only one, detected from locale) - answers "when do I next get a break" and hands
 * off to /pto or /sabbatical at the natural point a visitor would want to act.
 *
 * Fully reuses the existing holiday fetch/cache (getHolidaysWithStatus), the observed-date
 * field already on Holiday (date vs nominalDate), and the .ics generator
 * (downloadHolidaysICS, itself built on icsExport.ts's own RFC 5545 helpers) - imported
 * above, never reimplemented.
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

  const nextOff = nextDayOff(today, holidaySet);
  const nextOffHoliday = nextOff ? holidayState.holidays.find((h) => h.date === nextOff) : undefined;
  const nextOffDaysAway = nextOff ? daysBetween(today, nextOff) : undefined;

  const daysOffLeft = daysOffRemainingThisYear(today, yearEnd, holidaySet);
  const stretch = longestStretchAhead(today, yearEnd, holidaySet);
  const dry = longestDrySpell(today, yearEnd, holidaySet);

  const bridges = useMemo(() => findBridges(today, stripEnd, holidaySet), [today, stripEnd, holidaySet]);
  const nearestBridge = bridges[0];

  const remaining = useMemo(() => remainingHolidays(today, yearEnd, holidayState.holidays), [today, yearEnd, holidayState.holidays]);
  const bridgeableHolidayDates = useMemo(
    () => new Set(remaining.filter((r) => r.runLength >= 3 || r.isBridgeable).map((r) => r.holiday.date)),
    [remaining],
  );

  const ptoHref = (date?: string) => `/pto?c=${encodeURIComponent(country)}${date ? `&p=${date}` : ''}`;

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
      nextOff ? `Your next day off is in ${nextOffDaysAway} day${nextOffDaysAway === 1 ? '' : 's'}.` : 'Your next day off',
      48,
      110,
    );
    ctx.font = '400 24px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    if (nextOff) {
      ctx.fillText(`${weekdayName(nextOff)}, ${formatLong(nextOff)}${nextOffHoliday ? ` — ${nextOffHoliday.name}` : ''}`, 48, 150);
    }
    ctx.font = '400 15px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(window.location.host, 48, SHARE_IMAGE_HEIGHT - 32);
    await copyCanvasImage(canvas, 'days-off.png');
  };

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader active="landing" />
      <main>
        <Container className="flex flex-col gap-10 px-4 py-10">
          {/* 1. The countdown - the hero, largest type on the site. The core promise
              appears here, once, as the h1, and nowhere else on the site. */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h1 className="m-0 max-w-2xl text-4xl font-bold leading-tight tabular-nums text-slate-900 sm:text-5xl">
                Make every PTO day count.
              </h1>
              <div className="w-48 shrink-0">
                <CountrySelect country={country} onChangeCountry={setCountry} />
              </div>
            </div>

            {nextOff ? (
              <div>
                <p className="text-2xl font-semibold tabular-nums leading-snug text-slate-900 sm:text-3xl">
                  Your next day off is in {nextOffDaysAway} day{nextOffDaysAway === 1 ? '' : 's'}.
                </p>
                <p className="mt-1 text-lg text-slate-600">
                  {weekdayName(nextOff)}, {formatLong(nextOff)}
                  {nextOffHoliday ? ` — ${nextOffHoliday.name}` : ''}
                </p>
              </div>
            ) : (
              <p className="text-lg text-slate-500">Loading your next day off&hellip;</p>
            )}

            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <Stat value={String(daysOffLeft)} label="Days off left this year" />
              <Stat value={stretch ? `${runLength(stretch)}` : '—'} label="Longest stretch ahead (days)" />
              <Stat value={dry ? `${runLength(dry)}` : '—'} label="Longest dry spell (days)" />
            </div>

            {prerenderedAt && (
              <p className="text-xs text-slate-400">
                Dates above as of {formatShort(prerenderedAt.slice(0, 10))} — this page recomputes live once it loads in your browser.
              </p>
            )}
          </section>

          {/* 2. Year strip - the one memorable visual. */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">The next 12 months</h2>
            <YearStrip today={today} stripEnd={stripEnd} holidays={holidayState.holidays} bridgeableHolidayDates={bridgeableHolidayDates} />
          </section>

          {/* 3. The hand-offs. */}
          <section className="flex flex-col gap-2 border-t border-slate-200 pt-6">
            {nearestBridge ? (
              <>
                <p className="text-base text-slate-700">
                  One PTO day on {weekdayName(nearestBridge.bridgeDate)} {formatLong(nearestBridge.bridgeDate)} makes it a{' '}
                  {runLength(nearestBridge.combined)}-day weekend.
                </p>
                <a
                  href={ptoHref(nearestBridge.bridgeDate)}
                  className="w-fit rounded-md bg-[var(--pto-bg,#1e3a8a)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--focus-ring,#1e3a8a)]"
                >
                  Plan my time off &rarr;
                </a>
              </>
            ) : (
              <a
                href={ptoHref()}
                className="w-fit rounded-md bg-[var(--pto-bg,#1e3a8a)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                Plan my time off &rarr;
              </a>
            )}
            <p className="mt-4 text-sm text-slate-500">
              Taking a longer break? <a href="/sabbatical" className="underline hover:text-slate-700">Sabbatical Planning &rarr;</a>
            </p>
          </section>

          {/* 4. Every remaining day off. */}
          <section className="border-t border-slate-200 pt-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Every remaining day off this year</h2>
            {remaining.length === 0 ? (
              <p className="text-sm text-slate-500">
                {holidayState.degraded
                  ? "Couldn't reach public holiday data right now — try again shortly."
                  : 'Loading the rest of the year&rsquo;s holidays&hellip;'}
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
                      <span className="tabular-nums">{r.runLength} day{r.runLength === 1 ? '' : 's'} off</span>
                      {r.isBridgeable && (
                        <a href={ptoHref(r.holiday.date)} className="font-medium text-[var(--pto-bg,#1e3a8a)] underline">
                          Bridge it &rarr;
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 5. Exports. */}
          <section className="flex flex-wrap gap-2 border-t border-slate-200 pt-6">
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
          </section>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
