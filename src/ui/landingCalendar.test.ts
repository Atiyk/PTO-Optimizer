import { describe, expect, it } from 'vitest';
import type { Holiday } from '@daysoff/engine/data/holidays';
import { defaultEmployerCalendar } from '../personal/employerCalendar';
import { landingObservedHolidays } from './landingCalendar';

const publicHolidays: Holiday[] = [
  { date: '2027-01-01', nominalDate: '2027-01-01', name: 'New Year', countryCode: 'US', counties: null },
  { date: '2027-01-01', nominalDate: '2027-01-01', name: 'Second name', countryCode: 'US', counties: null },
  { date: '2027-01-04', nominalDate: '2027-01-04', name: 'Regional holiday', countryCode: 'US', counties: ['US-CA'] },
];

describe('homepage employer-observed holidays', () => {
  it('excludes by date and name, preserving a different holiday on the same date', () => {
    const employer = { ...defaultEmployerCalendar('US'), excluded: ['2027-01-01|New Year'] };
    expect(landingObservedHolidays(publicHolidays, employer, '2027-01-01', '2027-01-31').map(({ date, name }) => ({ date, name })))
      .toEqual([{ date: '2027-01-01', name: 'Second name' }]);
  });

  it('deduplicates dates while including in-range custom days and all distinct names', () => {
    const employer = { ...defaultEmployerCalendar('US'), custom: [{ date: '2027-01-01', name: 'Company day' }, { date: '2027-01-05', name: 'Company retreat' }, { date: '2027-02-01', name: 'Outside range' }] };
    const holidays = landingObservedHolidays(publicHolidays, employer, '2027-01-01', '2027-01-31');
    expect(holidays.map(({ date }) => date)).toEqual(['2027-01-01', '2027-01-05']);
    expect(holidays[0].name).toBe('New Year / Second name / Company day');
    expect(holidays[1].name).toBe('Company retreat');
  });

  it('does not apply another country’s or a regional public holiday to a national preview', () => {
    expect(landingObservedHolidays(publicHolidays, defaultEmployerCalendar('GB'), '2027-01-01', '2027-01-31')).toEqual([]);
  });
});
