import type { SchoolDistrictPreset } from './types';

// Source: Fairfax County Public Schools, "Standard School Year Calendar" 2026-27
// https://www.fcps.edu/calendars
// (PDF: https://www.fcps.edu/system/files/forms/2026-05/2026-2027-standard-school-year-calendar.pdf, updated 2026-09-29)
// Read 2026-11-04.
export const FAIRFAX_2026_27: SchoolDistrictPreset = {
  id: 'fairfax-fcps-2026-27',
  district: 'Fairfax County Public Schools',
  shortName: 'Fairfax County',
  city: 'Fairfax',
  state: 'VA',
  schoolYear: '2026-27',
  firstDay: '2026-08-24',
  lastDay: '2027-06-16',
  closures: [
    { start: '2026-09-04', end: '2026-09-07', label: 'Labor Day Break', kind: 'break' },
    { start: '2026-09-21', end: '2026-09-21', label: 'Yom Kippur', kind: 'holiday' },
    { start: '2026-10-12', end: '2026-10-12', label: "Indigenous Peoples' Day / School Planning Day", kind: 'staff-day' },
    { start: '2026-11-02', end: '2026-11-02', label: 'School Planning Day', kind: 'staff-day' },
    { start: '2026-11-03', end: '2026-11-03', label: 'Election Day / Teacher Workday', kind: 'staff-day' },
    { start: '2026-11-25', end: '2026-11-27', label: 'Thanksgiving Break', kind: 'break' },
    { start: '2026-12-21', end: '2027-01-01', label: 'Winter Break', kind: 'break' },
    { start: '2027-01-18', end: '2027-01-18', label: "Martin Luther King, Jr.'s Birthday", kind: 'holiday' },
    { start: '2027-01-29', end: '2027-01-29', label: 'Teacher Workday', kind: 'staff-day' },
    { start: '2027-02-01', end: '2027-02-01', label: 'Staff Development Day', kind: 'staff-day' },
    { start: '2027-02-15', end: '2027-02-15', label: "Washington's Birthday / Presidents' Day", kind: 'holiday' },
    { start: '2027-03-09', end: '2027-03-09', label: 'Eid al-Fitr', kind: 'holiday' },
    { start: '2027-03-22', end: '2027-03-26', label: 'Spring Break', kind: 'break' },
    { start: '2027-04-19', end: '2027-04-19', label: 'Teacher Workday', kind: 'staff-day' },
    { start: '2027-04-20', end: '2027-04-20', label: 'Staff Development Day (Theravada New Year)', kind: 'staff-day' },
    { start: '2027-05-17', end: '2027-05-17', label: 'Eid al-Adha', kind: 'holiday' },
    { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day', kind: 'holiday' },
  ],
  source: {
    url: 'https://www.fcps.edu/calendars',
    title: 'Fairfax County Public Schools — 2026-27 Standard School Year Calendar',
    retrieved: '2026-11-04',
  },
  notes:
    'Standard calendar only; some schools follow a modified calendar. Two-hour early releases at quarter ends and Monday/Wednesday early-release days are not closures. Juneteenth (June 18, 2027) comes after the last day. The calendar lists no inclement-weather make-up days. These dates give 180 student days.',
};
