import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { COLORS, HOLIDAY_DOT } from './colorScheme';

/** What a day is on /family's calendar. School closures are the subject; each is drawn by
 * who has the kids that day. Every state has its own shape, not only its own colour. */
export type FamilyDayState = 'together' | 'pto' | 'other-adult' | 'other-adult-proposed' | 'uncovered' | 'free' | 'none';

const HATCH_STYLE = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--text-primary) 0 1.5px, transparent 1.5px 6px)',
} as const;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_MONDAY = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_SUNDAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const STATE_WORDS: Record<FamilyDayState, string> = {
  together: 'school is off and you are off: a day with your kids',
  pto: 'school is off, your PTO: a day with your kids',
  'other-adult': 'school is off, covered by the other adult',
  'other-adult-proposed': 'school is off, the other adult proposed cover and still needs to confirm',
  uncovered: 'school is off and you work: uncovered',
  free: 'your day off',
  none: '',
};

const swatch = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px]';

/** The legend draws exactly the marks the calendar draws. */
export function FamilyLegend({ otherAdultStatus }: { otherAdultStatus?: 'proposed' | 'confirmed' }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} border-b-[3px] border-accent bg-mark`} />
        School off, you&apos;re off: days with your kids
      </li>
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} border ${COLORS.ptoBorder} ${COLORS.ptoBg}`} />
        Your PTO on a school day off
      </li>
      {otherAdultStatus && (
        <li className="flex min-h-7 items-center gap-2">
          <span aria-hidden="true" className={`${swatch} relative border-2 border-ink bg-surface ${otherAdultStatus === 'proposed' ? 'border-dashed' : ''}`}><OtherAdultNotch /></span>
          {otherAdultStatus === 'confirmed' ? 'Covered by the other adult' : 'Other adult proposed cover'}
        </li>
      )}
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} relative border border-dashed border-ink bg-surface`}><span className="absolute inset-0 rounded-[6px] opacity-25" style={HATCH_STYLE} /></span>
        Uncovered: school is off and you work
      </li>
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} bg-surface-alt`} />
        Your other scheduled days off
      </li>
      <li className="flex min-h-7 items-center gap-2">
        <span aria-hidden="true" className={`${swatch} relative border border-line`}><span className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${HOLIDAY_DOT}`} /></span>
        Observed holiday
      </li>
    </ul>
  );
}

function OtherAdultNotch() {
  return <span aria-hidden="true" className="absolute right-0 top-0 h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent border-t-ink" />;
}

/**
 * A read-only month grid in the same drawing language as /sabbatical's and /pto's calendars
 * (country week start, ink PTO cells, weekend tone, holiday dot, 2px today ring), showing
 * only the months that contain a school closure. Each day says its state in words for
 * screen readers.
 */
export function FamilyCalendar({
  months, weekStart, today, stateFor, holidayNameFor, labelFor,
}: {
  /** First-of-month ISO dates to draw, sorted. */
  months: readonly string[];
  weekStart: 0 | 1;
  today: string;
  stateFor: (iso: string) => FamilyDayState;
  holidayNameFor: (iso: string) => string | undefined;
  labelFor: (iso: string) => string | undefined;
}) {
  const labels = weekStart === 0 ? WEEKDAYS_SUNDAY : WEEKDAYS_MONDAY;
  return (
    <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
      {months.map((first) => {
        const [y, mo] = first.split('-').map(Number);
        const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const lead = (mondayIndexedDow(first) + (weekStart === 0 ? 1 : 0)) % 7;
        const cells: (string | null)[] = Array.from({ length: lead }, () => null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(`${first.slice(0, 8)}${String(d).padStart(2, '0')}`);
        while (cells.length % 7) cells.push(null);
        const monthName = `${MONTH_NAMES[mo - 1]} ${y}`;
        return (
          <div key={first} role="group" aria-label={monthName} className="min-w-0">
            <p aria-hidden="true" className="mb-1 text-base font-bold text-ink">{monthName}</p>
            <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
              {labels.map((label) => <span key={label}>{label}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((iso, i) => {
                if (!iso) return <span key={i} aria-hidden="true" />;
                const state = stateFor(iso);
                const holidayName = holidayNameFor(iso);
                const label = labelFor(iso);
                const fill =
                  state === 'pto' ? `${COLORS.ptoBg} border ${COLORS.ptoBorder} text-white font-bold`
                    : state === 'together' ? 'bg-mark border-b-[3px] border-accent font-semibold text-ink'
                      : state === 'other-adult' ? 'border-2 border-ink bg-surface font-semibold text-ink'
                        : state === 'other-adult-proposed' ? 'border-2 border-dashed border-ink bg-surface font-semibold text-ink'
                          : state === 'uncovered' ? 'border border-dashed border-ink bg-surface font-bold text-ink'
                            : state === 'free' ? 'bg-surface-alt text-muted' : 'text-ink';
                const words = [`${MONTH_NAMES[mo - 1]} ${Number(iso.slice(8))}`, STATE_WORDS[state], label ?? '', holidayName ? `observed holiday: ${holidayName}` : '', iso === today ? 'today' : ''].filter(Boolean).join(', ');
                return (
                  <span
                    key={iso}
                    title={[label, holidayName].filter(Boolean).join(' · ') || undefined}
                    className={`relative flex h-10 items-center justify-center rounded-[6px] text-sm font-medium tabular-nums ${fill} ${
                      iso === today ? 'ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-surface)]' : ''
                    }`}
                  >
                    {state === 'uncovered' && <span aria-hidden="true" className="absolute inset-0 rounded-[6px] opacity-25" style={HATCH_STYLE} />}
                    <span aria-hidden="true" className={state === 'uncovered' ? 'relative bg-surface px-0.5' : undefined}>{Number(iso.slice(8))}</span>
                    <span className="sr-only">{words}</span>
                    {(state === 'other-adult' || state === 'other-adult-proposed') && <OtherAdultNotch />}
                    {holidayName && state !== 'pto' && (
                      <span aria-hidden="true" className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${HOLIDAY_DOT}`} />
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
