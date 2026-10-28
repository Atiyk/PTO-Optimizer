import { useEffect, useMemo, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { CountrySelect } from './CountrySelect';
import { Calendar } from './Calendar';
import { getHolidaysWithStatus, getPreloadedHolidays, type Holiday } from '../data/holidays';
import { getPrerenderedAt } from './prerenderedAt';
import { geolocateCountry } from './geo';
import { todayISO } from './useAppState';
import { addDays, mondayIndexedDow } from '../solver/dateUtils';
import { formatLong, formatShort } from './dateFormat';
import { DEFAULT_WORK_WEEK } from '../solver/types';
import { isOffDay } from './landingData';
import type { DayCategory } from './types';
import { bestPlacements, placementNote, paddedCalendarRange, type SabbaticalPlacement } from './sabbaticalData';

const LENGTH_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

/**
 * Site restructure, Phase 4: /sabbatical. A distinct experience from /pto - placing ONE
 * contiguous block once, not spending a budget across many breaks - built from the same
 * underlying pieces (holiday fetch, the calendar component, date arithmetic) rather than
 * the optimizer with different labels.
 */
export function Sabbatical() {
  const prerenderedAt = useMemo(() => getPrerenderedAt(), []);
  const [country, setCountry] = useState<string>(() => geolocateCountry());
  const today = todayISO();
  const [eligibleFrom, setEligibleFrom] = useState(today);
  const [lengthWeeks, setLengthWeeks] = useState(4);
  const [ptoToAdd, setPtoToAdd] = useState(5);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 3A: 12 months from the eligible date - consistent with the committed holiday data's
  // own range (scripts/build-holidays.ts fetches the current year plus the next two).
  const horizonEnd = addDays(eligibleFrom, 364);

  // Phase 2: starts from this route's own prerendered embed (getPreloadedHolidays)
  // instead of an empty list - this is exactly what fixes K1's "all three placements are
  // identical, 30 days away, no holidays inside" on the server-rendered HTML, since
  // bestPlacements() below now has real holidays to rank by on the very first render.
  const [holidayState, setHolidayState] = useState<{ holidays: Holiday[]; degraded: boolean }>(() => ({
    holidays: getPreloadedHolidays(country),
    degraded: false,
  }));
  useEffect(() => {
    let cancelled = false;
    getHolidaysWithStatus(country, eligibleFrom, horizonEnd).then((result) => {
      if (!cancelled) setHolidayState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [country, eligibleFrom]);

  const holidaySet = useMemo(() => new Set(holidayState.holidays.map((h) => h.date)), [holidayState.holidays]);

  // 3A/3B: ranking now uses the SAME ptoToAdd (and the SAME today floor) the hero and
  // calendar use below - the headline and the cards can no longer disagree, because
  // there is only one extendSabbatical call per placement, not two different budgets.
  const { placements, anyHolidayInAnyCandidate } = useMemo(
    () => bestPlacements(eligibleFrom, horizonEnd, lengthWeeks, ptoToAdd, holidayState.holidays, country, DEFAULT_WORK_WEEK, today),
    [eligibleFrom, horizonEnd, lengthWeeks, ptoToAdd, holidayState.holidays, country, today],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [eligibleFrom, lengthWeeks, country]);

  const selected: SabbaticalPlacement | undefined = placements[selectedIndex] ?? placements[0];

  const coreSet = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>();
    for (let d = selected.start; d <= selected.coreEnd; d = addDays(d, 1)) set.add(d);
    return set;
  }, [selected]);

  // Every day in the extended range outside the core block - a MIX of days that were
  // already off (absorbed for free) and working days PTO was actually spent on. Only the
  // latter should render as 'suggested-pto' (a day the user is taking); the former are
  // still plain weekends/holidays that simply happened to sit inside the wider range.
  const extendedRangeSet = useMemo(() => {
    const set = new Set<string>();
    if (!selected) return set;
    for (let d = selected.extendedStart; d < selected.start; d = addDays(d, 1)) set.add(d);
    for (let d = addDays(selected.coreEnd, 1); d <= selected.extendedEnd; d = addDays(d, 1)) set.add(d);
    return set;
  }, [selected]);

  const ptoSpentSet = useMemo(
    () => new Set([...extendedRangeSet].filter((d) => !isOffDay(d, holidaySet))),
    [extendedRangeSet, holidaySet],
  );

  // 3D/K3e: every month the trip (selected.extendedStart..extendedEnd, not just the core
  // block) touches, plus one month of context either side - previously rangeStart was the
  // core block's own start, so PTO days extending backward never rendered at all.
  const calendarRange = useMemo(() => {
    if (!selected) return null;
    return paddedCalendarRange(selected.extendedStart, selected.extendedEnd);
  }, [selected]);

  const categoryOf = (iso: string): DayCategory => {
    if (coreSet.has(iso)) return 'pinned';
    if (ptoSpentSet.has(iso)) return 'suggested-pto';
    if (holidaySet.has(iso)) return 'public-holiday';
    const mondayIndexed = mondayIndexedDow(iso); // 0=Mon .. 6=Sun
    if (mondayIndexed === 5 || mondayIndexed === 6) return 'weekend';
    return 'working';
  };

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader active="sabbatical" />
      <header>
        <div className="border-b border-slate-200 bg-slate-50">
          <Container className="flex flex-wrap items-end gap-4 px-4 py-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="sabbatical-country">
                Country
              </label>
              <div className="w-40" id="sabbatical-country">
                <CountrySelect country={country} onChangeCountry={setCountry} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="sabbatical-length">
                Sabbatical length
              </label>
              <select
                id="sabbatical-length"
                value={lengthWeeks}
                onChange={(e) => setLengthWeeks(Number(e.target.value))}
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
              >
                {LENGTH_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    {w} week{w === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="sabbatical-from">
                Eligible from
              </label>
              <input
                id="sabbatical-from"
                type="date"
                value={eligibleFrom}
                onChange={(e) => e.target.value && setEligibleFrom(e.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
              />
            </div>
            <div className="flex min-w-[220px] flex-1 flex-col gap-1">
              <label className="flex items-baseline justify-between text-xs font-semibold text-slate-700" htmlFor="sabbatical-pto">
                PTO days to add
                <span className="tabular-nums text-slate-500">{ptoToAdd}</span>
              </label>
              <input
                id="sabbatical-pto"
                type="range"
                min={0}
                max={15}
                step={1}
                value={ptoToAdd}
                onChange={(e) => setPtoToAdd(Number(e.target.value))}
                className="w-full accent-slate-800"
              />
            </div>
          </Container>
        </div>

        {selected ? (
          <Container className="px-4 py-6">
            {/* 3B: the SAME totalAwayDays the selected card shows - previously this read
                extended.start/end from a second, independently-ptoToAdd'd extendSabbatical
                call, so it could (and did) disagree with the card. Now there is only one
                number, computed once, inside bestPlacements. */}
            <p className="text-2xl font-bold tabular-nums leading-snug text-slate-900 sm:text-3xl">
              Take it from {formatLong(selected.start)} and you&apos;re away for {selected.totalAwayDays} consecutive days.
            </p>
            <p className="mt-1 text-sm tabular-nums text-slate-600">
              {lengthWeeks} week{lengthWeeks === 1 ? '' : 's'} of sabbatical
              {selected.ptoBefore ? ` + ${selected.ptoBefore} PTO day${selected.ptoBefore === 1 ? '' : 's'} before` : ''}
              {selected.ptoAfter ? ` + ${selected.ptoAfter} PTO day${selected.ptoAfter === 1 ? '' : 's'} after` : ''}
              {selected.holidayNames.length ? ` + ${selected.holidayNames.length} public holiday${selected.holidayNames.length === 1 ? '' : 's'} inside` : ''}.
            </p>
            {prerenderedAt && (
              <p className="mt-1 text-xs text-slate-400">
                Dates above as of {formatShort(prerenderedAt.slice(0, 10))} — this page recomputes live once it loads in your browser.
              </p>
            )}
          </Container>
        ) : (
          <Container className="px-4 py-6">
            <p className="text-sm text-slate-500">Loading placements&hellip;</p>
          </Container>
        )}
      </header>

      <main>
        <Container className="flex flex-col gap-8 p-4">
          {/* 1. Best placements. */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Best placements</h2>
            {/* 3A: said once, here, rather than on every card - a card with no holidays
                inside next to one that has some would otherwise read as a missing feature
                rather than an honest "no holiday happens to fall in THIS window." */}
            {!anyHolidayInAnyCandidate && placements.length > 0 && (
              <p className="mb-2 text-xs text-slate-500">
                No window in the next year puts a public holiday inside a {lengthWeeks}-week block. These are ranked by what sits next to
                it instead.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {placements.map((p, i) => (
                <button
                  key={p.start}
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  aria-pressed={i === selectedIndex}
                  className={`flex-1 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    i === selectedIndex ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="block font-medium tabular-nums text-slate-900">{formatShort(p.start)}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{placementNote(p)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 3. The extension tradeoff - marginal return. */}
          {selected && (
            <section className="border-t border-slate-200 pt-6">
              <h2 className="mb-1 text-sm font-semibold text-slate-700">What each added PTO day buys</h2>
              <p className="text-sm text-slate-600">{marginalReturnText(selected.marginal)}</p>
            </section>
          )}

          {/* 2. Calendar - the same component as /pto, the block rendered distinctly
              ('pinned', the same treatment /pto uses for a forced-in day) from the PTO days
              extending it ('suggested-pto'). 3D: every month the trip touches, plus one
              month either side (calendarRange), not just the core block's own start. */}
          {selected && calendarRange && (
            <section className="border-t border-slate-200 pt-6">
              <Calendar
                rangeStart={calendarRange.start}
                rangeEnd={calendarRange.end}
                weekStart={1}
                today={today}
                offRuns={[]}
                previewRun={null}
                breakBandByRunIndex={new Map()}
                hoveredBreakDaySet={new Set()}
                onHoverBreak={() => {}}
                categoryOf={categoryOf}
                isBlackoutDay={() => false}
                overlapSet={new Set()}
                marginalValues={new Map()}
                holidayNameFor={(iso) => holidayState.holidays.find((h) => h.date === iso)?.name}
                hasHover={true}
                onDayClick={() => {}}
                alternativeForDate={() => undefined}
                onSwapAlternative={() => {}}
                onHoverAlternative={() => {}}
              />
            </section>
          )}

          {/* 6. Back to /pto. */}
          <p className="border-t border-slate-200 pt-6 text-sm text-slate-500">
            Planning ordinary time off too? <a href="/pto" className="underline hover:text-slate-700">PTO Optimizer &rarr;</a>
          </p>

          <SabbaticalFAQ />
        </Container>
      </main>
      <Footer />
    </div>
  );
}

function marginalReturnText(marginal: { ptoUsed: number; awayDays: number }[]): string {
  if (marginal.length <= 1) return 'Adding PTO days here would extend the trip - try the slider above.';
  const first = marginal[0];
  // Collapse into "Days 1-3 add 7 days away. Days 4-5 add 2. Beyond that, nothing." style text.
  const grouped: { fromPto: number; toPto: number; gained: number }[] = [];
  let prev = marginal[0];
  for (let i = 1; i < marginal.length; i++) {
    const cur = marginal[i];
    const perDay = cur.awayDays - prev.awayDays;
    const last = grouped[grouped.length - 1];
    if (last && last.gained === perDay) {
      last.toPto = cur.ptoUsed;
    } else {
      grouped.push({ fromPto: cur.ptoUsed, toPto: cur.ptoUsed, gained: perDay });
    }
    prev = cur;
  }
  const sentences = grouped.map((g) => {
    const dayLabel = g.fromPto === g.toPto ? `Day ${g.fromPto}` : `Days ${g.fromPto}–${g.toPto}`;
    return `${dayLabel} add${g.fromPto === g.toPto ? 's' : ''} ${g.gained} day${g.gained === 1 ? '' : 's'} away.`;
  });
  if (first.ptoUsed === 0 && marginal[marginal.length - 1].ptoUsed < 15) {
    sentences.push('Beyond that, the nearest free day is further out.');
  }
  return sentences.join(' ');
}

function SabbaticalFAQ() {
  const items = [
    {
      q: 'When is the best time to take a sabbatical?',
      a: 'The placements above rank windows by how many holidays and weekends sit inside or next to the block - a sabbatical started right before a public holiday or a cluster of them buys more total time away for the same number of weeks off.',
    },
    {
      q: 'Can I add PTO days to a sabbatical?',
      a: 'Often, yes - many employers allow combining ordinary PTO with a sabbatical to extend it. Whether yours does depends entirely on your own employer’s policy; check before counting on it.',
    },
    {
      q: 'How long do sabbaticals usually run?',
      a: 'Lengths vary widely by employer and industry, from a few weeks to several months - there’s no single standard, so this tool lets you set any length rather than assuming one.',
    },
    {
      q: 'Can my added PTO days land before my eligibility date?',
      a: 'Yes - PTO days are ordinary PTO, not part of the sabbatical itself, so they can fall before the date you become eligible to start the sabbatical block. The solver places each added day on whichever side of the block buys the most total time off, and the hero above always says which: "N before, M after."',
    },
  ];
  return (
    <section id="questions" className="border-t border-slate-100 pt-6 text-sm text-slate-500">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Questions</h2>
      <div className="flex flex-col divide-y divide-slate-100">
        {items.map((item) => (
          <details key={item.q} className="group py-2.5">
            <summary className="cursor-pointer list-none">
              <h3 className="inline text-sm font-normal text-slate-600 marker:content-none group-open:text-slate-800">{item.q}</h3>
            </summary>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-500">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
