import { getConsumerHolidaysWithStatus as getHolidaysWithStatus } from '../personal/consumerHolidays';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { CountrySelect } from './CountrySelect';
import { Button } from './Button';
import { getPreloadedHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import { getPrerenderedAt } from './prerenderedAt';
import { geolocateCountry } from './geo';
import { todayISO } from './useAppState';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { formatCardDateRange, formatLong, formatShort, formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { bestPlacements, placementNote, type SabbaticalPlacement } from './sabbaticalData';
import { UnpaidIcon } from './DayCell';
import { COLORS, HOLIDAY_DOT } from './colorScheme';
import { weekStartForCountry } from './locale';
import { readSabbaticalStateFromURL, writeSabbaticalStateToURL } from './sabbaticalUrlState';
import { downloadSabbaticalICS } from './icsExport';
import { copyCanvasImage, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT } from './imageExport';
import { copyText } from './requestText';
import { SABBATICAL_FAQ_ITEMS } from './sabbaticalFaqItems';

/**
 * Site restructure, Phase 4: /sabbatical. A distinct experience from /pto - placing ONE
 * contiguous block once, not spending a budget across many breaks - built from the same
 * underlying pieces (holiday fetch, the calendar component, date arithmetic) rather than
 * the optimizer with different labels.
 */
export function Sabbatical() {
  const prerenderedAt = useMemo(() => getPrerenderedAt(), []);
  const today = todayISO();

  // 4B: every control round-trips through the URL, same conventions as /pto's
  // urlState.ts - read once at mount (SSR-safe: window is always defined during
  // prerendering too, just with an empty search string there).
  const initial = useMemo(() => readSabbaticalStateFromURL(typeof window !== 'undefined' ? window.location.search : ''), []);

  const [country, setCountry] = useState<string>(() => initial.country ?? geolocateCountry());
  const [eligibleFrom, setEligibleFrom] = useState(initial.eligibleFrom ?? today);
  const [lengthWeeks, setLengthWeeks] = useState(initial.lengthWeeks);
  const [ptoToAdd, setPtoToAdd] = useState(initial.ptoToAdd);
  const [unpaidWeeksToAdd, setUnpaidWeeksToAdd] = useState(initial.unpaidWeeksToAdd);
  const [selectedStart, setSelectedStart] = useState<string | undefined>(initial.selectedStart);

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
  }, [country, eligibleFrom, horizonEnd]);

  const holidaySet = useMemo(() => new Set(holidayState.holidays.map((h) => h.date)), [holidayState.holidays]);

  // 3A/3B: ranking now uses the SAME ptoToAdd (and the SAME today floor) the hero and
  // calendar use below - the headline and the cards can no longer disagree, because
  // there is only one extendSabbatical call per placement, not two different budgets.
  const { placements, anyHolidayInAnyCandidate } = useMemo(
    () =>
      bestPlacements(eligibleFrom, horizonEnd, lengthWeeks, ptoToAdd, unpaidWeeksToAdd, holidayState.holidays, country, DEFAULT_WORK_WEEK, today),
    [eligibleFrom, horizonEnd, lengthWeeks, ptoToAdd, unpaidWeeksToAdd, holidayState.holidays, country, today],
  );

  // 4B: selection is by the placement's own start date, not a list index - re-ranking
  // (e.g. moving the PTO slider) can reorder the list, and an index would then silently
  // point at a different window than the one the user actually picked. Falls back to the
  // top-ranked placement when the previously-selected date no longer appears (a new
  // search, or that window no longer makes the cut).
  const selected: SabbaticalPlacement | undefined = placements.find((p) => p.start === selectedStart) ?? placements[0];

  // A new search (start date, length or country) drops the old pick, so the top-ranked
  // window shows. Adjusted during render rather than in an effect, so the URL's own `sel`
  // survives the first render instead of being cleared on mount.
  const searchKey = `${eligibleFrom}|${lengthWeeks}|${country}`;
  const [selectionSearchKey, setSelectionSearchKey] = useState(searchKey);
  if (selectionSearchKey !== searchKey) {
    setSelectionSearchKey(searchKey);
    setSelectedStart(undefined);
  }

  // Sync every control into the shareable URL - the same pattern useAppState.ts uses for
  // /pto, so a /sabbatical link reproduces exactly this view for anyone.
  useEffect(() => {
    if (typeof window === 'undefined' || !selected) return;
    const url = new URL(window.location.href);
    writeSabbaticalStateToURL(url.searchParams, {
      country,
      lengthWeeks,
      eligibleFrom,
      ptoToAdd,
      unpaidWeeksToAdd,
      selectedStart: selected.start,
    });
    window.history.replaceState(null, '', url);
  }, [country, lengthWeeks, eligibleFrom, ptoToAdd, unpaidWeeksToAdd, selected]);

  const coreSet = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>();
    for (let d = selected.start; d <= selected.coreEnd; d = addDays(d, 1)) set.add(d);
    return set;
  }, [selected]);

  // 4C: each extension day's own set, split by which budget paid for it - read directly
  // from bestPlacements' spentDays rather than re-derived from isOffDay, since that's the
  // exact record of which days were actually spent (vs merged in for free) and on which
  // budget (PTO first, then unpaid - see extendSabbatical).
  const ptoSpentSet = useMemo(() => new Set((selected?.spentDays ?? []).filter((s) => s.kind === 'pto').map((s) => s.date)), [selected]);
  const unpaidSpentSet = useMemo(
    () => new Set((selected?.spentDays ?? []).filter((s) => s.kind === 'unpaid').map((s) => s.date)),
    [selected],
  );


  const stepBtn = 'flex h-11 w-11 shrink-0 items-center justify-center text-lg font-semibold text-ink transition-colors duration-150 hover:bg-surface-alt disabled:opacity-40';
  const numberInput = 'h-11 w-14 min-w-0 border-x border-line-strong bg-surface text-center text-base font-semibold text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
  const fieldLabel = 'block text-sm font-semibold text-ink';

  const composition = selected
    ? [
        `${lengthWeeks} week${lengthWeeks === 1 ? '' : 's'} of sabbatical`,
        // 4C: unpaid leave is its own clause, distinct from PTO.
        unpaidWeeksToAdd ? `${unpaidWeeksToAdd} week${unpaidWeeksToAdd === 1 ? '' : 's'} unpaid` : '',
        selected.ptoBefore ? `${selected.ptoBefore} PTO day${selected.ptoBefore === 1 ? '' : 's'} before` : '',
        selected.ptoAfter ? `${selected.ptoAfter} PTO day${selected.ptoAfter === 1 ? '' : 's'} after` : '',
        selected.unpaidBefore ? `${selected.unpaidBefore} unpaid day${selected.unpaidBefore === 1 ? '' : 's'} before` : '',
        selected.unpaidAfter ? `${selected.unpaidAfter} unpaid day${selected.unpaidAfter === 1 ? '' : 's'} after` : '',
        selected.holidayNames.length ? `${selected.holidayNames.length} public holiday${selected.holidayNames.length === 1 ? '' : 's'} inside` : '',
      ].filter(Boolean).join(' + ')
    : '';

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="sabbatical" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pb-12 pt-6 sm:px-6 lg:pt-10">
          {/* The answer is the hero, and it is live: the h1 is the selected placement's own
              totalAwayDays (3B: one number, computed once inside bestPlacements). */}
          {selected ? (
            <header className="max-w-4xl">
              <h1 className="text-h1 type-display text-ink">
                Take it from {formatLong(selected.start)} and you&apos;re away for{' '}
                <span className="mark">{selected.totalAwayDays} consecutive days</span>.
              </h1>
              <p className="mt-3 text-base text-muted">
                {formatCardDateRange(selected.extendedStart, selected.extendedEnd)}: {composition}.
              </p>
              {prerenderedAt && (
                <p className="mt-1 text-xs text-muted">
                  Dates above as of {formatShort(prerenderedAt.slice(0, 10))} — this page recomputes live once it loads in your browser.
                </p>
              )}
            </header>
          ) : (
            <header>
              <h1 className="text-h1 type-display text-ink">Plan your sabbatical</h1>
              <p role="status" className="mt-2 text-sm text-muted">Loading placements&hellip;</p>
            </header>
          )}

          <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
            {/* Controls, grouped by the question each answers. Every one updates live and
                round-trips through the URL (c, s, len, pto, unpaid). */}
            <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
              <h2 className="sr-only">Your sabbatical</h2>
              <div className="flex flex-col gap-6 rounded-[10px] border border-line bg-surface p-4 sm:p-5 md:grid md:grid-cols-3 lg:flex">
                <fieldset className="min-w-0">
                  <legend className="text-base font-bold type-condensed text-ink">When you can go</legend>
                  <div className="mt-3 flex flex-col gap-4">
                    {/* 4B/K3f: CountrySelect renders its own "Country" label. */}
                    <CountrySelect country={country} onChangeCountry={setCountry} />
                    <div>
                      <label className={fieldLabel} htmlFor="sabbatical-from">Eligible from</label>
                      <input
                        id="sabbatical-from"
                        type="date"
                        value={eligibleFrom}
                        onChange={(e) => e.target.value && setEligibleFrom(e.target.value)}
                        className="mt-1.5 h-11 w-full min-w-0 rounded-[6px] border border-line-strong bg-surface px-3 text-base text-ink"
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="min-w-0 border-t border-line pt-5 md:border-t-0 md:pt-0 lg:border-t lg:pt-5">
                  <legend className="float-left w-full text-base font-bold type-condensed text-ink">How long</legend>
                  <div className="clear-both pt-3">
                    <label className={fieldLabel} htmlFor="sabbatical-length">Sabbatical length</label>
                    {/* 4B: any whole number of weeks, not a fixed list. Steppers for +/-1,
                        typing for anything else; no submit, updates live. */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="inline-flex items-stretch overflow-hidden rounded-[6px] border border-line-strong bg-surface">
                        <button type="button" aria-label="Decrease sabbatical length by one week" disabled={lengthWeeks <= 1} onClick={() => setLengthWeeks((w) => Math.max(1, w - 1))} className={stepBtn}>&minus;</button>
                        <input
                          id="sabbatical-length"
                          type="number"
                          min={1}
                          max={52}
                          step={1}
                          value={lengthWeeks}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n)) setLengthWeeks(Math.max(1, Math.min(52, Math.round(n))));
                          }}
                          className={numberInput}
                        />
                        <button type="button" aria-label="Increase sabbatical length by one week" disabled={lengthWeeks >= 52} onClick={() => setLengthWeeks((w) => Math.min(52, w + 1))} className={stepBtn}>+</button>
                      </div>
                      <span className="text-sm text-muted">week{lengthWeeks === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="min-w-0 border-t border-line pt-5 md:border-t-0 md:pt-0 lg:border-t lg:pt-5">
                  <legend className="float-left w-full text-base font-bold type-condensed text-ink">Stretch it</legend>
                  <div className="clear-both flex flex-col gap-4 pt-1">
                    <p className="text-sm text-muted">Ordinary PTO and unpaid leave can extend the block on either side.</p>
                    <div>
                      <label className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink" htmlFor="sabbatical-pto">
                        PTO days to add
                        <span className="text-base font-bold tabular-nums">{ptoToAdd}</span>
                      </label>
                      <input
                        id="sabbatical-pto"
                        type="range"
                        min={0}
                        max={15}
                        step={1}
                        value={ptoToAdd}
                        onChange={(e) => setPtoToAdd(Number(e.target.value))}
                        className="mt-1 h-11 w-full cursor-pointer"
                      />
                      <div aria-hidden="true" className="flex justify-between text-xs text-muted"><span>0</span><span>15</span></div>
                    </div>
                    <div>
                      <label className={fieldLabel} htmlFor="sabbatical-unpaid">Unpaid leave to add</label>
                      {/* 4C: extends the block the same way PTO does, but tracked as its own
                          budget - the tradeoff is financial, not a PTO balance. */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="inline-flex items-stretch overflow-hidden rounded-[6px] border border-line-strong bg-surface">
                          <button type="button" aria-label="Decrease unpaid leave by one week" disabled={unpaidWeeksToAdd <= 0} onClick={() => setUnpaidWeeksToAdd((w) => Math.max(0, w - 1))} className={stepBtn}>&minus;</button>
                          <input
                            id="sabbatical-unpaid"
                            type="number"
                            min={0}
                            max={52}
                            step={1}
                            value={unpaidWeeksToAdd}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (Number.isFinite(n)) setUnpaidWeeksToAdd(Math.max(0, Math.min(52, Math.round(n))));
                            }}
                            className={numberInput}
                          />
                          <button type="button" aria-label="Increase unpaid leave by one week" disabled={unpaidWeeksToAdd >= 52} onClick={() => setUnpaidWeeksToAdd((w) => Math.min(52, w + 1))} className={stepBtn}>+</button>
                        </div>
                        <span className="text-sm text-muted">week{unpaidWeeksToAdd === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-10 lg:gap-12">
              {/* 1. Best placements: a ranked comparison you can switch between. */}
              <section aria-labelledby="placements-heading">
                <h2 id="placements-heading" className="text-h2 font-bold type-condensed text-ink">Best placements</h2>
                {/* 3A: said once, here, rather than on every card. */}
                {!anyHolidayInAnyCandidate && placements.length > 0 && (
                  <p className="mt-1 text-sm text-muted">
                    No window in the next year puts a public holiday inside a {lengthWeeks}-week block. These are ranked by what sits next to
                    it instead.
                  </p>
                )}
                <PlacementList placements={placements} selectedStart={selected?.start} onSelect={setSelectedStart} />
              </section>

              {/* 2. The extension tradeoff: marginal return, legible. */}
              {selected && (
                <section aria-labelledby="marginal-heading">
                  <h2 id="marginal-heading" className="text-h2 font-bold type-condensed text-ink">What each added day buys</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted">Days away gained by each PTO or unpaid day you add, in the order they are spent. Bars past the first few often shrink: that is where adding more stops paying.</p>
                  <MarginalBars marginal={selected.marginal} currentDaysUsed={ptoToAdd + unpaidWeeksToAdd * 7} />
                  <p className="mt-3 max-w-2xl text-base text-ink">{marginalReturnText(selected.marginal)}</p>
                </section>
              )}

              {/* 3. Calendar: every month the trip touches (3D), drawn like /pto's calendar. */}
              {selected && (
                <section aria-labelledby="calendar-heading">
                  <h2 id="calendar-heading" className="text-h2 font-bold type-condensed text-ink">On the calendar</h2>
                  <SabbaticalLegend />
                  <SabbaticalCalendar
                    weekStart={weekStartForCountry(country)}
                    today={today}
                    runStart={selected.extendedStart}
                    runEnd={selected.extendedEnd}
                    coreSet={coreSet}
                    ptoSet={ptoSpentSet}
                    unpaidSet={unpaidSpentSet}
                    holidayNameFor={(iso) => holidayState.holidays.find((h) => h.date === iso)?.name}
                    holidaySet={holidaySet}
                  />
                </section>
              )}

              {/* 4. Export: same actions as /pto (4B). */}
              {selected && <SabbaticalExportRow placement={selected} lengthWeeks={lengthWeeks} unpaidWeeksToAdd={unpaidWeeksToAdd} />}

              <p className="text-base text-muted">
                Planning ordinary time off too? <a href="/pto" className="link-mark font-semibold">Plan time off &rarr;</a>
              </p>

              <SabbaticalFAQ />
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

/** The top placements as a ranked comparison: rank, start date, the span, a bar of days
 * away (from zero, so near-equal options honestly look near-equal) and what each window
 * includes. A real radio group: Tab reaches the selected option, arrow keys move. */
function PlacementList({
  placements,
  selectedStart,
  onSelect,
}: {
  placements: SabbaticalPlacement[];
  selectedStart: string | undefined;
  onSelect: (start: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const max = Math.max(1, ...placements.map((p) => p.totalAwayDays));
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta || placements.length === 0) return;
    event.preventDefault();
    const next = (index + delta + placements.length) % placements.length;
    onSelect(placements[next].start);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Best placements" className="mt-4 flex flex-col gap-2">
      {placements.map((p, index) => {
        const isSelected = p.start === selectedStart;
        const extras = placementNote(p).split(' · ').slice(1).join(' · ');
        return (
          <button
            key={p.start}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected || (!selectedStart && index === 0) ? 0 : -1}
            onClick={() => onSelect(p.start)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`grid min-h-11 w-full grid-cols-[2rem_minmax(0,1fr)] gap-x-3 rounded-[10px] border bg-surface p-3 text-left transition-colors duration-150 sm:grid-cols-[2rem_minmax(0,13rem)_minmax(0,1fr)] sm:items-center sm:p-4 ${
              isSelected ? 'border-2 border-accent' : 'border-line hover:border-ink'
            }`}
          >
            <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-[6px] text-base font-bold ${isSelected ? 'bg-accent text-white' : 'bg-surface-alt text-ink'}`}>{index + 1}</span>
            <span className="min-w-0">
              <span className="block text-base font-bold text-ink">{formatShortWithYear(p.start)}</span>
              <span className="block text-sm text-muted">{formatCardDateRange(p.extendedStart, p.extendedEnd)}</span>
            </span>
            <span className="col-span-2 mt-2 min-w-0 sm:col-span-1 sm:mt-0">
              <span className="flex items-center gap-3">
                <span aria-hidden="true" className="h-3 min-w-0 flex-1 bg-surface-alt">
                  <span className={`block h-full ${isSelected ? 'bg-accent' : 'bg-[var(--mark-strong)]'}`} style={{ width: `${(p.totalAwayDays / max) * 100}%` }} />
                </span>
                <span className="shrink-0 text-base font-bold tabular-nums text-ink">{p.totalAwayDays} days away</span>
              </span>
              {extras && <span className="mt-1 block text-sm text-muted">{extras}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function marginalReturnText(marginal: { daysUsed: number; awayDays: number }[]): string {
  if (marginal.length <= 1) return 'Adding days here would extend the trip - try the sliders above.';
  const first = marginal[0];
  // Collapse into "Days 1-3 add 7 days away. Days 4-5 add 2. Beyond that, nothing." style text.
  const grouped: { from: number; to: number; gained: number }[] = [];
  let prev = marginal[0];
  for (let i = 1; i < marginal.length; i++) {
    const cur = marginal[i];
    const perDay = cur.awayDays - prev.awayDays;
    const last = grouped[grouped.length - 1];
    if (last && last.gained === perDay) {
      last.to = cur.daysUsed;
    } else {
      grouped.push({ from: cur.daysUsed, to: cur.daysUsed, gained: perDay });
    }
    prev = cur;
  }
  const sentences = grouped.map((g) => {
    const dayLabel = g.from === g.to ? `Day ${g.from}` : `Days ${g.from}–${g.to}`;
    return `${dayLabel} add${g.from === g.to ? 's' : ''} ${g.gained} day${g.gained === 1 ? '' : 's'} away.`;
  });
  if (first.daysUsed === 0 && marginal[marginal.length - 1].daysUsed < 15) {
    sentences.push('Beyond that, the nearest free day is further out.');
  }
  return sentences.join(' ');
}

/** 4A, rebuilt: one ink bar per added day (budget day 1..N, up to 15 shown), height
 * proportional to the days away it bought, with the value written on the bar so nothing is
 * read from height alone. The day matching the current PTO + unpaid total is marked with
 * the marker column and a "now" label, tying the chart to the controls. */
function MarginalBars({ marginal, currentDaysUsed }: { marginal: { daysUsed: number; awayDays: number }[]; currentDaysUsed: number }) {
  if (marginal.length <= 1) return null;
  const gains = marginal.slice(1).map((m, i) => ({ daysUsed: m.daysUsed, gained: m.awayDays - marginal[i].awayDays }));
  const shown = gains.slice(0, 15);
  const maxGain = Math.max(...shown.map((g) => g.gained), 1);
  const CHART = 88;
  return (
    <figure className="mt-5 max-w-2xl">
      <div className="flex items-end gap-1 border-b border-ink sm:gap-1.5" role="img" aria-label={shown.map((g) => `day ${g.daysUsed} adds ${g.gained} days away`).join(', ')}>
        {shown.map((g) => {
          const isCurrent = g.daysUsed === currentDaysUsed;
          return (
            <div key={g.daysUsed} className={`flex min-w-0 max-w-12 flex-1 flex-col items-center justify-end px-0.5 pt-6 ${isCurrent ? 'rounded-t-[6px] bg-mark' : ''}`} style={{ height: `${CHART + 24}px` }}>
              <span className="text-sm font-bold tabular-nums text-ink">+{g.gained}</span>
              <span className="mt-1 block w-full rounded-t-[3px] bg-accent" style={{ height: `${Math.max(3, (g.gained / maxGain) * CHART)}px` }} />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex gap-1 sm:gap-1.5">
        {shown.map((g) => {
          const isCurrent = g.daysUsed === currentDaysUsed;
          return (
            <span key={g.daysUsed} className={`min-w-0 max-w-12 flex-1 pt-1 text-center text-xs tabular-nums ${isCurrent ? 'bg-accent font-bold text-white' : 'text-muted'}`}>
              {g.daysUsed}
            </span>
          );
        })}
      </div>
      <figcaption className="mt-1 text-sm text-muted">Added day number{shown.some((g) => g.daysUsed === currentDaysUsed) ? '; the marked column is where your controls are now' : ''}.</figcaption>
    </figure>
  );
}

/** The legend draws the same marks the calendar below draws (and /pto's calendar uses),
 * so it never describes a swatch the calendar doesn't have. */
function SabbaticalLegend() {
  const swatch = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px]';
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className="h-6 w-9 rounded-[8px] border-b-[3px] border-accent bg-mark" />
        Time away: the sabbatical and the weekends and holidays it joins
      </li>
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} border ${COLORS.ptoBorder} ${COLORS.ptoBg}`} />
        PTO day
      </li>
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} border ${COLORS.ptoBorder} ${COLORS.ptoBg} ${COLORS.ptoText}`}><UnpaidIcon className="h-3 w-3" /></span>
        Unpaid leave day
      </li>
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} relative border border-line`}><span className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${HOLIDAY_DOT}`} /></span>
        Public holiday
      </li>
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} bg-surface-alt`} />
        Weekend
      </li>
    </ul>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_MONDAY = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_SUNDAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** A read-only month grid drawn exactly like /pto's MonthGrid and DayCell: the country's
 * week start, the time away as a marker band behind the cells (one continuous run per week,
 * 4px ends only where the run starts or stops), PTO and unpaid days as solid ink cells (the
 * unpaid one with /pto's ring glyph), weekends on the tone-stepped fill, holidays with the
 * centred dot, today with the 2px ring. Only the months the trip touches are drawn. Each
 * marked day also says its state in words for screen readers. */
function SabbaticalCalendar({
  weekStart, today, runStart, runEnd, coreSet, ptoSet, unpaidSet, holidaySet, holidayNameFor,
}: {
  weekStart: 0 | 1;
  today: string;
  runStart: string;
  runEnd: string;
  coreSet: ReadonlySet<string>;
  ptoSet: ReadonlySet<string>;
  unpaidSet: ReadonlySet<string>;
  holidaySet: ReadonlySet<string>;
  holidayNameFor: (iso: string) => string | undefined;
}) {
  const months: string[] = [];
  for (let m = runStart.slice(0, 7) + '-01'; m <= runEnd; ) {
    months.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  }
  const labels = weekStart === 0 ? WEEKDAYS_SUNDAY : WEEKDAYS_MONDAY;
  return (
    <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
      {months.map((first) => {
        const [y, mo] = first.split('-').map(Number);
        const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const lead = (mondayIndexedDow(first) + (weekStart === 0 ? 1 : 0)) % 7;
        const cells: (string | null)[] = Array.from({ length: lead }, () => null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(`${first.slice(0, 8)}${String(d).padStart(2, '0')}`);
        while (cells.length % 7) cells.push(null);
        const weeks: (string | null)[][] = [];
        for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
        const monthName = `${MONTH_NAMES[mo - 1]} ${y}`;
        return (
          <div key={first} role="group" aria-label={monthName} className="min-w-0">
            <p aria-hidden="true" className="mb-1 text-base font-bold text-ink">{monthName}</p>
            <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-x-1 text-center text-xs font-medium text-muted">
              {labels.map((label) => <span key={label}>{label}</span>)}
            </div>
            <div className="flex flex-col gap-1">
              {weeks.map((week, wi) => {
                // The band: each in-run stretch of this week as one segment behind the cells.
                const segments: { from: number; to: number; roundL: boolean; roundR: boolean }[] = [];
                week.forEach((iso, i) => {
                  const inRun = !!iso && iso >= runStart && iso <= runEnd;
                  if (!inRun) return;
                  const last = segments[segments.length - 1];
                  if (last && last.to === i - 1) { last.to = i; last.roundR = iso === runEnd; }
                  else segments.push({ from: i, to: i, roundL: iso === runStart, roundR: iso === runEnd });
                });
                return (
                  <div key={wi} className="relative grid grid-cols-7 gap-x-1" style={{ gridTemplateRows: '2.5rem' }}>
                    {segments.map((seg) => (
                      <span
                        key={`band-${seg.from}`}
                        aria-hidden="true"
                        className={`border-b border-[var(--text-primary)] ${COLORS.bandBg} ${seg.roundL ? 'rounded-l-[8px]' : ''} ${seg.roundR ? 'rounded-r-[8px]' : ''}`}
                        style={{ gridColumn: `${seg.from + 1} / ${seg.to + 2}`, gridRow: 1 }}
                      />
                    ))}
                    {week.map((iso, di) => {
                      if (!iso) return <span key={di} aria-hidden="true" style={{ gridColumn: di + 1, gridRow: 1 }} />;
                      const inRun = iso >= runStart && iso <= runEnd;
                      const isPto = ptoSet.has(iso);
                      const isUnpaid = unpaidSet.has(iso);
                      const isHoliday = holidaySet.has(iso);
                      const holidayName = isHoliday ? holidayNameFor(iso) : undefined;
                      const dow = mondayIndexedDow(iso);
                      const isWeekend = dow >= 5;
                      const state = isPto ? 'PTO day' : isUnpaid ? 'unpaid leave day' : coreSet.has(iso) ? 'sabbatical' : inRun ? 'day off joined to your time away' : '';
                      const words = [`${MONTH_NAMES[mo - 1]} ${Number(iso.slice(8))}`, state, holidayName ? `public holiday: ${holidayName}` : '', iso === today ? 'today' : ''].filter(Boolean).join(', ');
                      const fill = isPto || isUnpaid
                        ? `${COLORS.ptoBg} border ${COLORS.ptoBorder} ${COLORS.ptoText} font-bold`
                        : inRun ? 'font-semibold text-ink'
                          : isWeekend ? 'bg-surface-alt text-muted' : 'text-ink';
                      return (
                        <span
                          key={di}
                          title={holidayName}
                          className={`relative z-10 flex h-10 items-center justify-center rounded-[6px] text-sm font-medium tabular-nums ${fill} ${
                            iso === today ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-surface)]' : ''
                          }`}
                          style={{ gridColumn: di + 1, gridRow: 1 }}
                        >
                          <span aria-hidden="true" className="flex items-center gap-0.5">
                            {Number(iso.slice(8))}
                            {isUnpaid && <UnpaidIcon className="h-3 w-3" />}
                          </span>
                          <span className="sr-only">{words}</span>
                          {isHoliday && !isPto && !isUnpaid && (
                            <span aria-hidden="true" className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${HOLIDAY_DOT}`} />
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 4B: the same three actions /pto's ExportBar offers, reusing the same underlying
 * correctness code (icsExport.ts's RFC 5545 helpers via downloadSabbaticalICS,
 * imageExport.ts's copyCanvasImage, requestText.ts's copyText) - not the ExportBar
 * component itself, which is built around a Break[]/budget-spent model this page doesn't
 * have (one contiguous block, not many solver-chosen breaks). */
function SabbaticalExportRow({
  placement,
  lengthWeeks,
  unpaidWeeksToAdd,
}: {
  placement: SabbaticalPlacement;
  lengthWeeks: number;
  unpaidWeeksToAdd: number;
}) {
  const [message, setMessage] = useState<string | null>(null);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 2000);
  };

  const summary = `Sabbatical (${lengthWeeks} week${lengthWeeks === 1 ? '' : 's'})`;
  const description = [
    `${lengthWeeks} week${lengthWeeks === 1 ? '' : 's'} of sabbatical`,
    unpaidWeeksToAdd ? `${unpaidWeeksToAdd} week${unpaidWeeksToAdd === 1 ? '' : 's'} unpaid` : null,
    placement.ptoBefore + placement.ptoAfter ? `${placement.ptoBefore + placement.ptoAfter} PTO day${placement.ptoBefore + placement.ptoAfter === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' + ');

  const exportImage = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = SHARE_IMAGE_WIDTH;
    canvas.height = SHARE_IMAGE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
    ctx.fillStyle = '#3a36d0';
    ctx.fillRect(40, 72, 6, 48);
    ctx.fillStyle = '#12141c';
    ctx.font = '800 44px "Archivo Variable", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Away for ${placement.totalAwayDays} consecutive days`, 60, 110);
    ctx.font = '400 24px system-ui, sans-serif';
    ctx.fillStyle = '#535968';
    ctx.fillText(`${formatLong(placement.extendedStart)} – ${formatLong(placement.extendedEnd)}`, 60, 150);
    ctx.font = '400 15px system-ui, sans-serif';
    ctx.fillStyle = '#535968';
    ctx.fillText(window.location.host, 48, SHARE_IMAGE_HEIGHT - 32);
    const result = await copyCanvasImage(canvas, 'sabbatical.png');
    flash(result.method === 'clipboard' ? 'Copied!' : result.method === 'download' ? 'Downloaded instead' : 'Could not copy');
  };

  return (
    <section aria-labelledby="sabbatical-export-heading">
      <h2 id="sabbatical-export-heading" className="text-h2 font-bold type-condensed text-ink">Keep it</h2>
      <p className="mt-1 text-sm text-muted">The link reproduces this exact plan for anyone you send it to.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => downloadSabbaticalICS(placement.extendedStart, placement.extendedEnd, summary, description)}>
          Add to calendar (.ics)
        </Button>
        <Button variant="secondary" onClick={exportImage}>Copy as image</Button>
        <Button
          variant="secondary"
          onClick={async () => {
            const ok = await copyText(window.location.href);
            flash(ok ? 'Copied!' : 'Could not copy - try selecting the address bar');
          }}
        >
          Copy link
        </Button>
        <span role="status" className="text-sm text-muted">{message ?? ''}</span>
      </div>
    </section>
  );
}

function SabbaticalFAQ() {
  return (
    <section id="questions" aria-labelledby="sabbatical-questions-heading" className="scroll-mt-24">
      <h2 id="sabbatical-questions-heading" className="text-h2 font-bold type-condensed text-ink">Questions</h2>
      <div className="mt-3 flex max-w-3xl flex-col divide-y divide-line border-y border-line">
        {SABBATICAL_FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden">
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
