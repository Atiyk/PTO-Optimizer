import type { SchoolDistrictPreset } from './types';

// Source: Houston ISD "2026-2027 Yearly Calendar" (file name 2026-2027YearlyCalendarRev4_6_26.pdf, "Updated 4/6/2026"),
// linked from https://www.houstonisd.org/our-district/district-calendar as
// https://www.houstonisd.org/fs/resource-manager/view/86c8b85e-6fff-4100-ab1b-14fcfedb2783
// Read 2026-11-04.
export const HOUSTON_2026_27: SchoolDistrictPreset = {
  id: 'houston-isd-2026-27',
  district: 'Houston Independent School District',
  shortName: 'Houston ISD',
  city: 'Houston',
  state: 'TX',
  schoolYear: '2026-27',
  firstDay: '2026-08-10',
  lastDay: '2027-05-28',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-09-21', end: '2026-09-21', label: 'Staff PD (no classes)', kind: 'staff-day' },
    { start: '2026-10-09', end: '2026-10-09', label: 'Staff PD (no classes)', kind: 'staff-day' },
    { start: '2026-11-06', end: '2026-11-06', label: 'Staff PD (no classes)', kind: 'staff-day' },
    { start: '2026-11-23', end: '2026-11-27', label: 'Thanksgiving Recess (no classes)', kind: 'break' },
    { start: '2026-12-21', end: '2027-01-01', label: 'Winter Recess (no classes)', kind: 'break' },
    { start: '2027-01-04', end: '2027-01-04', label: 'Staff PD (no classes)', kind: 'staff-day' },
    { start: '2027-01-18', end: '2027-01-18', label: 'MLK Jr. Day', kind: 'holiday' },
    { start: '2027-02-15', end: '2027-02-15', label: 'Staff PD (no classes)', kind: 'staff-day' },
    { start: '2027-03-08', end: '2027-03-12', label: 'Spring Recess (no classes)', kind: 'break' },
    { start: '2027-04-16', end: '2027-04-16', label: 'Staff PD (no classes)', kind: 'staff-day' },
  ],
  source: {
    url: 'https://www.houstonisd.org/fs/resource-manager/view/86c8b85e-6fff-4100-ab1b-14fcfedb2783',
    title: 'Houston ISD — 2026-2027 Yearly Calendar',
    retrieved: '2026-11-04',
    documentDate: '2026-04-06',
  },
  notes:
    'Thanksgiving Day and New Year\'s Day are holidays inside the recesses. The calendar lists no early-release or bad-weather make-up days. June 2027 "5th Quarter" programming follows the last day and is not included.',
};
