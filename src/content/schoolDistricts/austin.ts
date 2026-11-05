import type { SchoolDistrictPreset } from './types';

// Source: Austin ISD "2026 - 2027 Calendar - Revised & Final"
// https://www.austinisd.org/sites/default/files/dept/ctfc/docs/2026-2027_Calendar_Revised_0.pdf
// (Board revision announced 2026-05-22: https://www.austinisd.org/announcements/2026/05/22/board-adopts-changes-2026-2027-academic-calendar-adds-two-instructional)
// Read 2026-11-04.
export const AUSTIN_2026_27: SchoolDistrictPreset = {
  id: 'austin-isd-2026-27',
  district: 'Austin Independent School District',
  shortName: 'Austin ISD',
  city: 'Austin',
  state: 'TX',
  schoolYear: '2026-27',
  firstDay: '2026-08-18',
  lastDay: '2027-05-27',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-09-21', end: '2026-09-21', label: 'Student holiday (Yom Kippur)', kind: 'staff-day' },
    {
      start: '2026-10-09',
      end: '2026-10-09',
      label: 'Student and staff holiday (bad weather make-up day)',
      kind: 'weather-makeup-reserve',
    },
    { start: '2026-10-12', end: '2026-10-12', label: "Indigenous Peoples' Day (student holiday)", kind: 'holiday' },
    { start: '2026-11-02', end: '2026-11-02', label: 'Student and staff holiday', kind: 'holiday' },
    { start: '2026-11-03', end: '2026-11-03', label: 'Student holiday (Culture of Voting)', kind: 'staff-day' },
    { start: '2026-11-23', end: '2026-11-27', label: 'Fall break', kind: 'break' },
    { start: '2026-12-21', end: '2027-01-01', label: 'Winter break', kind: 'break' },
    { start: '2027-01-04', end: '2027-01-04', label: 'Staff development (student holiday)', kind: 'staff-day' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Martin Luther King Jr. Day', kind: 'holiday' },
    { start: '2027-02-15', end: '2027-02-15', label: "Presidents' Day (student holiday)", kind: 'staff-day' },
    { start: '2027-03-10', end: '2027-03-10', label: 'Student holiday (Eid al-Fitr)', kind: 'holiday' },
    { start: '2027-03-15', end: '2027-03-19', label: 'Spring break', kind: 'break' },
    {
      start: '2027-03-26',
      end: '2027-03-26',
      label: 'Good Friday (bad weather make-up day)',
      kind: 'weather-makeup-reserve',
    },
    { start: '2027-04-30', end: '2027-04-30', label: 'Student holiday', kind: 'staff-day' },
  ],
  source: {
    url: 'https://www.austinisd.org/sites/default/files/dept/ctfc/docs/2026-2027_Calendar_Revised_0.pdf',
    title: 'Austin ISD — 2026-2027 Calendar (Revised & Final)',
    retrieved: '2026-11-04',
  },
  notes:
    'The PDF layout is dense: the Oct 12 and Mar 10 entries share a cell with parent-conference notes, so those two are the least certain. All listed closures together give 171 instructional days, which matches the board\'s revised total of 171. Oct 9, 2026 and Mar 26, 2027 are holidays that may become bad-weather make-up days. The English winter break ends Jan 4 (staff development, student holiday); the Spanish version says Jan 1. Juneteenth is observed June 21, 2027, after the last day.',
};
