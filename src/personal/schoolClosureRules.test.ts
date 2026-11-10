import { describe, expect, it } from 'vitest';
import { expandSchoolClosures, uncoveredSchoolClosures } from './schoolClosureRules';
import { calendarAvailability } from './recurringAvailability';
const schedule = { kind: 'weekly' as const, weekly: [true,true,true,true,true,false,false] as [boolean,boolean,boolean,boolean,boolean,boolean,boolean] };
describe('school closure rules', () => {
  it('expands an academic-year range across New Year with weekday selection', () => {
    expect(expandSchoolClosures([{ start: '2027-12-30', end: '2028-01-04', weekdays: [0] }], '2027-12-01', '2028-01-31')).toEqual(['2028-01-03']);
  });
  it('handles leap dates and deduplicates overlapping rules', () => {
    expect(expandSchoolClosures([{ start: '2028-02-29', end: '2028-02-29' }, { start: '2028-02-29', end: '2028-02-29' }], '2028-02-28', '2028-03-01')).toEqual(['2028-02-29']);
  });
  it('rejects invalid dates, unbounded ranges and invalid weekdays', () => {
    expect(expandSchoolClosures([{ start: '2027-02-30', end: '2027-03-01' }], '2027-01-01', '2027-12-31')).toBeNull();
    expect(expandSchoolClosures([{ start: '2027-01-01', end: '2027-01-02', weekdays: [7] }], '2027-01-01', '2027-12-31')).toBeNull();
  });
  it('identifies potential uncovered days without assuming childcare responsibility', () => {
    const base = { start: '2028-01-03', end: '2028-01-04', schedule, schoolOffDays: ['2028-01-03','2028-01-04'] };
    const a = calendarAvailability({ ...base, approvedOffDays: ['2028-01-04'] })!;
    const b = calendarAvailability(base)!;
    expect(uncoveredSchoolClosures(a,b)).toEqual(['2028-01-03']);
  });
});
