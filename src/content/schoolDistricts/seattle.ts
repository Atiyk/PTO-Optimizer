import type { SchoolDistrictPreset } from './types';

// Source: Seattle Public Schools, "2026-2027 School Year Calendar"
// https://www.seattleschools.org/wp-content/uploads/2026/04/2026-27-SY-Calendar-for-Webpage.pdf
// Cross-checked with https://www.seattleschools.org/news/school-calendar/ ("2026-27 School Year Dates").
// Read 2026-11-04.
export const SEATTLE_2026_27: SchoolDistrictPreset = {
  id: 'seattle-sps-2026-27',
  district: 'Seattle Public Schools',
  shortName: 'Seattle Public Schools',
  city: 'Seattle',
  state: 'WA',
  schoolYear: '2026-27',
  firstDay: '2026-09-02',
  lastDay: '2027-06-21',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-10-09', end: '2026-10-09', label: 'State In-Service Day (no students)', kind: 'staff-day' },
    { start: '2026-11-11', end: '2026-11-11', label: 'Veterans Day', kind: 'holiday' },
    { start: '2026-11-26', end: '2026-11-27', label: 'Thanksgiving & Native American Heritage Day', kind: 'holiday' },
    { start: '2026-12-21', end: '2027-01-01', label: 'Winter Break', kind: 'break' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Martin Luther King Jr. Day', kind: 'holiday' },
    {
      start: '2027-01-28',
      end: '2027-01-28',
      label: 'Day Between Semesters (possible make-up day)',
      kind: 'weather-makeup-reserve',
    },
    { start: '2027-02-15', end: '2027-02-19', label: "Mid-Winter Break (incl. Presidents' Day)", kind: 'break' },
    { start: '2027-04-12', end: '2027-04-16', label: 'Spring Break', kind: 'break' },
    { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day', kind: 'holiday' },
    { start: '2027-06-18', end: '2027-06-18', label: 'Juneteenth', kind: 'holiday' },
  ],
  source: {
    url: 'https://www.seattleschools.org/wp-content/uploads/2026/04/2026-27-SY-Calendar-for-Webpage.pdf',
    title: 'Seattle Public Schools — 2026-2027 School Year Calendar',
    retrieved: '2026-11-04',
  },
  notes:
    'Nov 23–25, 2026 are family-teacher conference days: most elementary and K–8 schools are closed but it varies by school (most middle schools are open), so they are not listed; check your school. Jan 28, 2027 is no school but may become an emergency make-up day; June 22–23, 2027 are further make-up days if needed. Preschool and kindergarten start Sept 8, 2026. Every Wednesday is early release (not a closure).',
};
