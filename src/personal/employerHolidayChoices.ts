import type { Holiday } from '@daysoff/engine/data/holidays';
import { addDays, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { upgradeEmployerCalendar, type EmployerCalendar } from './employerCalendar';
import { holidayChipLabel, holidayDisplayName } from './holidayDisplayNames';

/**
 * Which holidays the employer gives, as one pure model shared by /pto, the homepage
 * preview, family/policy calendars and the plan feed. Pure: no storage, no React.
 */

/** One holiday on one date, and whether the plan counts it as a day off. */
export interface HolidayEntry {
  date: string;
  /** Display name for this country ("Labor Day" in the US). */
  name: string;
  /** public = national, state = regional, custom = employer-observed (company days and extras). */
  source: 'public' | 'custom' | 'state';
  checked: boolean;
  /** The data-source name when it differs from `name`: the identifier in `date|name` keys. */
  sourceName?: string;
  /** Set for an employer extra (e.g. 'christmas-eve'). */
  extra?: string;
}

/** The identifier half of the `date|name` key an employer calendar stores. */
export function entrySourceName(entry: Pick<HolidayEntry, 'name' | 'sourceName'>): string {
  return entry.sourceName ?? entry.name;
}

export function entryKey(entry: Pick<HolidayEntry, 'date' | 'name' | 'sourceName'>): string {
  return `${entry.date}|${entrySourceName(entry)}`;
}

// ---------------------------------------------------------------------------------------
// Employer-only extra days. Not public holidays anywhere; many US employers give them.
// When the day falls on a weekend (or on the observed date of the holiday next to it) it
// moves to the closest earlier working day, as most company calendars do.
// ---------------------------------------------------------------------------------------

export interface EmployerExtraRule {
  id: string;
  name: string;
  dateFor: (year: number) => string;
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function christmasEve(year: number): string {
  const eve = iso(year, 12, 24);
  const dow = mondayIndexedDow(eve);
  if (dow === 4) return addDays(eve, -1); // Christmas on Saturday is observed Friday the 24th.
  if (dow === 5) return addDays(eve, -1); // Saturday -> Friday 23rd
  if (dow === 6) return addDays(eve, -2); // Sunday -> Friday 22nd
  return eve;
}

function dayAfterThanksgiving(year: number): string {
  const first = iso(year, 11, 1);
  const firstThursday = 1 + ((3 - mondayIndexedDow(first) + 7) % 7);
  return addDays(iso(year, 11, firstThursday), 22);
}

function newYearsEve(year: number): string {
  const eve = iso(year, 12, 31);
  const dow = mondayIndexedDow(eve);
  if (dow === 4) return addDays(eve, -1); // New Year's Day on Saturday is observed Friday the 31st.
  if (dow === 5) return addDays(eve, -1);
  if (dow === 6) return addDays(eve, -2);
  return eve;
}

const EXTRA_RULES: Record<string, EmployerExtraRule[]> = {
  US: [
    { id: 'christmas-eve', name: 'Christmas Eve', dateFor: christmasEve },
    { id: 'day-after-thanksgiving', name: 'Day after Thanksgiving', dateFor: dayAfterThanksgiving },
    { id: 'new-years-eve', name: "New Year's Eve", dateFor: newYearsEve },
  ],
};

export function employerExtraRules(country: string): EmployerExtraRule[] {
  return EXTRA_RULES[country] ?? [];
}

export function employerExtraDates(rule: EmployerExtraRule, rangeStart: string, rangeEnd: string): string[] {
  const dates: string[] = [];
  for (let year = Number(rangeStart.slice(0, 4)); year <= Number(rangeEnd.slice(0, 4)); year++) {
    const date = rule.dateFor(year);
    if (date >= rangeStart && date <= rangeEnd) dates.push(date);
  }
  return dates;
}

/**
 * US state holidays are mostly state-government office days that private employers rarely
 * give, so in the US they are opt-in. Elsewhere a region's holidays are public holidays
 * for everyone working there (German state holidays, Scottish bank holidays), so they stay
 * on unless the employer skips them, like national ones.
 */
export function regionalHolidaysOptIn(country: string): boolean {
  return country === 'US';
}

// ---------------------------------------------------------------------------------------
// Resolution: holiday data + employer calendar -> entries.
// ---------------------------------------------------------------------------------------

/**
 * A version 1 calendar resolves exactly as it always did (dates and checked flags), so old
 * links reproduce: every public and regional holiday on unless excluded, plus company days.
 * Only the display `name` is localized; the identifier stays in `sourceName`.
 */
export function resolveHolidayEntries(
  nationalHolidays: Holiday[], stateHolidayCandidates: Holiday[], employerCalendar: EmployerCalendar,
  rangeStart: string, rangeEnd: string,
): HolidayEntry[] {
  const country = employerCalendar.country;
  const v2 = employerCalendar.version === 2;
  const excluded = new Set(employerCalendar.excluded);
  const skipped = new Set(v2 ? employerCalendar.skipped ?? [] : []);
  const regional = v2 ? new Set(employerCalendar.regional ?? []) : null;
  const extrasOn = new Set(v2 ? employerCalendar.extras ?? [] : []);
  const entries = new Map<string, HolidayEntry>();
  const add = (date: string, sourceName: string, source: HolidayEntry['source'], on: boolean, extra?: string) => {
    const key = `${date}|${sourceName}`;
    if (entries.has(key)) return;
    const name = source === 'custom' && !extra ? sourceName : holidayDisplayName(sourceName, country);
    entries.set(key, {
      date, name, source, checked: on && !excluded.has(key),
      ...(name !== sourceName ? { sourceName } : {}),
      ...(extra ? { extra } : {}),
    });
  };
  for (const h of nationalHolidays) add(h.date, h.name, 'public', !skipped.has(h.name));
  const optIn = regionalHolidaysOptIn(country);
  for (const h of stateHolidayCandidates) {
    add(h.date, h.name, 'state', regional === null || (optIn ? regional.has(h.name) : !skipped.has(h.name)));
  }
  // Only the extras the employer gives become entries; the rest are offered as chips.
  for (const rule of employerExtraRules(country)) {
    if (!extrasOn.has(rule.id)) continue;
    for (const date of employerExtraDates(rule, rangeStart, rangeEnd)) add(date, rule.name, 'custom', true, rule.id);
  }
  for (const h of employerCalendar.custom) {
    if (h.date >= rangeStart && h.date <= rangeEnd) add(h.date, h.name, 'custom', true);
  }
  return [...entries.values()].sort((a, b) => `${a.date}|${entrySourceName(a)}`.localeCompare(`${b.date}|${entrySourceName(b)}`));
}

// ---------------------------------------------------------------------------------------
// Chips: one toggle per holiday (across the years in range), not per date.
// ---------------------------------------------------------------------------------------

export type HolidayChoiceKind = 'public' | 'regional' | 'extra' | 'custom';

export interface HolidayChoice {
  id: string;
  label: string;
  kind: HolidayChoiceKind;
  /** 'mixed' when only some of its dates in range are days off. */
  pressed: boolean | 'mixed';
  dates: string[];
}

/** Federal days private employers most often differ on, asked first (then the employer
 * extras), so the collapsed row of eight is exactly the uncertain days in the US. */
const UNCERTAIN_FIRST: Record<string, string[]> = {
  US: ['Martin Luther King, Jr. Day', 'Presidents Day', 'Juneteenth National Independence Day', 'Columbus Day', 'Veterans Day'],
};

/** Chips shown before "Show all". */
export const COLLAPSED_CHIP_COUNT = 8;

function choiceIdFor(entry: HolidayEntry): { id: string; kind: HolidayChoiceKind } {
  if (entry.source === 'public') return { id: `public:${entrySourceName(entry)}`, kind: 'public' };
  if (entry.source === 'state') return { id: `regional:${entrySourceName(entry)}`, kind: 'regional' };
  if (entry.extra) return { id: `extra:${entry.extra}`, kind: 'extra' };
  return { id: `custom:${entryKey(entry)}`, kind: 'custom' };
}

// Built on first use: an Intl formatter costs real time to construct, and this module loads
// with every page's first script.
let shortDate: Intl.DateTimeFormat | undefined;
const SHORT_DATE = () => (shortDate ??= new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }));

/** Chips for these entries; with `range`, the employer extras not yet given are offered too. */
export function holidayChoices(entries: readonly HolidayEntry[], country: string, range?: { start: string; end: string }): HolidayChoice[] {
  const groups = new Map<string, { kind: HolidayChoiceKind; entries: HolidayEntry[] }>();
  for (const entry of entries) {
    const { id, kind } = choiceIdFor(entry);
    const group = groups.get(id) ?? { kind, entries: [] };
    group.entries.push(entry);
    groups.set(id, group);
  }
  if (range) {
    for (const rule of employerExtraRules(country)) {
      const id = `extra:${rule.id}`;
      if (groups.has(id)) continue;
      const dates = employerExtraDates(rule, range.start, range.end);
      if (dates.length) groups.set(id, { kind: 'extra', entries: dates.map((date) => ({ date, name: rule.name, source: 'custom' as const, checked: false, extra: rule.id })) });
    }
  }
  const uncertain = UNCERTAIN_FIRST[country] ?? [];
  const extras = employerExtraRules(country).map((rule) => rule.id);
  const rank = (id: string, kind: HolidayChoiceKind): number => {
    const name = id.slice(id.indexOf(':') + 1);
    if (kind === 'public' && uncertain.includes(name)) return uncertain.indexOf(name);
    if (kind === 'extra') return 100 + extras.indexOf(name);
    // Then company days, then the region's opt-in days, then the remaining public days.
    return { custom: 150, regional: 200, public: 300, extra: 100 }[kind];
  };
  return [...groups.entries()].map(([id, { kind, entries: group }]) => {
    const on = group.filter((entry) => entry.checked).length;
    const first = group[0];
    const label = kind === 'custom'
      ? `${first.name} · ${SHORT_DATE().format(new Date(`${first.date}T00:00:00Z`))}`
      : kind === 'extra' ? first.name : holidayChipLabel(entrySourceName(first), country);
    return {
      id, kind, label,
      pressed: on === group.length ? true : on === 0 ? false : 'mixed' as const,
      dates: group.map((entry) => entry.date).sort(),
    };
  }).sort((a, b) => rank(a.id, a.kind) - rank(b.id, b.kind) || a.dates[0].localeCompare(b.dates[0]) || a.id.localeCompare(b.id));
}

function regionalNames(entries: readonly HolidayEntry[]): string[] {
  return [...new Set(entries.filter((entry) => entry.source === 'state').map(entrySourceName))];
}

function without(list: readonly string[] | undefined, value: string): string[] {
  return (list ?? []).filter((item) => item !== value);
}

function withValue(list: readonly string[] | undefined, value: string): string[] {
  return [...new Set([...(list ?? []), value])].sort();
}

/** Turning a holiday on clears any single-date exclusions it had, so the chip reads "on". */
function clearExclusions(calendar: EmployerCalendar, sourceName: string): string[] {
  return calendar.excluded.filter((key) => key.slice(11) !== sourceName);
}

/** Toggle one chip. Pressed (or mixed->on) semantics: a pressed chip turns off, else on. */
export function toggleHolidayChoice(
  calendar: EmployerCalendar, choice: Pick<HolidayChoice, 'id' | 'kind' | 'pressed'>, entries: readonly HolidayEntry[],
): EmployerCalendar {
  const name = choice.id.slice(choice.id.indexOf(':') + 1);
  const turnOff = choice.pressed === true;
  if (choice.kind === 'custom') {
    return {
      ...calendar,
      excluded: turnOff ? [...new Set([...calendar.excluded, name])].sort() : calendar.excluded.filter((key) => key !== name),
    };
  }
  const v2 = upgradeEmployerCalendar(calendar, regionalNames(entries));
  if (choice.kind === 'public' || (choice.kind === 'regional' && !regionalHolidaysOptIn(calendar.country))) {
    return turnOff
      ? { ...v2, skipped: withValue(v2.skipped, name) }
      : { ...v2, skipped: without(v2.skipped, name), excluded: clearExclusions(v2, name) };
  }
  if (choice.kind === 'regional') {
    return turnOff
      ? { ...v2, regional: without(v2.regional, name) }
      : { ...v2, regional: withValue(v2.regional, name), excluded: clearExclusions(v2, name) };
  }
  const rule = employerExtraRules(calendar.country).find((item) => item.id === name);
  return turnOff
    ? { ...v2, extras: without(v2.extras, name) }
    : { ...v2, extras: withValue(v2.extras, name), excluded: rule ? clearExclusions(v2, rule.name) : v2.excluded };
}

/**
 * Toggle a single dated entry (the detailed list). Turning one date on when its holiday is
 * off for every year turns the holiday on and keeps its other dates off.
 */
export function toggleHolidayEntry(
  calendar: EmployerCalendar, entry: HolidayEntry, entries: readonly HolidayEntry[],
): EmployerCalendar {
  const key = entryKey(entry);
  if (entry.checked) return { ...calendar, excluded: [...new Set([...calendar.excluded, key])].sort() };
  const cleared = { ...calendar, excluded: calendar.excluded.filter((item) => item !== key) };
  const { id, kind } = choiceIdFor(entry);
  const name = id.slice(id.indexOf(':') + 1);
  const nameLevelOff = calendar.version === 2 && (
    (kind === 'public' && (calendar.skipped ?? []).includes(name))
    || (kind === 'regional' && (regionalHolidaysOptIn(calendar.country)
      ? !(calendar.regional ?? []).includes(name) : (calendar.skipped ?? []).includes(name)))
    || (kind === 'extra' && !(calendar.extras ?? []).includes(name)));
  if (!nameLevelOff) return cleared;
  const siblings = entries.filter((other) => entryKey(other) !== key && choiceIdFor(other).id === id && !other.checked).map(entryKey);
  const on = toggleHolidayChoice(cleared, { id, kind, pressed: false }, entries);
  return { ...on, excluded: [...new Set([...on.excluded, ...siblings])].sort() };
}

/** Whether any day in this calendar is an employer day off (company days or extras). */
export function hasEmployerDays(entries: readonly HolidayEntry[]): boolean {
  return entries.some((entry) => entry.checked && entry.source === 'custom');
}
