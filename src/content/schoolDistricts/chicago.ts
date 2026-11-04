import type { SchoolDistrictPreset } from './types';

// Source: Chicago Public Schools calendar page https://www.cps.edu/calendar/
// which links the "2026-27 Family Calendar" (English/Spanish, dated 02/22/2026) hosted on CPS's asset CDN:
// https://cdn.bfldr.com/MXCD21SV/as/pw6ckf4sckrxgv5xk9j59hsw/EDUC_District_Calendar_626857_Calend_Fam_SY26-27_D_EN_SP_02222026
// and the 2026-27 Staff Calendar. First/last day also confirmed in the CPS press release
// https://www.cps.edu/press-releases/2026/february/chicago-public-schools-finalizes-academic-calendar-for-2026-27-and-2027-28-school-years/
// Read 2026-11-04.
export const CHICAGO_2026_27: SchoolDistrictPreset = {
  id: 'chicago-cps-2026-27',
  district: 'Chicago Public Schools',
  shortName: 'Chicago Public Schools',
  city: 'Chicago',
  state: 'IL',
  schoolYear: '2026-27',
  firstDay: '2026-08-24',
  lastDay: '2027-06-11',
  closures: [
    { start: '2026-09-07', end: '2026-09-07', label: 'Labor Day', kind: 'holiday' },
    { start: '2026-09-25', end: '2026-09-25', label: 'Professional development day', kind: 'staff-day' },
    { start: '2026-10-12', end: '2026-10-12', label: "Indigenous Peoples' Day", kind: 'holiday' },
    { start: '2026-11-02', end: '2026-11-02', label: 'Parent-teacher conference day', kind: 'staff-day' },
    { start: '2026-11-03', end: '2026-11-03', label: 'General Election (observed in lieu of Veterans Day)', kind: 'holiday' },
    { start: '2026-11-11', end: '2026-11-11', label: 'Professional development day', kind: 'staff-day' },
    { start: '2026-11-26', end: '2026-11-27', label: 'Thanksgiving holiday', kind: 'holiday' },
    { start: '2026-12-21', end: '2027-01-01', label: 'Winter vacation', kind: 'break' },
    { start: '2027-01-04', end: '2027-01-04', label: 'Professional development day', kind: 'staff-day' },
    { start: '2027-01-18', end: '2027-01-18', label: 'Martin Luther King Jr. Day', kind: 'holiday' },
    { start: '2027-01-29', end: '2027-01-29', label: 'Professional development day', kind: 'staff-day' },
    { start: '2027-02-15', end: '2027-02-15', label: "Presidents' Day", kind: 'holiday' },
    { start: '2027-02-23', end: '2027-02-23', label: 'Professional development day', kind: 'staff-day' },
    { start: '2027-03-22', end: '2027-03-26', label: 'Spring vacation', kind: 'break' },
    { start: '2027-04-06', end: '2027-04-06', label: 'Professional development day', kind: 'staff-day' },
    { start: '2027-04-12', end: '2027-04-12', label: 'Parent-teacher conference day', kind: 'staff-day' },
    { start: '2027-05-31', end: '2027-05-31', label: 'Memorial Day', kind: 'holiday' },
  ],
  source: {
    url: 'https://www.cps.edu/calendar/',
    title: 'Chicago Public Schools — 2026-27 Family Calendar',
    retrieved: '2026-11-04',
    documentDate: '2026-02-22',
  },
  notes:
    'Calendar does not say in words that students are off on professional development days; they are treated as closures because the quarter day counts on the calendar (Q1 42, Q3 42, Q4 47) only add up that way. Q2 is listed as 45 days but the listed closures give 48, so up to 3 more no-school days may exist that this preset does not show. June 15–17 and 21–22, 2027 are emergency days used only if needed. Pre-K starts Aug 25, 2026 and ends June 10, 2027.',
};
