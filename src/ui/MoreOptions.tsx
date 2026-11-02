import { useState } from 'react';
import type { WorkWeek } from '@daysoff/engine/solver/types';
import type { WeekStart } from '@daysoff/engine/calendar/calendarMath';
import { addDays, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { DateListEditor } from './DateListEditor';
import { ImportCalendar } from './ImportCalendar';
import { todayISO, type HolidayEntry } from './useAppState';
import { Term } from './Term';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const H4_CLASS = 'mb-2 text-sm font-semibold text-slate-700';
const FIELD_CLASS = 'rounded-md border border-slate-200 bg-white text-slate-800 px-2 py-1 text-sm';

interface MoreOptionsProps {
  weekStartOverride: WeekStart | 'auto';
  onChangeWeekStartOverride: (v: WeekStart | 'auto') => void;

  accrualEnabled: boolean;
  onToggleAccrual: (v: boolean) => void;
  accrualPerMonth: number;
  onChangeAccrualPerMonth: (v: number) => void;

  expiryEnabled: boolean;
  onToggleExpiry: (v: boolean) => void;
  expiryDate: string;
  onChangeExpiryDate: (v: string) => void;
  carryoverCap: number;
  onChangeCarryoverCap: (v: number) => void;

  noticePeriodDays: number;
  onChangeNoticePeriodDays: (v: number) => void;

  peakCapEnabled: boolean;
  onTogglePeakCap: (v: boolean) => void;
  peakCapStart: string;
  onChangePeakCapStart: (v: string) => void;
  peakCapEnd: string;
  onChangePeakCapEnd: (v: string) => void;
  peakCapMaxDays: number;
  onChangePeakCapMaxDays: (v: number) => void;

  overlapDays: string[];
  onAddOverlapDay: (d: string) => void;
  onRemoveOverlapDay: (d: string) => void;

  workWeek: WorkWeek;
  onChangeWorkWeek: (w: WorkWeek) => void;

  altFridayEnabled: boolean;
  onToggleAltFriday: (v: boolean) => void;
  altFridayStart: string;
  onChangeAltFridayStart: (v: string) => void;

  blackouts: string[];
  onAddBlackout: (d: string) => void;
  onAddBlackouts: (dates: string[]) => void;
  onRemoveBlackout: (d: string) => void;

  holidayEntries: HolidayEntry[];
  onRemoveHoliday: (date: string, name: string) => void;
  onToggleStateHoliday: (date: string, name: string) => void;
  onAddCustomHoliday: (date: string, name: string) => void;
  onToggleHoliday?: (date: string, name: string) => void;
  onSaveEmployerHolidays?: () => void;
  onResetEmployerHolidays?: () => void;
  employerCalendarMessage?: string;
}

/** Pure, directly unit-testable: `n` consecutive days starting from (and including) `todayIso`
 * - same pattern as validation.ts/dayCategory.ts. Exported so the exact day-count boundary
 * (does "block the next 14 days" mean 14 or 15 dates?) is tested directly, not just inferred
 * from a click handler. */
export function blockNextNDays(todayIso: string, n: number): string[] {
  if (!Number.isFinite(n) || n < 1) return [];
  return rangeISO(todayIso, addDays(todayIso, n - 1));
}

export function MoreOptions(props: MoreOptionsProps) {
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [blockNextN, setBlockNextN] = useState(14);

  return (
    <div className="grid grid-cols-1 gap-6 border-b border-slate-200 bg-slate-50 p-4 md:grid-cols-2 lg:grid-cols-3">
      <section>
        <h4 className={H4_CLASS}>
          <Term id="accrual">Accrual</Term>
        </h4>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={props.accrualEnabled}
            onChange={(e) => props.onToggleAccrual(e.target.checked)}
          />
          Accrue monthly instead of all-at-once
        </label>
        {props.accrualEnabled && (
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            Days / month
            <input
              type="number"
              step={0.25}
              min={0}
              value={props.accrualPerMonth}
              onChange={(e) => props.onChangeAccrualPerMonth(Number(e.target.value))}
              className={`${FIELD_CLASS} w-20`}
            />
          </label>
        )}
      </section>

      <section>
        <h4 className={H4_CLASS}>
          Expiry &amp; <Term id="carryover">carryover</Term>
        </h4>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={props.expiryEnabled}
            onChange={(e) => props.onToggleExpiry(e.target.checked)}
          />
          PTO expires on a date
        </label>
        {props.expiryEnabled && (
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Expiry date
              <input
                type="date"
                value={props.expiryDate}
                onChange={(e) => props.onChangeExpiryDate(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Carryover cap
              <input
                type="number"
                min={0}
                value={props.carryoverCap}
                onChange={(e) => props.onChangeCarryoverCap(Number(e.target.value))}
                className={`${FIELD_CLASS} w-20`}
              />
            </label>
          </div>
        )}
      </section>

      <section>
        <h4 className={H4_CLASS}>Requesting time off</h4>
        {/* Stage 6 quality-pass fix: Term must never be a <label> descendant - see
         * Policy.tsx's Field comment for why (a real, browser-verified interaction bug,
         * not a style preference). */}
        <div className="flex items-center gap-1 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            My employer&apos;s notice period
            <input
              type="number"
              min={0}
              max={90}
              step={1}
              value={props.noticePeriodDays}
              onChange={(e) => props.onChangeNoticePeriodDays(Number(e.target.value))}
              aria-label="Notice period in days"
              className={`${FIELD_CLASS} w-20`}
            />
            days
          </label>
          <Term id="notice-period">?</Term>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Drives the &quot;Request by&quot; date on each break card, and the lead time for the .ics reminder above
          &mdash; the same number for both.
        </p>
      </section>

      <section>
        <h4 className={H4_CLASS}>Peak season limit</h4>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={props.peakCapEnabled}
            onChange={(e) => props.onTogglePeakCap(e.target.checked)}
          />
          Limit how much time off I take in one window
        </label>
        {props.peakCapEnabled && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                From
                <input
                  type="date"
                  value={props.peakCapStart}
                  onChange={(e) => props.onChangePeakCapStart(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                to
                <input
                  type="date"
                  value={props.peakCapEnd}
                  onChange={(e) => props.onChangePeakCapEnd(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              No more than
              <input
                type="number"
                min={0}
                max={365}
                step={1}
                value={props.peakCapMaxDays}
                onChange={(e) => props.onChangePeakCapMaxDays(Number(e.target.value))}
                aria-label="Maximum PTO days in the peak window"
                className={`${FIELD_CLASS} w-20`}
              />
              PTO days in that window
            </label>
          </div>
        )}
        <p className="mt-1 text-xs text-slate-400">
          Off by default. Some employers cap how much leave you can take during a busy season
          &mdash; turn this on if yours does. The rest of your budget still gets used, just moved
          elsewhere in your range.
        </p>
      </section>

      <section>
        <h4 className={H4_CLASS}>Week starts on</h4>
        <select
          aria-label="Week starts on"
          value={props.weekStartOverride}
          onChange={(e) => {
            const v = e.target.value;
            props.onChangeWeekStartOverride(v === 'auto' ? 'auto' : (Number(v) as WeekStart));
          }}
          className={FIELD_CLASS}
        >
          <option value="auto">Follow country</option>
          <option value={1}>Monday</option>
          <option value={0}>Sunday</option>
        </select>
      </section>

      <section>
        <h4 className={H4_CLASS}>Work week</h4>
        <div className="flex gap-2">
          {WEEKDAY_LABELS.map((label, i) => (
            <label key={label} className="flex flex-col items-center gap-1 text-xs text-slate-600">
              {label}
              <input
                type="checkbox"
                checked={props.workWeek[i]}
                onChange={(e) => {
                  const next = [...props.workWeek] as WorkWeek;
                  next[i] = e.target.checked;
                  props.onChangeWorkWeek(next);
                }}
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h4 className={H4_CLASS}>Compressed schedule (9/80)</h4>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={props.altFridayEnabled}
            onChange={(e) => props.onToggleAltFriday(e.target.checked)}
          />
          Every other Friday off
        </label>
        {props.altFridayEnabled && (
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            Starting Friday
            <input
              type="date"
              value={props.altFridayStart}
              onChange={(e) => props.onChangeAltFridayStart(e.target.value)}
              className={FIELD_CLASS}
            />
          </label>
        )}
        <p className="mt-1 text-xs text-slate-400">
          For a plain 4-day week (off every Friday), just uncheck Friday in Work week above &mdash; this is only
          for a schedule that alternates week to week.
        </p>
      </section>

      <section>
        <h4 className={H4_CLASS}>Overlap days (someone else&apos;s time off)</h4>
        <DateListEditor dates={props.overlapDays} onAdd={props.onAddOverlapDay} onRemove={props.onRemoveOverlapDay} />
      </section>

      <section>
        <h4 className={H4_CLASS}>Days I can&apos;t take off</h4>
        <p className="mb-2 text-xs text-slate-400">
          Mandatory coverage, notice periods, quarter close, or any week you simply don&apos;t want &mdash; these
          narrow what the solver can pick. They never count against your travel or efficiency scores.
        </p>
        <DateListEditor dates={props.blackouts} onAdd={props.onAddBlackout} onRemove={props.onRemoveBlackout} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Block the next</span>
          <input
            type="number"
            min={1}
            max={365}
            value={blockNextN}
            onChange={(e) => setBlockNextN(Number(e.target.value))}
            className={`${FIELD_CLASS} w-16`}
            aria-label="Number of days to block"
          />
          <span className="text-xs text-slate-500">days</span>
          <button
            type="button"
            onClick={() => props.onAddBlackouts(blockNextNDays(todayISO(), blockNextN))}
            className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            Block
          </button>
          <span className="text-xs text-slate-400">for a notice period</span>
        </div>
      </section>

      <ImportCalendar onImportBusyDays={props.onAddBlackouts} />

      <section>
        <h4 className={H4_CLASS}>My employer&apos;s holidays</h4>
        <p className="mb-3 max-w-prose text-xs text-slate-600">We&apos;ve assumed your employer observes public holidays. Adjust these dates if your company follows a different calendar. Changes update your plan immediately.</p>
        <div className="flex max-h-56 flex-col gap-1 overflow-auto">
          {props.holidayEntries.map((h) => (
            <div key={`${h.date}-${h.name}`} className="flex items-center justify-between gap-2 text-sm text-slate-600">
              <label className="flex min-w-0 items-center gap-2">
                {(
                  <input
                    type="checkbox"
                    checked={h.checked}
                    onChange={() => (props.onToggleHoliday ?? props.onToggleStateHoliday)(h.date, h.name)}
                  />
                )}
                <span className="truncate">
                  {h.date} &mdash; {h.name}
                  <span className="ml-1 text-xs text-slate-500">({h.source === 'state' ? 'regional' : h.source === 'custom' ? 'company' : 'national'})</span>
                </span>
              </label>
              {h.source === 'custom' && <button
                type="button"
                aria-label={`Delete ${h.name}`}
                onClick={() => props.onRemoveHoliday(h.date, h.name)}
                className="shrink-0 text-slate-400 hover:text-slate-700"
              >
                &times;
              </button>}
            </div>
          ))}
          {props.holidayEntries.some((h) => h.source === 'state') && (
            <p className="mt-1 text-xs text-slate-400">
              Regional holidays are included by default. Uncheck any your employer does not observe.
            </p>
          )}
          {props.holidayEntries.length === 0 && <span className="text-sm text-slate-400">None loaded yet.</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Company holiday date"
            value={newHolidayDate}
            onChange={(e) => setNewHolidayDate(e.target.value)}
            className={FIELD_CLASS}
          />
          <input
            type="text"
            placeholder="Holiday name"
            aria-label="Company holiday name"
            maxLength={160}
            value={newHolidayName}
            onChange={(e) => setNewHolidayName(e.target.value)}
            className={`${FIELD_CLASS} w-32`}
          />
          <button
            type="button"
            onClick={() => {
              if (!newHolidayDate) return;
              props.onAddCustomHoliday(newHolidayDate, newHolidayName || 'Company holiday');
              setNewHolidayDate('');
              setNewHolidayName('');
            }}
            className="rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Add
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={props.onSaveEmployerHolidays} className="min-h-10 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">Save employer calendar</button>
          <button type="button" onClick={props.onResetEmployerHolidays} className="min-h-10 text-sm underline">Restore public holidays</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Saved calendars stay in this browser and apply only to this country and region.</p>
        {props.employerCalendarMessage && <p role="status" className="mt-2 text-sm text-slate-700">{props.employerCalendarMessage}</p>}
      </section>
    </div>
  );
}
