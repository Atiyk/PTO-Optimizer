import { getConsumerHolidaysWithStatus as getHolidaysWithStatus } from '../personal/consumerHolidays';
import { useEffect, useMemo, useState } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { CountrySelect } from './CountrySelect';
import { Calendar } from './Calendar';
import { getPreloadedHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import { getPrerenderedAt } from './prerenderedAt';
import { geolocateCountry } from './geo';
import { todayISO } from './useAppState';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { formatLong, formatShort } from '@daysoff/engine/calendar/dateFormat';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { DayCategory } from './types';
import { bestPlacements, placementNote, paddedCalendarRange, type SabbaticalPlacement } from './sabbaticalData';
import { readSabbaticalStateFromURL, writeSabbaticalStateToURL } from './sabbaticalUrlState';
import { downloadSabbaticalICS } from './icsExport';
import { copyCanvasImage, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT } from './imageExport';
import { copyText } from './requestText';
import { PinIcon, UnpaidIcon } from './DayCell';
import { SABBATICAL_FAQ_ITEMS } from './sabbaticalFaqItems';
import { COLORS } from './colorScheme';

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
  }, [country, eligibleFrom]);

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

  useEffect(() => {
    setSelectedStart(undefined);
  }, [eligibleFrom, lengthWeeks, country]);

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

  // 3D/K3e: every month the trip (selected.extendedStart..extendedEnd, not just the core
  // block) touches, plus one month of context either side - previously rangeStart was the
  // core block's own start, so PTO days extending backward never rendered at all.
  const calendarRange = useMemo(() => {
    if (!selected) return null;
    return paddedCalendarRange(selected.extendedStart, selected.extendedEnd);
  }, [selected]);

  const categoryOf = (iso: string): DayCategory => {
    if (coreSet.has(iso)) return 'pinned';
    if (unpaidSpentSet.has(iso)) return 'unpaid-leave';
    if (ptoSpentSet.has(iso)) return 'suggested-pto';
    if (holidaySet.has(iso)) return 'public-holiday';
    const mondayIndexed = mondayIndexedDow(iso); // 0=Mon .. 6=Sun
    if (mondayIndexed === 5 || mondayIndexed === 6) return 'weekend';
    return 'working';
  };

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="sabbatical" />
      <div>
        <div className="border-b border-slate-200 bg-slate-50">
          <Container className="flex flex-wrap items-end gap-4 px-4 py-4">
            {/* 4B/K3f: CountrySelect renders its own "Country" label already - a second
                one here just duplicated it. */}
            <div className="w-48">
              <CountrySelect country={country} onChangeCountry={setCountry} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="sabbatical-length">
                Sabbatical length
              </label>
              {/* 4B: any whole number of weeks, not a fixed list - arbitrary ranges are a
                  differentiator everywhere else on this site (see CLAUDE.md's rule on
                  free-form date pickers) and should be here too. Steppers for discoverable
                  +/-1, typing for anything else; no submit, updates live. */}
              <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-slate-300 bg-white">
                <button
                  type="button"
                  aria-label="Decrease sabbatical length by one week"
                  onClick={() => setLengthWeeks((w) => Math.max(1, w - 1))}
                  className="w-7 shrink-0 text-slate-500 hover:bg-slate-50"
                >
                  &minus;
                </button>
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
                  className="w-12 border-x border-slate-200 text-center text-sm text-slate-800 [appearance:textfield] focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label="Increase sabbatical length by one week"
                  onClick={() => setLengthWeeks((w) => Math.min(52, w + 1))}
                  className="w-7 shrink-0 text-slate-500 hover:bg-slate-50"
                >
                  +
                </button>
                <span className="flex items-center px-2 text-sm text-slate-500">week{lengthWeeks === 1 ? '' : 's'}</span>
              </div>
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
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="sabbatical-unpaid">
                Unpaid leave to add
              </label>
              {/* 4C: extends the block the same way PTO does, but tracked as its own
                  budget - the tradeoff is financial, not a PTO balance. */}
              <div className="flex items-center gap-1">
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
                  className="h-9 w-16 rounded-md border border-slate-300 bg-white px-2 text-center text-sm text-slate-800 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-sm text-slate-500">week{unpaidWeeksToAdd === 1 ? '' : 's'}</span>
              </div>
            </div>
          </Container>
        </div>

        {selected ? (
          <Container className="px-4 py-6">
            {/* 3B: the SAME totalAwayDays the selected card shows - previously this read
                extended.start/end from a second, independently-ptoToAdd'd extendSabbatical
                call, so it could (and did) disagree with the card. Now there is only one
                number, computed once, inside bestPlacements. */}
            <h1 className="text-2xl font-bold tabular-nums leading-snug text-slate-900 sm:text-3xl">
              Take it from {formatLong(selected.start)} and you&apos;re away for {selected.totalAwayDays} consecutive days.
            </h1>
            <p className="mt-1 text-sm tabular-nums text-slate-600">
              {lengthWeeks} week{lengthWeeks === 1 ? '' : 's'} of sabbatical
              {/* 4C: unpaid leave is its own clause, distinct from PTO - "4 weeks
                  sabbatical + 2 weeks unpaid + 3 PTO days", per spec's own format. */}
              {unpaidWeeksToAdd ? ` + ${unpaidWeeksToAdd} week${unpaidWeeksToAdd === 1 ? '' : 's'} unpaid` : ''}
              {selected.ptoBefore ? ` + ${selected.ptoBefore} PTO day${selected.ptoBefore === 1 ? '' : 's'} before` : ''}
              {selected.ptoAfter ? ` + ${selected.ptoAfter} PTO day${selected.ptoAfter === 1 ? '' : 's'} after` : ''}
              {selected.unpaidBefore ? ` + ${selected.unpaidBefore} unpaid day${selected.unpaidBefore === 1 ? '' : 's'} before` : ''}
              {selected.unpaidAfter ? ` + ${selected.unpaidAfter} unpaid day${selected.unpaidAfter === 1 ? '' : 's'} after` : ''}
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
            <h1 className="text-2xl font-semibold text-slate-900">Plan your sabbatical</h1>
            <p role="status" className="mt-2 text-sm text-slate-500">Loading placements&hellip;</p>
          </Container>
        )}
      </div>

      <main id="main-content" tabIndex={-1}>
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
            {/* 4B: a real radio group, not just visually-selectable buttons - arrow keys
                aren't wired (buttons alone already give Tab+Enter/Space), but the
                semantics now correctly describe "choose one of three" to a screen reader. */}
            <div role="radiogroup" aria-label="Best placements" className="flex flex-col gap-2 sm:flex-row">
              {placements.map((p) => (
                <button
                  key={p.start}
                  type="button"
                  role="radio"
                  aria-checked={p.start === selected?.start}
                  onClick={() => setSelectedStart(p.start)}
                  className={`flex-1 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    p.start === selected?.start ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className="block font-medium tabular-nums text-slate-900">{formatShort(p.start)}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{placementNote(p)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 3. The extension tradeoff - marginal return, now visual (4A). */}
          {selected && (
            <section className="border-t border-slate-200 pt-6">
              <h2 className="mb-1 text-sm font-semibold text-slate-700">What each added day buys</h2>
              <MarginalBars marginal={selected.marginal} currentDaysUsed={ptoToAdd + unpaidWeeksToAdd * 7} />
              <p className="mt-2 text-sm text-slate-600">{marginalReturnText(selected.marginal)}</p>
            </section>
          )}

          {/* 2. Calendar - the same component as /pto, the block rendered distinctly
              ('pinned', the same treatment /pto uses for a forced-in day) from the PTO/
              unpaid days extending it. 3D: every month the trip touches, plus one month
              either side (calendarRange), not just the core block's own start. */}
          {selected && calendarRange && (
            <section className="border-t border-slate-200 pt-6">
              <SabbaticalLegend />
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

          {/* 5. Export row - same actions as /pto (4B). */}
          {selected && <SabbaticalExportRow placement={selected} lengthWeeks={lengthWeeks} unpaidWeeksToAdd={unpaidWeeksToAdd} />}

          {/* 6. Back to /pto. */}
          <p className="border-t border-slate-200 pt-6 text-sm text-slate-500">
            Planning ordinary time off too? <a href="/pto" className="underline hover:text-slate-700">Plan PTO &rarr;</a>
          </p>

          <SabbaticalFAQ />
        </Container>
      </main>
      <Footer />
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

/** 4A: one small bar per day already added (budget day 1..N, up to 15 shown), height
 * proportional to the days-away it bought - the drop-off or jump reads at a glance, in
 * greyscale (height-encoded, not color-encoded). The bar at the CURRENT slider position
 * (PTO + unpaid combined) is the darkest, tying the chart to the sliders live. */
function MarginalBars({ marginal, currentDaysUsed }: { marginal: { daysUsed: number; awayDays: number }[]; currentDaysUsed: number }) {
  if (marginal.length <= 1) return null;
  const gains = marginal.slice(1).map((m, i) => ({ daysUsed: m.daysUsed, gained: m.awayDays - marginal[i].awayDays }));
  const shown = gains.slice(0, 15);
  const maxGain = Math.max(...shown.map((g) => g.gained), 1);
  return (
    <div className="flex items-end gap-1" role="img" aria-label={shown.map((g) => `day ${g.daysUsed} adds ${g.gained} days away`).join(', ')}>
      {shown.map((g) => {
        const isCurrent = g.daysUsed === currentDaysUsed;
        return (
          <div key={g.daysUsed} className="flex flex-col items-center gap-0.5">
            <div
              className={`w-4 rounded-sm ${isCurrent ? 'bg-slate-800' : 'bg-slate-300'}`}
              style={{ height: `${Math.max(4, (g.gained / maxGain) * 40)}px` }}
            />
            <span className={`text-[10px] tabular-nums ${isCurrent ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{g.daysUsed}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Reuses the exact fill/border and PinIcon/UnpaidIcon treatment DayCell.tsx itself
 * renders, so the legend never describes a swatch the calendar doesn't actually have. */
function SabbaticalLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
      <span className="flex items-center gap-1.5">
        <span className={`flex h-5 w-5 items-center justify-center gap-0.5 rounded border ${COLORS.ptoBorder} ${COLORS.ptoBg} ${COLORS.ptoText}`}>
          <PinIcon className="h-3 w-3" />
        </span>
        Sabbatical block
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`h-5 w-5 rounded border ${COLORS.ptoBorder} ${COLORS.ptoBg}`} />
        PTO day
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`flex h-5 w-5 items-center justify-center gap-0.5 rounded border ${COLORS.ptoBorder} ${COLORS.ptoBg} ${COLORS.ptoText}`}>
          <UnpaidIcon className="h-3 w-3" />
        </span>
        Unpaid leave day
      </span>
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
    ctx.fillStyle = '#1c1917';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Away for ${placement.totalAwayDays} consecutive days`, 48, 110);
    ctx.font = '400 24px system-ui, sans-serif';
    ctx.fillStyle = '#57534e';
    ctx.fillText(`${formatLong(placement.extendedStart)} – ${formatLong(placement.extendedEnd)}`, 48, 150);
    ctx.font = '400 15px system-ui, sans-serif';
    ctx.fillStyle = '#6b645e';
    ctx.fillText(window.location.host, 48, SHARE_IMAGE_HEIGHT - 32);
    const result = await copyCanvasImage(canvas, 'sabbatical.png');
    flash(result.method === 'clipboard' ? 'Copied!' : result.method === 'download' ? 'Downloaded instead' : 'Could not copy');
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-6">
      <button
        type="button"
        onClick={() => downloadSabbaticalICS(placement.extendedStart, placement.extendedEnd, summary, description)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Add to calendar (.ics)
      </button>
      <button
        type="button"
        onClick={exportImage}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Copy as image
      </button>
      <button
        type="button"
        onClick={async () => {
          const ok = await copyText(window.location.href);
          flash(ok ? 'Copied!' : 'Could not copy - try selecting the address bar');
        }}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        Copy link
      </button>
      {message && <span className="text-sm text-slate-500">{message}</span>}
    </div>
  );
}

function SabbaticalFAQ() {
  return (
    <section id="questions" className="border-t border-slate-100 pt-6 text-sm text-slate-500">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Questions</h2>
      <div className="flex flex-col divide-y divide-slate-100">
        {SABBATICAL_FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group py-2.5">
            <summary className="cursor-pointer list-none">
              <h3 className="inline text-sm font-normal text-slate-600 marker:content-none group-open:text-slate-800">{item.question}</h3>
            </summary>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-slate-500">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
