import type { SchoolDistrictPreset } from './types';

// Source: Dallas ISD "2026–2027 Calendar/Calendario" (traditional calendar), linked as
// "2026-2027 Traditional and ADSY Calendars" from https://www.dallasisd.org/about/about-dallas-isd/district-calendars
// Page: https://www.dallasisd.org/fs/pages/133124
// Read 2026-11-04.
export const DALLAS_2026_27: SchoolDistrictPreset = {
  id: 'dallas-isd-2026-27',
  district: 'Dallas Independent School District',
  shortName: 'Dallas ISD',
  city: 'Dallas',
  state: 'TX',
  schoolYear: '2026-27',
  firstDay: '2026-08-11',
  lastDay: '2027-05-26',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-10-08', end: '2026-10-09', label: 'Fall Break', kind: 'break' },
    { start: '2026-10-12', end: '2026-10-12', label: 'Professional development', kind: 'staff-day' },
    { start: '2026-11-03', end: '2026-11-03', label: 'Professional development', kind: 'staff-day' },
    { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving Break', kind: 'break' },
    { start: '2026-12-21', end: '2027-01-04', label: 'Winter Break', kind: 'break' },
    { start: '2027-01-05', end: '2027-01-05', label: 'Professional development', kind: 'staff-day' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Martin Luther King Jr. Day', kind: 'holiday' },
    { start: '2027-02-15', end: '2027-02-15', label: 'Presidents Day', kind: 'holiday' },
    { start: '2027-03-15', end: '2027-03-19', label: 'Spring Break', kind: 'break' },
    { start: '2027-03-26', end: '2027-03-26', label: 'Staff/student holiday', kind: 'holiday' },
  ],
  source: {
    url: 'https://www.dallasisd.org/fs/pages/133124',
    title: 'Dallas ISD — 2026-2027 Traditional Calendar',
    retrieved: '2026-11-04',
  },
  notes:
    'Traditional calendar only. Schools on the Additional Days School Year (ADSY) calendar differ. The calendar lists "Inclement Weather Days" on March 29 and April 19, 2027 without saying whether students are off; they are not shown as closures here. Early releases (Dec 16–18, May 24–26) and parent-conference days are not closures. The PDF does not name the district or show an approval date; it is the file the Dallas ISD calendars page links as the 2026-2027 calendar.',
};
