import type { SchoolDistrictPreset } from './types';

// Source: Gwinnett County Public Schools, 2026-27 Student Calendar and Approved 2026-27 Calendar,
// linked from https://www.gcpsk12.org/about-us/calendar
// Student calendar: https://www.gcpsk12.org/fs/resource-manager/view/d046e8fb-d74c-43d7-a878-85e655821364
// Read 2026-11-04.
export const GWINNETT_2026_27: SchoolDistrictPreset = {
  id: 'gwinnett-gcps-2026-27',
  district: 'Gwinnett County Public Schools',
  shortName: 'Gwinnett County',
  city: 'Suwanee',
  state: 'GA',
  schoolYear: '2026-27',
  firstDay: '2026-08-05',
  lastDay: '2027-05-26',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-10-12', end: '2026-10-16', label: 'Fall Break', kind: 'break' },
    { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving Break', kind: 'break' },
    { start: '2026-12-21', end: '2027-01-01', label: 'Winter Break', kind: 'break' },
    { start: '2027-01-04', end: '2027-01-04', label: 'Teacher Planning/Staff Development (Student Holiday)', kind: 'staff-day' },
    { start: '2027-01-18', end: '2027-01-18', label: 'MLK Jr. Day', kind: 'holiday' },
    { start: '2027-02-12', end: '2027-02-16', label: 'School holiday', kind: 'break' },
    { start: '2027-04-05', end: '2027-04-09', label: 'Spring Break', kind: 'break' },
  ],
  source: {
    url: 'https://www.gcpsk12.org/fs/resource-manager/view/d046e8fb-d74c-43d7-a878-85e655821364',
    title: 'Gwinnett County Public Schools — 2026-27 Student Calendar',
    retrieved: '2026-11-04',
  },
  notes:
    'Digital Learning Days (Sept 18 and Nov 3, 2026; Mar 19, 2027) are at-home learning days, so they are school days and not listed. Inclement weather is made up with Digital Learning Days and/or longer days; no make-up dates are set. Early releases (K–8 conferences, high-school exams) are not closures. Dates match the calendar\'s day counters (day 87 on Dec 18, day 180 on May 26).',
};
