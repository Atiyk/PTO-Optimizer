import { formatLong } from '@daysoff/engine/calendar/dateFormat';
import type { PlanningStyle } from '../planning/optimizer';
import { SEASONS, type PlanStyleMeta, type Season } from '../planning/yearPlan';

interface StyleChoice {
  style: PlanningStyle;
  label: string;
  hint: string;
}

/** Goals, in the words a person would use. `balanced` and `custom` keep working for old
 * links and slider edits; they appear only while active, so the group always shows the
 * style in use. */
const GOALS: StyleChoice[] = [
  { style: 'year', label: 'Spread across the year', hint: 'Breaks in at least three seasons, a little PTO kept for surprises, nothing in the next few weeks.' },
  { style: 'max', label: 'Most days off', hint: 'The most days off for your PTO. Breaks may bunch together or be mostly long weekends.' },
  { style: 'long-breaks', label: 'One big trip', hint: 'Your PTO in one long break.' },
  { style: 'more-breaks', label: 'Frequent long weekends', hint: 'Many short breaks through the year.' },
  { style: 'season', label: 'Seasonal priority', hint: 'One big break in the season you choose; the rest spread out.' },
];
const LEGACY: Partial<Record<PlanningStyle, StyleChoice>> = {
  balanced: { style: 'balanced', label: 'Balanced', hint: 'Up to three breaks, mostly days off (the style this link was made with).' },
  custom: { style: 'custom', label: 'Custom', hint: 'Set by the sliders under More options.' },
};

const SEASON_LABEL: Record<Season, string> = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };

interface PlanStylePickerProps {
  style: PlanningStyle;
  onChangeStyle: (style: PlanningStyle) => void;
  season: Season;
  onChangeSeason: (season: Season) => void;
  meta?: PlanStyleMeta;
  pending?: boolean;
}

export function PlanStylePicker({ style, onChangeStyle, season, onChangeSeason, meta, pending }: PlanStylePickerProps) {
  const legacy = LEGACY[style];
  const choices = legacy ? [...GOALS, legacy] : GOALS;
  const showMeta = !pending && meta && (meta.style === style || (style === 'season' && meta.style === 'season'));
  return (
    <fieldset className="flex min-w-0 flex-col gap-1" aria-describedby={showMeta ? 'plan-style-summary' : undefined}>
      <legend className="mb-1.5 text-sm font-semibold text-ink">What do you want from your PTO?</legend>
      {choices.map((choice) => {
        const id = `plan-style-${choice.style}`;
        return (
          <div key={choice.style} className="flex min-w-0 flex-col">
            <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5 text-[15px] text-ink">
              <input
                id={id}
                type="radio"
                name="plan-style"
                value={choice.style}
                checked={style === choice.style}
                onChange={() => onChangeStyle(choice.style)}
                aria-describedby={`${id}-hint`}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="font-semibold">{choice.label}</span>
                <span id={`${id}-hint`} className="block text-sm text-muted">{choice.hint}</span>
              </span>
            </label>
            {choice.style === 'season' && (
              <label className="ml-6.5 flex min-h-11 items-center gap-2 text-sm text-ink">
                <span>Season</span>
                <select
                  aria-label="Season for the big break"
                  className="select-ink min-h-11 text-[15px] font-normal"
                  value={season}
                  onChange={(event) => onChangeSeason(event.target.value as Season)}
                >
                  {SEASONS.map((value) => <option key={value} value={value}>{SEASON_LABEL[value]}</option>)}
                </select>
              </label>
            )}
          </div>
        );
      })}
      {showMeta && <PlanStyleSummary meta={meta} />}
    </fieldset>
  );
}

function PlanStyleSummary({ meta }: { meta: PlanStyleMeta }) {
  const lines: string[] = [];
  if (meta.reserveKept > 0) lines.push(`${meta.reserveKept} PTO ${meta.reserveKept === 1 ? 'day' : 'days'} kept in reserve for surprises.`);
  if (meta.leadUntil) lines.push(`New breaks start from ${formatLong(meta.leadUntil)}, leaving time to request them.`);
  if (meta.note) lines.push(meta.note);
  if (lines.length === 0) return null;
  return (
    <p id="plan-style-summary" className="mt-1 text-sm text-muted" data-testid="plan-style-summary">{lines.join(' ')}</p>
  );
}
