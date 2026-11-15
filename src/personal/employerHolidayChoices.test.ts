import { describe, expect, it } from 'vitest';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import { decodeEmployerCalendar, defaultEmployerCalendar, encodeEmployerCalendar, freshEmployerCalendar, type EmployerCalendar } from './employerCalendar';
import {
  employerExtraDates, employerExtraRules, holidayChoices, resolveHolidayEntries, toggleHolidayChoice, toggleHolidayEntry,
  type HolidayEntry,
} from './employerHolidayChoices';
import { planFromSearch } from '../autopilot/planFromSearch';
import { diskHolidays } from '../autopilot/feedTestHolidays';

const h = (date: string, name: string, counties: string[] | null = null): Holiday => ({ date, nominalDate: date, name, countryCode: 'US', counties });
const NATIONAL = [
  h('2027-01-01', "New Year's Day"), h('2027-01-18', 'Martin Luther King, Jr. Day'), h('2027-02-15', 'Presidents Day'),
  h('2027-05-31', 'Memorial Day'), h('2027-06-18', 'Juneteenth National Independence Day'), h('2027-07-05', 'Independence Day'),
  h('2027-09-06', 'Labour Day'), h('2027-10-11', 'Columbus Day'), h('2027-11-11', 'Veterans Day'),
  h('2027-11-25', 'Thanksgiving Day'), h('2027-12-24', 'Christmas Day'),
  h('2028-01-17', 'Martin Luther King, Jr. Day'),
];
const REGIONAL = [h('2027-02-12', "Lincoln's Birthday", ['US-CA']), h('2027-03-31', 'Cesar Chavez Day', ['US-CA'])];
const START = '2027-01-01';
const END = '2028-01-31';

const entries = (calendar: EmployerCalendar) => resolveHolidayEntries(NATIONAL, REGIONAL, calendar, START, END);
const offDates = (list: HolidayEntry[]) => [...new Set(list.filter((e) => e.checked).map((e) => e.date))].sort();

/** The pre-v2 resolution, verbatim, so v1 calendars (old eh= links) are pinned to it. */
function legacyEntries(national: Holiday[], state: Holiday[], calendar: EmployerCalendar, start: string, end: string) {
  const excluded = new Set(calendar.excluded);
  const map = new Map<string, { date: string; name: string; checked: boolean }>();
  for (const x of national) map.set(`${x.date}|${x.name}`, { date: x.date, name: x.name, checked: !excluded.has(`${x.date}|${x.name}`) });
  for (const x of state) if (!map.has(`${x.date}|${x.name}`)) map.set(`${x.date}|${x.name}`, { date: x.date, name: x.name, checked: !excluded.has(`${x.date}|${x.name}`) });
  for (const x of calendar.custom) if (!map.has(`${x.date}|${x.name}`) && x.date >= start && x.date <= end) map.set(`${x.date}|${x.name}`, { ...x, checked: !excluded.has(`${x.date}|${x.name}`) });
  return [...map.values()].sort((a, b) => `${a.date}|${a.name}`.localeCompare(`${b.date}|${b.name}`));
}

describe('holiday kinds: public, regional, employer-observed', () => {
  it('a new visitor who picks a state gets no regional government days off by default', () => {
    const list = entries(freshEmployerCalendar('US', 'US-CA'));
    expect(list.filter((e) => e.source === 'state').map((e) => [e.date, e.checked])).toEqual([['2027-02-12', false], ['2027-03-31', false]]);
    expect(offDates(list)).not.toContain('2027-02-12');
    expect(list.filter((e) => e.source === 'public').every((e) => e.checked)).toBe(true);
  });

  it('a version 1 calendar (old link or stored profile) resolves exactly as before', () => {
    const v1 = { ...defaultEmployerCalendar('US', 'US-CA'), excluded: ['2027-03-31|Cesar Chavez Day', '2027-11-11|Veterans Day'], custom: [{ date: '2027-08-13', name: 'Summer Friday' }] };
    const now = entries(v1).map((e) => ({ date: e.date, name: e.sourceName ?? e.name, checked: e.checked }));
    expect(now).toEqual(legacyEntries(NATIONAL, REGIONAL, v1, START, END));
    expect(offDates(entries(v1))).toContain('2027-02-12'); // legacy: regional on unless excluded
  });

  it('localizes display names but keeps the source name as the identifier', () => {
    const labor = entries(freshEmployerCalendar('US')).find((e) => e.date === '2027-09-06')!;
    expect(labor).toMatchObject({ name: 'Labor Day', sourceName: 'Labour Day' });
    const off = toggleHolidayEntry(freshEmployerCalendar('US'), labor, entries(freshEmployerCalendar('US')));
    expect(off.excluded).toEqual(['2027-09-06|Labour Day']);
  });
});

describe('employer extras', () => {
  it('computes Christmas Eve, the day after Thanksgiving and New Year’s Eve on working days', () => {
    const rules = Object.fromEntries(employerExtraRules('US').map((rule) => [rule.id, rule]));
    expect(employerExtraDates(rules['christmas-eve'], '2026-01-01', '2029-12-31')).toEqual(['2026-12-24', '2027-12-23', '2028-12-22', '2029-12-24']);
    expect(employerExtraDates(rules['day-after-thanksgiving'], '2026-01-01', '2028-12-31')).toEqual(['2026-11-27', '2027-11-26', '2028-11-24']);
    expect(employerExtraDates(rules['new-years-eve'], '2026-01-01', '2028-12-31')).toEqual(['2026-12-31', '2027-12-30', '2028-12-29']);
    for (const rule of employerExtraRules('US')) {
      for (const date of employerExtraDates(rule, '2026-01-01', '2040-12-31')) expect(mondayIndexedDow(date)).toBeLessThan(5);
    }
    expect(employerExtraRules('GB')).toEqual([]);
  });

  it('are off by default and become employer days off when turned on', () => {
    const fresh = freshEmployerCalendar('US');
    const choices = holidayChoices(entries(fresh), 'US', { start: START, end: END });
    const eve = choices.find((c) => c.id === 'extra:christmas-eve')!;
    expect(eve.pressed).toBe(false);
    const on = toggleHolidayChoice(fresh, eve, entries(fresh));
    expect(on.extras).toEqual(['christmas-eve']);
    const list = entries(on);
    expect(list.find((e) => e.extra === 'christmas-eve')).toMatchObject({ date: '2027-12-23', source: 'custom', checked: true, name: 'Christmas Eve' });
  });
});

describe('chips', () => {
  it('asks about the commonly uncertain US days first, then the employer extras', () => {
    const choices = holidayChoices(entries(freshEmployerCalendar('US', 'US-CA')), 'US', { start: START, end: END });
    expect(choices.slice(0, 8).map((c) => [c.label, c.pressed])).toEqual([
      ['MLK Day', true], ['Presidents Day', true], ['Juneteenth', true], ['Columbus Day', true], ['Veterans Day', true],
      ['Christmas Eve', false], ['Day after Thanksgiving', false], ["New Year's Eve", false],
    ]);
    expect(choices.find((c) => c.id === "regional:Lincoln's Birthday")).toMatchObject({ kind: 'regional', pressed: false });
    expect(choices.find((c) => c.id === 'public:Labour Day')?.label).toBe('Labor Day');
    expect(choices.find((c) => c.id === 'public:Martin Luther King, Jr. Day')?.dates).toEqual(['2027-01-18', '2028-01-17']);
  });

  it('a public chip turns a holiday off in every year, and a mixed chip turns it fully back on', () => {
    const fresh = freshEmployerCalendar('US');
    const mlk = holidayChoices(entries(fresh), 'US').find((c) => c.label === 'MLK Day')!;
    const off = toggleHolidayChoice(fresh, mlk, entries(fresh));
    expect(off.skipped).toEqual(['Martin Luther King, Jr. Day']);
    expect(offDates(entries(off))).not.toContain('2027-01-18');
    expect(offDates(entries(off))).not.toContain('2028-01-17');
    const oneYear = { ...fresh, excluded: ['2027-01-18|Martin Luther King, Jr. Day'] };
    const mixed = holidayChoices(entries(oneYear), 'US').find((c) => c.label === 'MLK Day')!;
    expect(mixed.pressed).toBe('mixed');
    const back = toggleHolidayChoice(oneYear, mixed, entries(oneYear));
    expect(back.excluded).toEqual([]);
    expect(offDates(entries(back))).toContain('2027-01-18');
  });

  it('opting into one regional day adds only that day', () => {
    const fresh = freshEmployerCalendar('US', 'US-CA');
    const lincoln = holidayChoices(entries(fresh), 'US').find((c) => c.kind === 'regional' && c.label === "Lincoln's Birthday")!;
    const on = toggleHolidayChoice(fresh, lincoln, entries(fresh));
    expect(on.regional).toEqual(["Lincoln's Birthday"]);
    expect(offDates(entries(on))).toContain('2027-02-12');
    expect(offDates(entries(on))).not.toContain('2027-03-31');
  });

  it('turning one date on for a holiday that is off every year keeps its other years off', () => {
    const fresh = freshEmployerCalendar('US');
    const mlk = holidayChoices(entries(fresh), 'US').find((c) => c.label === 'MLK Day')!;
    const off = toggleHolidayChoice(fresh, mlk, entries(fresh));
    const date2027 = entries(off).find((e) => e.date === '2027-01-18')!;
    const one = toggleHolidayEntry(off, date2027, entries(off));
    expect(offDates(entries(one))).toContain('2027-01-18');
    expect(offDates(entries(one))).not.toContain('2028-01-17');
  });
});

describe('migrating a version 1 calendar on first edit', () => {
  it('keeps every regional day that was on, every exclusion and every company day', () => {
    const v1 = { ...defaultEmployerCalendar('US', 'US-CA'), excluded: ['2027-03-31|Cesar Chavez Day'], custom: [{ date: '2027-08-13', name: 'Summer Friday' }] };
    const before = offDates(entries(v1));
    const vets = holidayChoices(entries(v1), 'US').find((c) => c.label === 'Veterans Day')!;
    const edited = toggleHolidayChoice(v1, vets, entries(v1));
    expect(edited).toMatchObject({ version: 2, regional: ['Cesar Chavez Day', "Lincoln's Birthday"], skipped: ['Veterans Day'], excluded: v1.excluded, custom: v1.custom });
    expect(offDates(entries(edited))).toEqual(before.filter((d) => d !== '2027-11-11'));
    expect(decodeEmployerCalendar(encodeEmployerCalendar(edited))).toEqual(edited);
  });
});

describe('scenarios through the full plan (planFromSearch)', () => {
  const TODAY = '2026-11-04';
  const link = (calendar: EmployerCalendar, extra = '') => `?c=US&s=2027-01-01&e=2027-12-31&b=15&rv=0&eh=${encodeURIComponent(encodeEmployerCalendar(calendar))}${extra}`;
  const solved = (search: string) => {
    const plan = planFromSearch(search, TODAY, diskHolidays);
    if (!plan.ok) throw new Error(plan.issues.join());
    return plan;
  };

  it('an employee who does not get several federal holidays: those dates become working days', () => {
    const calendar = { ...freshEmployerCalendar('US'), skipped: ['Columbus Day', 'Juneteenth National Independence Day', 'Martin Luther King, Jr. Day', 'Presidents Day', 'Veterans Day'] };
    const base = solved(link(freshEmployerCalendar('US')));
    const plan = solved(link(calendar));
    for (const date of ['2027-01-18', '2027-02-15', '2027-06-18', '2027-10-11', '2027-11-11']) {
      expect(base.solveInput.offDays).toContain(date);
      expect(plan.solveInput.offDays).not.toContain(date);
    }
    expect(plan.solveInput.offDays).toContain('2027-09-06'); // Labor Day still observed
    expect(plan.holidayEntries.find((e) => e.date === '2027-09-06')?.name).toBe('Labor Day');
  });

  it('an employee with extra employer holidays: plan changes and no PTO is charged on them', () => {
    const calendar = { ...freshEmployerCalendar('US'), extras: ['christmas-eve', 'day-after-thanksgiving', 'new-years-eve'], custom: [{ date: '2027-07-06', name: 'Summer shutdown' }] };
    // Pin the days around them so the solver must cross the employer days off.
    const pins = '&p=2027-11-22,2027-11-23,2027-11-24,2027-12-20,2027-12-21,2027-12-22,2027-12-27,2027-12-28,2027-12-29';
    const base = solved(link(freshEmployerCalendar('US'), pins));
    const plan = solved(link(calendar, pins));
    const employerDays = ['2027-11-26', '2027-12-23', '2027-12-30', '2027-07-06'];
    for (const date of employerDays) {
      expect(plan.solveInput.offDays).toContain(date);
      expect(plan.isPtoDay(date)).toBe(false);
    }
    expect(base.solveInput.offDays).not.toContain('2027-11-26');
    expect(plan.breaks).not.toEqual(base.breaks);
    const ptoDays = (p: typeof plan) => p.breaks.flatMap((b) => b.days).filter((d) => p.isPtoDay(d));
    for (const date of employerDays) expect(ptoDays(plan)).not.toContain(date);
  });

  it('GB: a bank holiday in every nation counts with no region chosen, and Boxing Day is named so', () => {
    const plan = solved('?c=GB&s=2026-11-15&e=2027-12-31&b=15&rv=0');
    expect(plan.solveInput.offDays).toContain('2027-01-01'); // New Year's Day, listed per nation by Nager
    expect(plan.isPtoDay('2027-01-01')).toBe(false);
    expect(plan.holidayEntries.find((e) => e.date === '2027-01-01')).toMatchObject({ source: 'public', checked: true });
    expect(plan.holidayEntries.find((e) => e.date === '2027-12-28')?.name).toBe('Boxing Day');
    expect(plan.solveInput.offDays).not.toContain('2027-03-29'); // Easter Monday: not Scotland, needs a nation
  });

  it('outside the US a chosen region keeps its public holidays on by default', () => {
    const plan = solved(`?c=GB&sd=GB-SCT&s=2026-11-15&e=2027-12-31&b=15&eh=${encodeURIComponent(encodeEmployerCalendar(freshEmployerCalendar('GB', 'GB-SCT')))}`);
    expect(plan.holidayEntries.find((e) => e.date === '2026-11-30')).toMatchObject({ source: 'state', checked: true }); // St Andrew's Day
    expect(plan.holidayEntries.find((e) => e.date === '2027-01-01' && e.name === "New Year's Day")).toMatchObject({ source: 'public', checked: true });
    const de = solved(`?c=DE&sd=DE-BY&s=2027-01-01&e=2027-12-31&b=15&eh=${encodeURIComponent(encodeEmployerCalendar(freshEmployerCalendar('DE', 'DE-BY')))}`);
    expect(de.holidayEntries.filter((e) => e.source === 'state').every((e) => e.checked)).toBe(true);
  });

  it('an old v1 eh= link with a state reproduces the legacy holidays exactly', () => {
    const raw = '1.["US","US-CA",["2027-03-31|Cesar Chavez Day"],[["2027-08-13","Summer Friday"]]]';
    expect(encodeEmployerCalendar(decodeEmployerCalendar(raw)!)).toBe(raw);
    const plan = solved(`?c=US&sd=US-CA&s=2027-01-01&e=2027-12-31&b=15&eh=${encodeURIComponent(raw)}`);
    const checked = plan.holidayEntries.filter((e) => e.checked).map((e) => `${e.date}|${e.sourceName ?? e.name}`);
    expect(checked).toContain("2027-02-12|Lincoln's Birthday");
    expect(checked).not.toContain('2027-03-31|Cesar Chavez Day');
    expect(checked).toContain('2027-08-13|Summer Friday');
    expect(checked).toContain('2027-09-06|Labour Day');
  });
});
