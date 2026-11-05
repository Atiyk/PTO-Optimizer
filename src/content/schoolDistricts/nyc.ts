import type { SchoolDistrictPreset } from './types';

// Source: NYC Public Schools, "School Year Calendar 2026–2027" (official PDF)
// https://www.schools.nyc.gov/docs/default-source/sections/calendar/2026-27-school-year-calendar.pdf
// Read 2026-11-04. Only dates marked "schools closed" / "students do not attend" are closures.
export const NYC_2026_27: SchoolDistrictPreset = {
  id: 'nyc-doe-2026-27',
  district: 'New York City Public Schools',
  shortName: 'NYC Public Schools',
  city: 'New York',
  state: 'NY',
  schoolYear: '2026-27',
  firstDay: '2026-09-10',
  lastDay: '2027-06-28',
  closures: [
    { start: '2026-09-21', end: '2026-09-21', label: 'Yom Kippur', kind: 'holiday' },
    { start: '2026-10-12', end: '2026-10-12', label: "Italian Heritage/Indigenous Peoples' Day", kind: 'holiday' },
    { start: '2026-11-11', end: '2026-11-11', label: 'Veterans Day', kind: 'holiday' },
    { start: '2026-11-26', end: '2026-11-27', label: 'Thanksgiving Recess', kind: 'break' },
    { start: '2026-12-24', end: '2027-01-01', label: 'Winter Recess', kind: 'break' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Rev. Dr. Martin Luther King Jr. Day', kind: 'holiday' },
    { start: '2027-02-15', end: '2027-02-19', label: 'Midwinter Recess', kind: 'break' },
    { start: '2027-03-09', end: '2027-03-09', label: 'Eid al-Fitr', kind: 'holiday' },
    { start: '2027-03-26', end: '2027-03-26', label: 'Good Friday', kind: 'holiday' },
    { start: '2027-04-22', end: '2027-04-30', label: 'Spring Recess', kind: 'break' },
    { start: '2027-05-17', end: '2027-05-17', label: 'Eid al-Adha', kind: 'holiday' },
    { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day', kind: 'holiday' },
    {
      start: '2027-06-08',
      end: '2027-06-08',
      label: 'Clerical Day (no classes for 3-K, Pre-K, elementary, middle, K–12 and D75 students)',
      kind: 'staff-day',
    },
    { start: '2027-06-10', end: '2027-06-10', label: "Anniversary Day/Chancellor's Conference Day", kind: 'staff-day' },
  ],
  source: {
    url: 'https://www.schools.nyc.gov/docs/default-source/sections/calendar/2026-27-school-year-calendar.pdf',
    title: 'NYC Public Schools — School Year Calendar 2026–2027',
    retrieved: '2026-11-04',
  },
  notes:
    'Election Day (Nov 3, 2026) is a remote-learning day, not a closure. Feb 1, 2027 is a PD day only for high schools and 6–12 schools (other students attend), so it is not listed. June 8, 2027 Clerical Day: high-school students still attend. Juneteenth falls on Saturday, June 19, 2027 and no weekday closure for it is listed; check with your school.',
};
