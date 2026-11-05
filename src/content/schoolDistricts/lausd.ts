import type { SchoolDistrictPreset } from './types';

// Source: LAUSD 2026-27 dates as published on the district's own lausd.org site (school page):
// https://lockwoodavees.lausd.org/apps/pages/index.jsp?uREC_ID=3800885&type=d&pREC_ID=2550066
// Cross-checked against https://harvardes.lausd.org/apps/news/article/2093959 ("2026-2027 Calendar At A Glance").
// The district-wide instructional calendar PDF could not be opened (file host blocks automated reads).
// Read 2026-11-04.
export const LAUSD_2026_27: SchoolDistrictPreset = {
  id: 'lausd-2026-27',
  district: 'Los Angeles Unified School District',
  shortName: 'Los Angeles Unified',
  city: 'Los Angeles',
  state: 'CA',
  schoolYear: '2026-27',
  firstDay: '2026-08-12',
  lastDay: '2027-06-04',
  closures: [
    { start: '2026-09-04', end: '2026-09-04', label: 'Admission Day / Unassigned Day', kind: 'holiday' },
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-09-21', end: '2026-09-21', label: 'Unassigned Day', kind: 'other' },
    { start: '2026-11-11', end: '2026-11-11', label: 'Veterans Day', kind: 'holiday' },
    { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving Break', kind: 'break' },
    { start: '2026-12-21', end: '2027-01-08', label: 'Winter Break', kind: 'break' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Martin Luther King Jr. Day', kind: 'holiday' },
    { start: '2027-02-15', end: '2027-02-15', label: 'Presidents Day', kind: 'holiday' },
    { start: '2027-03-22', end: '2027-03-26', label: 'Spring Break', kind: 'break' },
    { start: '2027-03-31', end: '2027-03-31', label: 'Unassigned Day', kind: 'other' },
    { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day', kind: 'holiday' },
  ],
  source: {
    url: 'https://lockwoodavees.lausd.org/apps/pages/index.jsp?uREC_ID=3800885&type=d&pREC_ID=2550066',
    title: 'LAUSD 2026-27 important dates (published on lausd.org)',
    retrieved: '2026-11-04',
  },
  notes:
    'Dates come from district-wide LAUSD calendar dates republished on two LAUSD school pages on lausd.org, which agree; the district PDF itself could not be read. These dates give 180 instructional days, which fits a standard year. Single-track (traditional) calendar only. Parent-conference weeks are early dismissal, not closures.',
};
