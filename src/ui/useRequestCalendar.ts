import { useEffect, useMemo, useState } from 'react';
import { COUNTRIES, SUBDIVISION_NAMES } from '@daysoff/engine/data/countries';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { getConsumerHolidaysWithStatus, getConsumerSubdivisionCandidates } from '../personal/consumerHolidays';
import { getStateHolidaysFallback } from '@daysoff/engine/data/usStateHolidays';
import { isAlternatingFridayOff } from '@daysoff/engine/calendar/calendarMath';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { DEFAULT_WORK_WEEK, type WorkWeek } from '@daysoff/engine/solver/types';
import { readEmployerCalendar } from '../personal/employerCalendar';
import type { RequestCalendar } from '../personal/requestLedger';
import { isValidISODate } from './urlState';

export interface RequestCalendarOptions {
  country: string;
  subdivision?: string;
  rangeStart: string;
  rangeEnd: string;
  workWeek: WorkWeek;
  /** The first non-working Friday on a repeating 14-day cadence. Empty means disabled. */
  altFridayStart?: string;
}

export interface RequestCalendarResult {
  calendar: RequestCalendar & { rangeStart: string; rangeEnd: string };
  loading: boolean;
  degraded: boolean;
  subdivisions: string[];
}

interface LoadedCalendar {
  key: string;
  holidays: Holiday[];
  subdivisions: string[];
  degraded: boolean;
}

const COUNTRY_CODES = new Set(COUNTRIES.map(({ code }) => code));
const US_SUBDIVISIONS = Object.keys(SUBDIVISION_NAMES).filter((code) => code.startsWith('US-'));

function validRange(start: string, end: string): boolean {
  if (!isValidISODate(start) || !isValidISODate(end) || end < start) return false;
  const yearDifference = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
  return yearDifference < 10 || (yearDifference === 10 && end.slice(5) <= start.slice(5));
}

function validSubdivision(country: string, subdivision: string): boolean {
  return /^[A-Z0-9-]{1,16}$/.test(subdivision) && subdivision.startsWith(`${country}-`)
    && subdivision.length > country.length + 1;
}

/** A request is priced only against the requested calendar scope. Previous asynchronous
 * results never appear under a new country, region or date range. Employer preferences
 * are read without being saved or replaced; the existing holiday loader owns its cache. */
export function useRequestCalendar(options: RequestCalendarOptions): RequestCalendarResult {
  const { country, subdivision, rangeStart, rangeEnd, workWeek, altFridayStart } = options;
  const scheduleValid = Array.isArray(workWeek) && workWeek.length === 7 && workWeek.every((day) => typeof day === 'boolean');
  const scheduleKey = (scheduleValid ? workWeek : DEFAULT_WORK_WEEK).map((day) => day ? '1' : '0').join('');
  const resolvedWorkWeek = useMemo(() => [...scheduleKey].map((day) => day === '1') as WorkWeek, [scheduleKey]);
  const inputValid = COUNTRY_CODES.has(country)
    && (!subdivision || validSubdivision(country, subdivision))
    && validRange(rangeStart, rangeEnd)
    && scheduleValid
    && (!altFridayStart || isValidISODate(altFridayStart));
  const scopeKey = JSON.stringify([country, subdivision ?? '', rangeStart, rangeEnd]);
  const [loaded, setLoaded] = useState<LoadedCalendar | null>(null);
  const employer = useMemo(() => readEmployerCalendar(country, subdivision), [country, subdivision]);

  useEffect(() => {
    if (!inputValid) return;
    let canceled = false;
    const requests = [
      getConsumerHolidaysWithStatus(country, rangeStart, rangeEnd, subdivision),
      getConsumerSubdivisionCandidates(country, rangeStart, rangeEnd),
    ] as const;
    void Promise.allSettled(requests).then(([holidayResult, subdivisionResult]) => {
      if (canceled) return;
      const holidays = holidayResult.status === 'fulfilled'
        ? holidayResult.value.holidays.filter((holiday) => holiday.countryCode === country
          && (!holiday.counties || (!!subdivision && holiday.counties.includes(subdivision))))
        : [];
      if (country === 'US' && subdivision) {
        const known = new Set(holidays.map((holiday) => `${holiday.date}|${holiday.name}`));
        for (let year = Number(rangeStart.slice(0, 4)); year <= Number(rangeEnd.slice(0, 4)); year++) {
          for (const fallback of getStateHolidaysFallback(subdivision, year)) {
            const key = `${fallback.date}|${fallback.name}`;
            if (known.has(key) || fallback.date < rangeStart || fallback.date > rangeEnd) continue;
            known.add(key);
            holidays.push({ ...fallback, nominalDate: fallback.date, countryCode: country, counties: [subdivision] });
          }
        }
      }
      const subdivisions = new Set(country === 'US' ? US_SUBDIVISIONS : []);
      if (subdivisionResult.status === 'fulfilled') {
        for (const holiday of subdivisionResult.value) {
          if (holiday.countryCode !== country) continue;
          for (const region of holiday.counties ?? []) {
            if (validSubdivision(country, region)) subdivisions.add(region);
          }
        }
      }
      if (subdivision) subdivisions.add(subdivision);
      setLoaded({
        key: scopeKey, holidays, subdivisions: [...subdivisions].sort(),
        degraded: holidayResult.status === 'rejected'
          || (holidayResult.status === 'fulfilled' && holidayResult.value.degraded)
          || subdivisionResult.status === 'rejected',
      });
    });
    return () => { canceled = true; };
  }, [country, subdivision, rangeStart, rangeEnd, scopeKey, inputValid]);

  const current = inputValid && loaded?.key === scopeKey ? loaded : null;
  const offDays = useMemo(() => {
    if (!current) return [];
    const excluded = new Set(employer.excluded);
    const dates = new Set<string>();
    for (const holiday of [...current.holidays, ...employer.custom]) {
      if (isValidISODate(holiday.date) && holiday.date >= rangeStart && holiday.date <= rangeEnd
        && !excluded.has(`${holiday.date}|${holiday.name}`)) dates.add(holiday.date);
    }
    if (altFridayStart) {
      for (const date of rangeISO(rangeStart, rangeEnd)) {
        if (isAlternatingFridayOff(date, altFridayStart)) dates.add(date);
      }
    }
    return [...dates].sort();
  }, [current, employer, rangeStart, rangeEnd, altFridayStart]);

  return {
    calendar: {
      workWeek: resolvedWorkWeek, offDays,
      rangeStart: inputValid ? rangeStart : '', rangeEnd: inputValid ? rangeEnd : '',
    },
    loading: inputValid && !current,
    degraded: !inputValid || (current?.degraded ?? false),
    subdivisions: current?.subdivisions ?? [],
  };
}
