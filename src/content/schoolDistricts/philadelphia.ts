import type { SchoolDistrictPreset } from './types';

// Source: The School District of Philadelphia, "2026-2027 Academic Calendar"
// https://www.philasd.org/calendar/  (Board approved 2/26/2026; page last modified 2026-09-15)
// Read 2026-11-04.
export const PHILADELPHIA_2026_27: SchoolDistrictPreset = {
  id: 'philadelphia-sdp-2026-27',
  district: 'The School District of Philadelphia',
  shortName: 'Philadelphia',
  city: 'Philadelphia',
  state: 'PA',
  schoolYear: '2026-27',
  firstDay: '2026-08-24',
  lastDay: '2027-06-09',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-09-18', end: '2026-09-18', label: 'Staff Professional Dev.; School Closed for Students', kind: 'staff-day' },
    { start: '2026-09-21', end: '2026-09-21', label: 'Yom Kippur', kind: 'holiday' },
    { start: '2026-10-09', end: '2026-10-09', label: 'Staff Professional Dev.; School Closed for Students', kind: 'staff-day' },
    { start: '2026-10-12', end: '2026-10-12', label: "Indigenous Peoples' Day", kind: 'holiday' },
    { start: '2026-11-03', end: '2026-11-03', label: 'Election Day', kind: 'holiday' },
    { start: '2026-11-11', end: '2026-11-11', label: 'Veterans Day', kind: 'holiday' },
    { start: '2026-11-16', end: '2026-11-16', label: 'Report Card Conference; School Closed for Students', kind: 'staff-day' },
    { start: '2026-11-25', end: '2026-11-25', label: 'Staff Professional Dev.; School Closed for Students', kind: 'staff-day' },
    { start: '2026-11-26', end: '2026-11-27', label: 'Thanksgiving Recess', kind: 'break' },
    { start: '2026-12-23', end: '2026-12-31', label: 'Winter Recess', kind: 'break' },
    { start: '2027-01-01', end: '2027-01-01', label: "New Year's Day", kind: 'holiday' },
    { start: '2027-01-15', end: '2027-01-15', label: 'Staff Professional Dev.; School Closed for Students', kind: 'staff-day' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Martin Luther King Jr. Day', kind: 'holiday' },
    { start: '2027-01-29', end: '2027-01-29', label: '2nd Term Report Card Conferences; School Closed for Students', kind: 'staff-day' },
    { start: '2027-02-12', end: '2027-02-12', label: 'Staff Professional Development; School Closed for Students', kind: 'staff-day' },
    { start: '2027-02-15', end: '2027-02-15', label: "Presidents' Day", kind: 'holiday' },
    { start: '2027-03-10', end: '2027-03-10', label: 'Eid al-Fitr', kind: 'holiday' },
    { start: '2027-03-22', end: '2027-03-25', label: 'Spring Recess', kind: 'break' },
    { start: '2027-03-26', end: '2027-03-26', label: 'Good Friday', kind: 'holiday' },
    { start: '2027-03-29', end: '2027-03-29', label: 'Staff Professional Development; School Closed for Students', kind: 'staff-day' },
    { start: '2027-04-16', end: '2027-04-16', label: '3rd Term Report Card Conferences; School Closed for Students', kind: 'staff-day' },
    { start: '2027-05-17', end: '2027-05-17', label: 'Eid al-Adha', kind: 'holiday' },
    { start: '2027-05-18', end: '2027-05-18', label: 'Election Day (tentative)', kind: 'holiday' },
    { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day', kind: 'holiday' },
  ],
  source: {
    url: 'https://www.philasd.org/calendar/',
    title: 'The School District of Philadelphia — 2026-2027 Academic Calendar',
    retrieved: '2026-11-04',
    documentDate: '2026-02-26',
  },
  notes:
    'Kindergarten starts Aug 27, 2026 (Aug 24–26 are kindergarten interview days). The May 18, 2027 Election Day closure is marked tentative. Juneteenth (June 18, 2027) comes after the last day. These dates give 173 student days, matching the calendar\'s own monthly counts.',
};
