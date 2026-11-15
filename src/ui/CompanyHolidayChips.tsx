import { useEffect, useId, useMemo, useState } from 'react';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { COLLAPSED_CHIP_COUNT, holidayChoices, resolveHolidayEntries, type HolidayChoice } from '../personal/employerHolidayChoices';
import type { EmployerHolidayProfile } from './useEmployerHolidayProfile';
import { buttonClasses } from './Button';

export const HOLIDAY_QUESTION = 'Which of these holidays does your company give you off?';
const US_HELPER = 'Not sure? Most private employers give New Year’s Day, Memorial Day, July 4, Labor Day, Thanksgiving and Christmas.';
const FIELD = 'h-11 min-w-0 max-w-full rounded-[6px] border border-line-strong bg-surface px-2.5 text-[15px] tabular-nums text-ink';
const QUIET_LINK = 'inline-flex min-h-11 items-center text-sm text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink';

export interface CompanyHolidayChipsProps {
  country: string;
  choices: readonly HolidayChoice[];
  onToggle: (id: string) => void;
  /** Quiet status: "Saved for United States." */
  status?: string;
  canUndo?: boolean;
  onUndo?: () => void;
  onReset?: () => void;
  /** Adds a dated company day off (the employer calendar's custom days). */
  onAddCompanyDay?: (date: string, name: string) => void;
  /** Homepage: smaller heading, no company-day form. */
  compact?: boolean;
  /** Read-only when the plan uses a shared holiday snapshot. */
  disabled?: boolean;
}

const KIND_HINT: Record<HolidayChoice['kind'], string> = {
  public: '', regional: 'state', extra: 'company', custom: 'company',
};

function Check({ state }: { state: boolean | 'mixed' }) {
  if (state === false) return null;
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      {state === 'mixed'
        ? <path d="M3 6h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        : <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/**
 * "Which of these holidays does your company give you off?" as toggle chips. Each chip is
 * a button with aria-pressed (true, false or mixed when only some years are on), 44px tall,
 * in a wrapping row that collapses after eight. Edits apply to the plan at once and save
 * in this browser; there is no separate save step.
 */
export function CompanyHolidayChips(props: CompanyHolidayChipsProps) {
  const { choices, compact = false, disabled = false } = props;
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  if (choices.length === 0) return null;
  // Collapsed: the first eight, plus any company day the user added (never hidden).
  const visible = expanded ? choices : choices.filter((choice, index) => index < COLLAPSED_CHIP_COUNT || choice.kind === 'custom');
  const hiddenCount = choices.length - visible.length;

  return (
    <section data-holiday-chips aria-labelledby={`${id}-q`} className="flex min-w-0 flex-col gap-2">
      <h3 id={`${id}-q`} className={compact ? 'text-base font-semibold text-ink' : 'text-lg font-semibold text-ink'}>{HOLIDAY_QUESTION}</h3>
      {props.country === 'US' && <p className="max-w-prose text-sm text-muted">{US_HELPER}</p>}
      <ul className="flex min-w-0 flex-wrap gap-2" aria-label="Holidays">
        {visible.map((choice) => {
          const hint = KIND_HINT[choice.kind];
          const on = choice.pressed;
          return (
            <li key={choice.id} className="min-w-0 max-w-full">
              <button
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => props.onToggle(choice.id)}
                className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[6px] border px-3 text-left text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${on === true
                  ? 'border-accent bg-accent-soft text-accent-ink'
                  : on === 'mixed' ? 'border-dashed border-accent bg-surface text-accent-ink' : 'border-line-strong bg-surface text-ink hover:border-ink'}`}
              >
                <Check state={on} />
                <span className="min-w-0 truncate">{choice.label}</span>
                {hint && <span className="shrink-0 text-xs font-normal text-muted">{hint}</span>}
                {on === 'mixed' && <span className="sr-only">, some years only</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4">
        {(hiddenCount > 0 || expanded) && (
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className={QUIET_LINK}>
            {expanded ? 'Show fewer' : `Show all ${choices.length}`}
          </button>
        )}
        {!compact && props.onAddCompanyDay && !disabled && (
          <button type="button" aria-expanded={adding} aria-controls={`${id}-add`} onClick={() => setAdding(!adding)} className={QUIET_LINK}>
            Add a company day
          </button>
        )}
      </div>
      {adding && !compact && props.onAddCompanyDay && (
        <div id={`${id}-add`} className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="Company day off date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} />
          <input type="text" aria-label="Company day off name" placeholder="Name (optional)" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className={`${FIELD} w-44`} />
          <button
            type="button"
            disabled={!date}
            onClick={() => { props.onAddCompanyDay?.(date, name || 'Company holiday'); setDate(''); setName(''); }}
            className={buttonClasses('secondary', 'md')}
          >
            Add
          </button>
        </div>
      )}
      {(props.status || props.canUndo || props.onReset) && (
        <div className="flex flex-wrap items-center gap-x-4 text-sm text-muted">
          <p role="status" className="min-h-5">{props.status}</p>
          {props.canUndo && props.onUndo && <button type="button" onClick={props.onUndo} className={QUIET_LINK}>Undo</button>}
          {props.onReset && !disabled && <button type="button" onClick={props.onReset} className={QUIET_LINK}>Reset to public holidays</button>}
        </div>
      )}
    </section>
  );
}

/** The planner's slice of useAppState this question needs. */
export interface PlannerHolidayState {
  country: string;
  holidayChoices: HolidayChoice[];
  toggleHolidayChoice: (id: string) => void;
  employerCalendarMessage: string;
  canUndoEmployerHolidays: boolean;
  undoEmployerHolidays: () => void;
  resetEmployerHolidays: () => void;
  addCustomHoliday: (date: string, name: string) => void;
  hasSharedHolidaySnapshot: boolean;
}

/** /pto: the question under the break list. */
export function PlannerHolidayQuestion({ state }: { state: PlannerHolidayState }) {
  return (
    <div className="border-t border-line pt-4">
      <CompanyHolidayChips
        country={state.country}
        choices={state.holidayChoices}
        onToggle={state.toggleHolidayChoice}
        status={state.employerCalendarMessage || 'Changes save automatically in this browser.'}
        canUndo={state.canUndoEmployerHolidays}
        onUndo={state.undoEmployerHolidays}
        onReset={state.resetEmployerHolidays}
        onAddCompanyDay={state.addCustomHoliday}
        disabled={state.hasSharedHolidaySnapshot}
      />
    </div>
  );
}

/** Homepage: the compact question under the preview, for the country's public holidays.
 * Rendered after mount only: the saved calendar lives in this browser, so the prerendered
 * page cannot know which chips are pressed. */
export function HomeHolidayQuestion({ profile, publicHolidays, rangeStart, rangeEnd }: {
  profile: EmployerHolidayProfile;
  publicHolidays: Holiday[];
  rangeStart: string;
  rangeEnd: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const country = profile.calendar.country;
  const entries = useMemo(() => {
    const national = publicHolidays.filter((holiday) => !holiday.counties && holiday.countryCode === country
      && holiday.date >= rangeStart && holiday.date <= rangeEnd);
    return resolveHolidayEntries(national, [], profile.calendar, rangeStart, rangeEnd);
  }, [publicHolidays, profile.calendar, country, rangeStart, rangeEnd]);
  const choices = useMemo(() => holidayChoices(entries, country, { start: rangeStart, end: rangeEnd }), [entries, country, rangeStart, rangeEnd]);
  if (!mounted) return null;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <CompanyHolidayChips
        compact
        country={country}
        choices={choices}
        onToggle={(id) => { const choice = choices.find((item) => item.id === id); if (choice) profile.toggle(choice, entries); }}
        status={profile.status || 'Changes save in this browser and carry over to the full planner.'}
        canUndo={profile.canUndo}
        onUndo={profile.undo}
        onReset={profile.reset}
      />
    </div>
  );
}
