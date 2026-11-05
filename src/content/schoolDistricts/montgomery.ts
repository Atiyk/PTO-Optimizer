import type { SchoolDistrictPreset } from './types';

// Source: Montgomery County Public Schools (MD), "2026–2027 School Calendar" (0775.26, 5/26),
// https://www.montgomeryschoolsmd.org/siteassets/district/calendar/2026/0775.26_2026-27_SchoolCalendar.pdf
// Cross-checked with the traditional calendar adopted 4/30/26:
// https://ww2.montgomeryschoolsmd.org/calendar/pdfs/2026-2027/2026-2027-TRADITIONAL-Calendar.pdf
// Read 2026-11-04.
export const MONTGOMERY_2026_27: SchoolDistrictPreset = {
  id: 'montgomery-mcps-2026-27',
  district: 'Montgomery County Public Schools',
  shortName: 'Montgomery County (MD)',
  city: 'Rockville',
  state: 'MD',
  schoolYear: '2026-27',
  firstDay: '2026-08-25',
  lastDay: '2027-06-11',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-09-21', end: '2026-09-21', label: 'Non-Instructional Day', kind: 'other' },
    { start: '2026-10-16', end: '2026-10-16', label: 'Professional Development Day for staff', kind: 'staff-day' },
    { start: '2026-11-02', end: '2026-11-02', label: 'Grading and Planning', kind: 'staff-day' },
    { start: '2026-11-03', end: '2026-11-03', label: 'Election Day', kind: 'holiday' },
    { start: '2026-11-26', end: '2026-11-27', label: 'Thanksgiving Holiday', kind: 'holiday' },
    { start: '2026-12-24', end: '2026-12-25', label: 'Winter Break Holiday', kind: 'break' },
    { start: '2026-12-28', end: '2026-12-29', label: 'Non-Instructional Day', kind: 'break' },
    { start: '2026-12-30', end: '2026-12-31', label: 'Systemwide Closure', kind: 'break' },
    { start: '2027-01-01', end: '2027-01-01', label: "New Year's Day", kind: 'holiday' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Dr. Martin Luther King, Jr. Day Holiday', kind: 'holiday' },
    { start: '2027-01-25', end: '2027-01-25', label: 'Grading and Planning', kind: 'staff-day' },
    { start: '2027-02-15', end: '2027-02-15', label: "Presidents' Day Holiday", kind: 'holiday' },
    { start: '2027-03-09', end: '2027-03-09', label: 'Professional Development Day for staff', kind: 'staff-day' },
    { start: '2027-03-26', end: '2027-03-29', label: 'Spring Break Holiday', kind: 'break' },
    { start: '2027-03-30', end: '2027-03-31', label: 'Non-Instructional Day', kind: 'break' },
    { start: '2027-04-01', end: '2027-04-02', label: 'Systemwide Closure', kind: 'break' },
    { start: '2027-04-12', end: '2027-04-12', label: 'Grading and Planning', kind: 'staff-day' },
    {
      start: '2027-04-22',
      end: '2027-04-22',
      label: 'Non-Instructional Day (possible make-up day)',
      kind: 'weather-makeup-reserve',
    },
    {
      start: '2027-05-17',
      end: '2027-05-17',
      label: 'Non-Instructional Day (possible make-up day)',
      kind: 'weather-makeup-reserve',
    },
    { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day Holiday', kind: 'holiday' },
  ],
  source: {
    url: 'https://www.montgomeryschoolsmd.org/siteassets/district/calendar/2026/0775.26_2026-27_SchoolCalendar.pdf',
    title: 'Montgomery County Public Schools — 2026–2027 School Calendar',
    retrieved: '2026-11-04',
    documentDate: '2026-04-30',
  },
  notes:
    'Aug 24, 2026 is a Student Transition Day for grades K, 6 and 9 only; other grades start Aug 25. If schools close three or more days for emergencies, April 22 and May 17 may become school days, and June 14–17 may be added. Early-release days (e.g. Nov 23–25, Dec 23) are not closures. Board adopted the calendar 4/30/26. These dates give 181 instructional days, matching the district\'s count.',
};
