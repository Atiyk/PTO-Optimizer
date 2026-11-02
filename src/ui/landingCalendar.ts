import type { Holiday } from '@daysoff/engine/data/holidays';
import type { EmployerCalendar } from '../personal/employerCalendar';

/** Apply the saved country-only employer calendar before deduplicating calendar dates. */
export function landingObservedHolidays(
  publicHolidays: Holiday[], employer: EmployerCalendar, start: string, end: string,
): Holiday[] {
  const excluded = new Set(employer.excluded);
  const effective = publicHolidays.filter((holiday) => !holiday.counties
    && holiday.countryCode === employer.country
    && !excluded.has(`${holiday.date}|${holiday.name}`));
  for (const custom of employer.custom) {
    effective.push({ ...custom, nominalDate: custom.date, countryCode: employer.country, counties: null });
  }
  const dates = new Map<string, { holiday: Holiday; names: Set<string> }>();
  for (const holiday of effective) {
    if (holiday.date < start || holiday.date > end) continue;
    const existing = dates.get(holiday.date);
    if (existing) existing.names.add(holiday.name);
    else dates.set(holiday.date, { holiday, names: new Set([holiday.name]) });
  }
  return [...dates.values()].map(({ holiday, names }) => ({ ...holiday, name: [...names].join(' / ') }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
