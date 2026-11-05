import type { SchoolDistrictPreset } from './types';

// Source: Broward County Public Schools, "2026/27 School Calendar" (accessible version)
// https://www.browardschools.com/bcps-departments/office-of-communications/accessible-school-year-calendar/202627-school-calendar
// Read 2026-11-04 (page published 2026-05-27).
export const BROWARD_2026_27: SchoolDistrictPreset = {
  id: 'broward-bcps-2026-27',
  district: 'Broward County Public Schools',
  shortName: 'Broward County',
  city: 'Fort Lauderdale',
  state: 'FL',
  schoolYear: '2026-27',
  firstDay: '2026-08-10',
  lastDay: '2027-05-28',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Schools and Administrative Offices Closed (Labor Day)', kind: 'holiday' },
    { start: '2026-09-21', end: '2026-09-21', label: 'Schools and Administrative Offices Closed', kind: 'holiday' },
    { start: '2026-10-12', end: '2026-10-12', label: 'Employee Planning Day – No School for Students', kind: 'staff-day' },
    { start: '2026-11-03', end: '2026-11-03', label: 'Employee Planning Day – No School for Students', kind: 'staff-day' },
    { start: '2026-11-11', end: '2026-11-11', label: 'Schools and Administrative Offices Closed (Veterans Day)', kind: 'holiday' },
    { start: '2026-11-23', end: '2026-11-27', label: 'Schools Closed (Thanksgiving week)', kind: 'break' },
    { start: '2026-12-21', end: '2027-01-01', label: 'Schools Closed (winter break)', kind: 'break' },
    { start: '2027-01-04', end: '2027-01-04', label: 'Employee Planning Day – No School for Students', kind: 'staff-day' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Schools and Administrative Offices Closed (MLK Day)', kind: 'holiday' },
    { start: '2027-02-15', end: '2027-02-15', label: "Schools and Administrative Offices Closed (Presidents' Day)", kind: 'holiday' },
    { start: '2027-03-10', end: '2027-03-10', label: 'Schools Closed', kind: 'holiday' },
    { start: '2027-03-19', end: '2027-03-19', label: 'Employee Planning Day – No School for Students', kind: 'staff-day' },
    { start: '2027-03-22', end: '2027-03-26', label: 'Schools Closed (spring break)', kind: 'break' },
  ],
  source: {
    url: 'https://www.browardschools.com/bcps-departments/office-of-communications/accessible-school-year-calendar/202627-school-calendar',
    title: 'Broward County Public Schools — 2026/27 School Calendar',
    retrieved: '2026-11-04',
    documentDate: '2026-05-27',
  },
  notes:
    'The calendar lists the Nov 3 planning day as "Monday, November 3, 2026", but Nov 3, 2026 is a Tuesday (Election Day). This preset uses Nov 3, which gives 180 student days. Severe-weather make-up days are 10/9/26, 12/18/26, 3/18/27, 4/30/27 and 5/28/27; these are early-release school days and are not closures. Labels in brackets are added for clarity; the calendar itself only says "Schools Closed".',
};
