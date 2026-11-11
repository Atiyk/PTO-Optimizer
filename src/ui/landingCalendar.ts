import type { Holiday } from '@daysoff/engine/data/holidays';
import type { EmployerCalendar } from '../personal/employerCalendar';
import { holidayEntriesFor } from '../autopilot/planFromSearch';
import { useEffect, useMemo, useState } from 'react';
import { getConsumerHolidaysWithStatus, readPreloadedConsumerHolidays } from '../personal/consumerHolidays';

const NO_HOLIDAYS: Holiday[] = [];

export function useLandingHolidays(country: string, start: string, end: string, validRange: boolean) {
  const scope = `${country}|${start}|${end}`;
  const preloaded = useMemo(() => readPreloadedConsumerHolidays(country, start, end), [country, start, end]);
  const [calendar, setCalendar] = useState<{ scope: string; holidays: Holiday[]; degraded: boolean } | null>(null);
  useEffect(() => {
    if (!validRange || preloaded !== undefined) return;
    let cancelled = false;
    getConsumerHolidaysWithStatus(country, start, end).then(result => {
      if (!cancelled) setCalendar({ ...result, scope });
    });
    return () => { cancelled = true; };
  }, [country, start, end, scope, validRange, preloaded]);
  const active = calendar?.scope === scope ? calendar : undefined;
  return {
    holidays: preloaded ?? active?.holidays ?? NO_HOLIDAYS,
    loading: preloaded === undefined && !active,
    degraded: preloaded === undefined && (active?.degraded ?? false),
  };
}

/** Apply the saved country-only employer calendar before deduplicating calendar dates. */
export function landingObservedHolidays(
  publicHolidays: Holiday[], employer: EmployerCalendar, start: string, end: string,
): Holiday[] {
  const national = publicHolidays.filter((holiday) => !holiday.counties && holiday.countryCode === employer.country
    && holiday.date >= start && holiday.date <= end);
  const publicByKey = new Map(national.map(holiday => [`${holiday.date}|${holiday.name}`, holiday]));
  const dates = new Map<string, { holiday: Holiday; names: Set<string> }>();
  const entries = holidayEntriesFor(national, [], employer, start, end);
  entries.sort((a, b) => Number(a.source === 'custom') - Number(b.source === 'custom'));
  for (const { checked, date, name } of entries) {
    if (!checked) continue;
    const existing = dates.get(date);
    const holiday = publicByKey.get(`${date}|${name}`) ?? { date, name, nominalDate: date, countryCode: employer.country, counties: null };
    if (existing) {
      existing.names.add(name);
      // Keep the observed label when any included holiday moved to this date.
      if (holiday.nominalDate !== date) existing.holiday = holiday;
    } else dates.set(date, { holiday, names: new Set([name]) });
  }
  return [...dates.values()].map(({ holiday, names }) => ({ ...holiday, name: [...names].join(' / ') }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
