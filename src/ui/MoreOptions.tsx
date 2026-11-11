import { useState } from 'react';
import type { WorkWeek } from '@daysoff/engine/solver/types';
import type { WeekStart } from '@daysoff/engine/calendar/calendarMath';
import { addDays, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { formatShortWithYear } from '@daysoff/engine/calendar/dateFormat';
import { isValidISODate } from './urlState';
import { DateListEditor } from './DateListEditor';
import { ImportCalendar } from './ImportCalendar';
import { todayISO, type HolidayEntry } from './useAppState';
import { Term } from './Term';
import { buttonClasses } from './Button';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const H4_CLASS = 'mb-2 text-[15px] font-semibold text-ink';
const FIELD_CLASS = 'h-11 min-w-0 max-w-full rounded-[6px] border border-line-strong bg-surface px-2.5 text-[15px] font-normal tabular-nums text-ink';
const CHECK_LABEL = 'flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm text-ink';
const NOTE = 'mt-1 text-sm text-muted';

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
  /** The plan's date range; repeating events in an imported .ics are expanded across it. */
  planningWindow?: { start: string; end: string };
  onRemoveBlackout: (d: string) => void;

  holidayEntries: HolidayEntry[];
  sharedHolidaySnapshot?: boolean;
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
  const oneWorkday = props.workWeek.filter(Boolean).length === 1;

  return (
    // Flows by the width it is given (a container query): one column in the desktop
    // control rail, two on a phone held sideways or a tablet.
    <div className="@container">
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 @min-[36rem]:grid-cols-2">
      <section>
        <h3 className={H4_CLASS}>
          <Term id="accrual">Accrual</Term>
        </h3>
        <label className={CHECK_LABEL}>
          <input
            type="checkbox"
            checked={props.accrualEnabled}
            onChange={(e) => props.onToggleAccrual(e.target.checked)}
          />
          Accrue monthly instead of all-at-once
        </label>
        {props.accrualEnabled && (
          <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
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
        <h3 className={H4_CLASS}>
          Expiry &amp; <Term id="carryover">carryover</Term>
        </h3>
        <label className={CHECK_LABEL}>
          <input
            type="checkbox"
            checked={props.expiryEnabled}
            onChange={(e) => props.onToggleExpiry(e.target.checked)}
          />
          PTO expires on a date
        </label>
        {props.expiryEnabled && (
          <div className="mt-2 flex flex-col gap-2">
            <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
              Expiry date
              <input
                type="date"
                value={props.expiryDate}
                onChange={(e) => props.onChangeExpiryDate(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
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
        <h3 className={H4_CLASS}>Requesting time off</h3>
        {/* Stage 6 quality-pass fix: Term must never be a <label> descendant - see
         * Policy.tsx's Field comment for why (a real, browser-verified interaction bug,
         * not a style preference). */}
        <div className="flex flex-wrap items-center gap-1 text-sm text-ink">
          <label className="flex flex-wrap items-center gap-2">
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
            calendar days
          </label>
          <Term id="notice-period">?</Term>
        </div>
        <p className={NOTE}>
          Drives the &quot;Request by&quot; date on each break card, and the lead time for the .ics reminder under Take it with you
          &mdash; the same number for both.
        </p>
      </section>

      <section>
        <h3 className={H4_CLASS}>Peak season limit</h3>
        <label className={CHECK_LABEL}>
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
              <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
                From
                <input
                  type="date"
                  value={props.peakCapStart}
                  onChange={(e) => props.onChangePeakCapStart(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
                to
                <input
                  type="date"
                  value={props.peakCapEnd}
                  onChange={(e) => props.onChangePeakCapEnd(e.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
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
        <p className={NOTE}>
          Off by default. Some employers cap how much leave you can take during a busy season
          &mdash; turn this on if yours does. The planner moves PTO out of that window where it can;
          days you pinned stay put.
        </p>
      </section>

      <section>
        <h3 className={H4_CLASS}>Week starts on</h3>
        <select
          aria-label="Week starts on"
          value={props.weekStartOverride}
          onChange={(e) => {
            const v = e.target.value;
            props.onChangeWeekStartOverride(v === 'auto' ? 'auto' : (Number(v) as WeekStart));
          }}
          className="select-ink min-w-0 max-w-full text-[15px] font-normal"
        >
          <option value="auto">Follow country</option>
          <option value={1}>Monday</option>
          <option value={0}>Sunday</option>
        </select>
      </section>

      <section>
        <h3 id="planning-assumptions" tabIndex={-1} className={`${H4_CLASS} scroll-mt-16`}>Work week</h3>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map((label, i) => (
            <label key={label} className="flex min-h-11 min-w-9 cursor-pointer flex-col items-center gap-1 text-xs font-medium text-ink">
              {label}
              <input
                type="checkbox"
                checked={props.workWeek[i]}
                disabled={props.workWeek[i] && oneWorkday}
                onChange={(e) => {
                  const next = [...props.workWeek] as WorkWeek;
                  next[i] = e.target.checked;
                  props.onChangeWorkWeek(next);
                }}
              />
            </label>
          ))}
        </div>
        <p className={NOTE}>Keep at least one working day selected.</p>
      </section>

      <section>
        <h3 className={H4_CLASS}>Compressed schedule (9/80)</h3>
        <label className={CHECK_LABEL}>
          <input
            type="checkbox"
            checked={props.altFridayEnabled}
            onChange={(e) => props.onToggleAltFriday(e.target.checked)}
          />
          Every other Friday off
        </label>
        {props.altFridayEnabled && (
          <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
            Starting Friday
            <input
              type="date"
              value={props.altFridayStart}
              onChange={(e) => props.onChangeAltFridayStart(e.target.value)}
              className={FIELD_CLASS}
            />
          </label>
        )}
        {props.altFridayEnabled && isValidISODate(props.altFridayStart) && mondayIndexedDow(props.altFridayStart) !== 4 && (
          <p className={NOTE}>
            That date isn&rsquo;t a Friday, so the plan counts from Friday,{' '}
            {formatShortWithYear(addDays(props.altFridayStart, 4 - mondayIndexedDow(props.altFridayStart)))}, that week.
          </p>
        )}
        <p className={NOTE}>
          For a plain 4-day week (off every Friday), just uncheck Friday in Work week above &mdash; this is only
          for a schedule that alternates week to week.
        </p>
      </section>

      <section>
        <h3 className={H4_CLASS}>Overlap days (someone else&apos;s time off)</h3>
        <DateListEditor label="Overlap date to add" dates={props.overlapDays} onAdd={props.onAddOverlapDay} onRemove={props.onRemoveOverlapDay} />
      </section>

      <section>
        <h3 className={H4_CLASS}>Days I can&apos;t take off</h3>
        <p className="mb-2 text-sm text-muted">
          Mandatory coverage, notice periods, quarter close, or any week you simply don&apos;t want. These
          narrow what the solver can pick. The efficiency score compares plans under the same limits.
        </p>
        <DateListEditor label="Unavailable date to add" dates={props.blackouts} onAdd={props.onAddBlackout} onRemove={props.onRemoveBlackout} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink">Block the next</span>
          <input
            type="number"
            min={1}
            max={365}
            value={blockNextN}
            onChange={(e) => setBlockNextN(Number(e.target.value))}
            className={`${FIELD_CLASS} w-16`}
            aria-label="Number of days to block"
          />
          <span className="text-sm text-ink">days</span>
          <button
            type="button"
            onClick={() => props.onAddBlackouts(blockNextNDays(todayISO(), blockNextN))}
            className={buttonClasses('secondary', 'md')}
          >
            Block
          </button>
          <span className="text-sm text-muted">for a notice period</span>
        </div>
      </section>

      <ImportCalendar onImportBusyDays={props.onAddBlackouts} planningWindow={props.planningWindow} />

      <section className="@min-[36rem]:col-span-2">
        <h3 id="employer-holidays" className={`${H4_CLASS} scroll-mt-16`}>My employer&apos;s holidays</h3>
        <p className="mb-3 max-w-prose text-sm text-muted">{props.sharedHolidaySnapshot
          ? 'These dates came from the shared plan. Switch to your saved calendar to edit employer holidays.'
          : 'Adjust these dates if your company follows a different calendar. Changes update your plan immediately.'}</p>
        <fieldset disabled={props.sharedHolidaySnapshot} className="min-w-0 border-0 p-0" aria-label="Employer holiday settings">
          <div className="flex max-h-64 flex-col overflow-auto border-y border-line">
            {props.holidayEntries.map((h) => (
              <div key={`${h.date}-${h.name}`} className="flex min-h-11 items-center justify-between gap-2 border-b border-line text-sm text-ink last:border-b-0">
                <label className="flex min-w-0 cursor-pointer items-center gap-2">
                  {(
                    <input
                      type="checkbox"
                      checked={h.checked}
                      onChange={() => (props.onToggleHoliday ?? props.onToggleStateHoliday)(h.date, h.name)}
                    />
                  )}
                  <span className="truncate">
                    {h.date} &mdash; {h.name}
                    <span className="ml-1 text-xs text-muted">({h.source === 'state' ? 'regional' : h.source === 'custom' ? 'company' : 'national'})</span>
                  </span>
                </label>
                {h.source === 'custom' && <button
                  type="button"
                  aria-label={`Delete ${h.name}`}
                  onClick={() => props.onRemoveHoliday(h.date, h.name)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] text-muted hover:bg-surface-alt hover:text-ink"
                >
                  &times;
                </button>}
              </div>
            ))}
            {props.holidayEntries.some((h) => h.source === 'state') && (
              <p className={NOTE}>
                Regional holidays are included by default. Uncheck any your employer does not observe.
              </p>
            )}
            {props.holidayEntries.length === 0 && <span className="py-2 text-sm text-muted">None loaded yet.</span>}
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
              className={`${FIELD_CLASS} w-40`}
            />
            <button
              type="button"
              onClick={() => {
                if (!newHolidayDate) return;
                props.onAddCustomHoliday(newHolidayDate, newHolidayName || 'Company holiday');
                setNewHolidayDate('');
                setNewHolidayName('');
              }}
              className={buttonClasses('secondary', 'md')}
            >
              Add
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={props.onSaveEmployerHolidays} className={buttonClasses('secondary', 'md')}>Save employer calendar</button>
            <button type="button" onClick={props.onResetEmployerHolidays} className={buttonClasses('quiet', 'md')}>Restore public holidays</button>
          </div>
          <p className="mt-2 text-sm text-muted">Saved calendars stay in this browser and apply only to this country and region.</p>
          {props.employerCalendarMessage && <p role="status" className="mt-2 text-sm text-ink">{props.employerCalendarMessage}</p>}
        </fieldset>
      </section>
    </div>
    </div>
  );
}
