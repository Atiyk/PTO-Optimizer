import { useState } from 'react';
import { isoToSerial, addDays } from '@daysoff/engine/solver/dateUtils';
import { monthLabel } from '@daysoff/engine/calendar/calendarMath';
import { findDrySpells } from './landingData';
import type { Holiday } from '@daysoff/engine/data/holidays';

interface YearStripProps {
  today: string;
  stripEnd: string;
  holidays: Holiday[];
  bridgeableHolidayDates: ReadonlySet<string>;
}

const WIDTH = 920;
const HEIGHT = 110;
const BASELINE_Y = 56;
const DRY_SPELL_THRESHOLD_DAYS = 8;

function daysAwayLabel(today: string, date: string): string {
  const n = isoToSerial(date) - isoToSerial(today);
  return `${n} day${n === 1 ? '' : 's'} away`;
}

/**
 * The one memorable visual on the landing page - position encoding only (x = time, tick
 * height = how long a break that holiday is already part of), never colour, so it stays
 * legible in greyscale and at any width. A fixed pixel width wrapped in an overflow-x-auto
 * container, per spec, rather than compressing illegibly at 375px.
 */
export function YearStrip({ today, stripEnd, holidays, bridgeableHolidayDates }: YearStripProps) {
  const startSerial = isoToSerial(today);
  const endSerial = isoToSerial(stripEnd);
  const span = endSerial - startSerial || 1;
  const x = (iso: string) => ((isoToSerial(iso) - startSerial) / span) * WIDTH;

  // K4: reuses landingData.ts's own boundary logic (today/horizonEnd act as implicit
  // breaks too) instead of a second, separately-broken "run of working days" computation -
  // that duplicate had the identical bug (a weekend always ended it, so the shading below
  // could never actually reach its own 8-day threshold).
  const holidaySet = new Set(holidays.map((h) => h.date));
  const drySpells = findDrySpells(today, stripEnd, holidaySet, undefined, DRY_SPELL_THRESHOLD_DAYS);

  // 5B: ticks have no native touch equivalent of hover, so a tap toggles the same info a
  // mouse hover already gets via <title> - the single open tooltip (not per-tick state) is
  // enough since only one can be open at a time anyway.
  const [tappedDate, setTappedDate] = useState<string | null>(null);
  const tapped = holidays.find((h) => h.date === tappedDate);

  // One label per calendar month the strip touches - but the very first ("today's" partial
  // month) and the second can land only a handful of pixels apart when today is near the
  // end of its month, so a simple minimum-gap rule drops whichever would collide rather
  // than overlapping two illegible labels.
  const MIN_LABEL_GAP = 86;
  const months: { x: number; label: string }[] = [];
  let cursor = today;
  while (cursor <= stripEnd) {
    const [y, m] = cursor.split('-').map(Number);
    const candidateX = x(cursor);
    const prev = months[months.length - 1];
    if (!prev || candidateX - prev.x >= MIN_LABEL_GAP) {
      months.push({ x: candidateX, label: monthLabel(y, m) });
    }
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    cursor = nextMonth;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        className="min-w-[920px]"
        role="img"
        aria-label={`A timeline of the next twelve months from today, marking ${holidays.length} public holiday${holidays.length === 1 ? '' : 's'} and the longest stretches without a day off.`}
      >
        {/* Dry-spell regions: shaded, not coloured - a neutral fill reads the same in greyscale. */}
        {drySpells.map((run) => (
          <rect
            key={`dry-${run.start}`}
            x={x(run.start)}
            y={BASELINE_Y - 10}
            width={Math.max(1, x(addDays(run.end, 1)) - x(run.start))}
            height={20}
            className="fill-slate-100"
          />
        ))}

        {/* Baseline. */}
        <line x1={0} y1={BASELINE_Y} x2={WIDTH} y2={BASELINE_Y} className="stroke-slate-200" strokeWidth={1} />

        {/* Today marker. */}
        <line x1={0} y1={BASELINE_Y - 24} x2={0} y2={BASELINE_Y + 24} className="stroke-slate-900" strokeWidth={2} />
        <text x={4} y={BASELINE_Y - 28} className="fill-slate-900 text-[10px] font-semibold">
          Today
        </text>

        {/* Holiday ticks - taller for a holiday already part of a longer break (>=3 days),
            giving the viewer the "creating a long weekend" signal by height alone. A wider
            transparent rect around each tick is the real tap/click target - the 1-2px line
            itself is far too thin to hit reliably, on touch especially. */}
        {holidays.map((h) => {
          const tall = bridgeableHolidayDates.has(h.date);
          const tickHeight = tall ? 20 : 10;
          return (
            <g key={h.date}>
              <line
                x1={x(h.date)}
                y1={BASELINE_Y - tickHeight}
                x2={x(h.date)}
                y2={BASELINE_Y}
                className={tall ? 'stroke-slate-900' : 'stroke-slate-400'}
                strokeWidth={tall ? 2 : 1}
                pointerEvents="none"
              >
                <title>{`${h.name} — ${h.date}`}</title>
              </line>
              {/* 5B: tapping (no hover on touch) toggles the same info the <title> above
                  gives a mouse. */}
              <rect
                x={x(h.date) - 6}
                y={BASELINE_Y - 24}
                width={12}
                height={44}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => setTappedDate((d) => (d === h.date ? null : h.date))}
                aria-label={`${h.name}, ${h.date}`}
                role="button"
                tabIndex={0}
              />
            </g>
          );
        })}

        {/* Month labels beneath. */}
        {months.map((m) => (
          <text key={m.label + m.x} x={m.x} y={HEIGHT - 6} className="fill-slate-500 text-[10px]">
            {m.label}
          </text>
        ))}
      </svg>
      {tapped && (
        <p className="mt-1 text-xs text-slate-600">
          {tapped.name} — {daysAwayLabel(today, tapped.date)}
        </p>
      )}
    </div>
  );
}
