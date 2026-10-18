// Nager.Date's US subdivision coverage is thin (as of 2026 it only has Lincoln's
// Birthday, Good Friday, Truman Day, and Columbus Day/Indigenous Peoples' Day
// variants - see the counties field on https://date.nager.at/api/v3/PublicHolidays/{year}/US).
// Well-known state holidays like Patriots' Day or Cesar Chavez Day are absent
// entirely. This is a static supplementary table for the gaps, not a
// legally-exhaustive list of every observance in all 50 states.

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
  // weekday: 0=Sunday..6=Saturday, matching Date#getUTCDay()
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return toISO(year, month, day);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, daysInMonth));
  const lastWeekday = last.getUTCDay();
  const back = (lastWeekday - weekday + 7) % 7;
  return toISO(year, month, daysInMonth - back);
}

function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface StateHolidayRule {
  name: string;
  states: string[];
  dateFor: (year: number) => string;
}

const RULES: StateHolidayRule[] = [
  { name: "Patriots' Day", states: ['US-MA', 'US-ME'], dateFor: (y) => nthWeekdayOfMonth(y, 4, 1, 3) },
  { name: 'Cesar Chavez Day', states: ['US-CA', 'US-TX'], dateFor: (y) => toISO(y, 3, 31) },
  { name: "Pulaski Day", states: ['US-IL'], dateFor: (y) => nthWeekdayOfMonth(y, 3, 1, 1) },
  {
    name: 'Confederate Memorial Day',
    states: ['US-AL', 'US-GA', 'US-MS', 'US-SC'],
    dateFor: (y) => lastWeekdayOfMonth(y, 4, 1),
  },
  { name: 'Bennington Battle Day', states: ['US-VT'], dateFor: (y) => toISO(y, 8, 16) },
  { name: 'West Virginia Day', states: ['US-WV'], dateFor: (y) => toISO(y, 6, 20) },
  { name: 'Statehood Day', states: ['US-HI'], dateFor: (y) => nthWeekdayOfMonth(y, 8, 5, 3) },
  { name: 'Admission Day', states: ['US-CA'], dateFor: (y) => toISO(y, 9, 9) },
];

export interface StateHoliday {
  date: string;
  name: string;
}

/** Static fallback for state holidays Nager.Date doesn't cover, for one state and one year. */
export function getStateHolidaysFallback(stateCode: string, year: number): StateHoliday[] {
  return RULES.filter((r) => r.states.includes(stateCode)).map((r) => ({ date: r.dateFor(year), name: r.name }));
}
