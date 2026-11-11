import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, type PtoRequest, type RequestCalendar, type RequestStatus } from './requestLedger';
import {
  BALANCE_BASIS_STORAGE_KEY, chargeableRequestDates, committedPlanEntries, committedRequestDays, planningCommitments, planningRole,
  readBalanceBasisPreference, readWorkdaySchedulePreference, requestDateCharge, requestDayEquivalent, writeBalanceBasisPreference, writeWorkdaySchedulePreference,
} from './workspace';

const calendar: RequestCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: ['2027-01-01'] };
function request(id: string, start = '2027-01-01', end = '2027-01-05', status: RequestStatus = 'planned'): PtoRequest {
  return createPtoRequest({ start, end, status }, calendar, id, '2026-11-02T10:00:00.000Z')!;
}
const owes = { asOf: '2027-01-04', includesApprovedLeave: false };
const range = { start: '2027-01-04', end: '2027-01-31' };

describe('personal workspace deduction rule', () => {
  it('classifies every ledger status into one planning role', () => {
    expect(['considering', 'planned', 'requested', 'approved', 'completed', 'canceled', 'rejected'].map(s => planningRole(s as RequestStatus)))
      .toEqual(['idea', 'tentative', 'tentative', 'booked', 'booked', 'inactive', 'inactive']);
  });

  it('never charges a date the as-of balance already reflects, and charges future approved leave once', () => {
    const approved = request('a', '2027-01-04', '2027-01-06', 'approved');
    expect(requestDateCharge(approved, '2027-01-04', owes)).toBe('in-balance');
    expect(requestDateCharge(approved, '2027-01-05', owes)).toBe('charge');
    expect(requestDateCharge(approved, '2027-01-05', { ...owes, includesApprovedLeave: true })).toBe('in-balance');
    expect(requestDateCharge(request('t', '2027-01-05', '2027-01-05', 'requested'), '2027-01-05', { ...owes, includesApprovedLeave: true })).toBe('tentative');
    expect(requestDateCharge(request('i', '2027-01-05', '2027-01-05', 'considering'), '2027-01-05', owes)).toBe('none');
    expect(requestDateCharge(request('p', '2027-01-04', '2027-01-04', 'planned'), '2027-01-04', owes)).toBe('none');
  });

  it('unions overlapping requests so one day is charged once', () => {
    const entries = [request('a', '2027-01-04', '2027-01-06', 'approved'), request('b', '2027-01-05', '2027-01-07', 'approved'), request('t', '2027-01-07', '2027-01-08', 'requested')];
    expect(chargeableRequestDates(entries, owes, '2027-12-31', false)).toEqual(['2027-01-05', '2027-01-06', '2027-01-07']);
    expect(chargeableRequestDates(entries, owes, '2027-12-31', true)).toEqual(['2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08']);
    expect(chargeableRequestDates(entries, { ...owes, includesApprovedLeave: true }, '2027-12-31', true)).toEqual(['2027-01-08']);
  });
});

describe('planner commitments from the shared rule', () => {
  it('treats approved and tentative spans as already off and reserves their PTO once', () => {
    const entries = [
      request('approved', '2027-01-03', '2027-01-06', 'approved'),
      request('overlap', '2027-01-05', '2027-01-07', 'approved'),
      request('completed', '2027-01-08', '2027-01-08', 'completed'),
      request('tentative', '2027-01-11', '2027-01-12', 'requested'),
      request('tentative-overlap', '2027-01-07', '2027-01-07', 'planned'),
      request('idea', '2027-01-18', '2027-01-19', 'considering'),
      request('far', '2027-02-01', '2027-02-02', 'approved'),
    ];
    expect(planningCommitments(entries, range, owes)).toEqual({
      unavailableDates: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-11', '2027-01-12'],
      approvedPtoDays: 4,
      tentativePtoDays: 2,
      reservedPtoDayEquivalent: 6,
      reservedPtoDays: 6,
      hasHourlyBookings: false,
    });
    expect(planningCommitments(entries, range, { ...owes, includesApprovedLeave: true }).reservedPtoDays).toBe(2);
  });

  it('changes planning consistently through the request lifecycle', () => {
    const reserved = (status: RequestStatus) => planningCommitments([request('x', '2027-01-11', '2027-01-13', status)], range, owes);
    expect(reserved('considering')).toMatchObject({ unavailableDates: [], reservedPtoDays: 0 });
    for (const status of ['planned', 'requested'] as const) expect(reserved(status)).toMatchObject({ tentativePtoDays: 3, approvedPtoDays: 0, reservedPtoDays: 3 });
    for (const status of ['approved', 'completed'] as const) expect(reserved(status)).toMatchObject({ tentativePtoDays: 0, approvedPtoDays: 3, reservedPtoDays: 3 });
    for (const status of ['canceled', 'rejected'] as const) expect(reserved(status)).toMatchObject({ unavailableDates: [], reservedPtoDays: 0 });
  });

  const shifts8 = { ...calendar, shiftMinutes: [480, 480, 480, 480, 480, 0, 0] };
  const fourTens = { ...calendar, workWeek: [true, true, true, true, false, false, false] as RequestCalendar['workWeek'], shiftMinutes: [600, 600, 600, 600, 0, 0, 0] };
  const hourly = (id: string, start: string, end: string, status: RequestStatus, cal: RequestCalendar, partialMinutes?: number) =>
    createPtoRequest({ start, end, status, partialMinutes }, cal, id)!;

  it('reserves a partial-day hourly booking as a fraction of that weekday shift, rounded up to a whole day once', () => {
    const half = hourly('h', '2027-01-11', '2027-01-11', 'approved', shifts8, 240);
    expect(planningCommitments([half], range, owes, { shiftMinutes: shifts8.shiftMinutes })).toEqual({
      unavailableDates: ['2027-01-11'], approvedPtoDays: 0.5, tentativePtoDays: 0, reservedPtoDayEquivalent: 0.5, reservedPtoDays: 1, hasHourlyBookings: true,
    });
    // Two half days are one day-equivalent and reserve exactly one whole day, not two.
    const second = hourly('h2', '2027-01-12', '2027-01-12', 'requested', shifts8, 240);
    expect(planningCommitments([half, second], range, owes, { shiftMinutes: shifts8.shiftMinutes })).toMatchObject({ reservedPtoDayEquivalent: 1, reservedPtoDays: 1, tentativePtoDays: 0.5 });
  });

  it('counts a full shift on a 4x10 schedule as one planner day, and partial hours against that 10h shift', () => {
    const fullDays = hourly('f', '2027-01-11', '2027-01-14', 'approved', fourTens);
    const partial = hourly('p', '2027-01-18', '2027-01-18', 'approved', fourTens, 300);
    expect(planningCommitments([fullDays, partial], range, owes, { shiftMinutes: fourTens.shiftMinutes })).toMatchObject({ approvedPtoDays: 4.5, reservedPtoDayEquivalent: 4.5, reservedPtoDays: 5 });
  });

  it('uses hours per day when there is no per-weekday schedule, and a whole day when the shift is unknown', () => {
    const partial = hourly('p', '2027-01-11', '2027-01-11', 'approved', shifts8, 120);
    expect(planningCommitments([partial], range, owes, { hoursPerDay: 8 })).toMatchObject({ reservedPtoDayEquivalent: 0.25, reservedPtoDays: 1 });
    // Without any schedule the planner never guesses a smaller cost.
    expect(planningCommitments([partial], range, owes)).toMatchObject({ reservedPtoDayEquivalent: 1, reservedPtoDays: 1, hasHourlyBookings: true });
  });

  it('charges a date booked both whole-day and hourly once, and skips hourly days already in the balance', () => {
    const whole = request('w', '2027-01-11', '2027-01-11', 'approved');
    const partial = hourly('p', '2027-01-11', '2027-01-11', 'approved', shifts8, 240);
    expect(planningCommitments([whole, partial], range, owes, { hoursPerDay: 8 })).toMatchObject({ reservedPtoDayEquivalent: 1, reservedPtoDays: 1 });
    expect(planningCommitments([partial], range, { ...owes, includesApprovedLeave: true }, { hoursPerDay: 8 })).toMatchObject({ reservedPtoDays: 0, approvedPtoDays: 0.5 });
  });

  it('keeps day-equivalents exact to the thousandth so thirds do not round up an extra day', () => {
    const nineHour = { ...calendar, shiftMinutes: [540, 540, 540, 540, 540, 0, 0] };
    const thirds = ['2027-01-11', '2027-01-12', '2027-01-13'].map((date, i) => hourly(`t${i}`, date, date, 'approved', nineHour, 180));
    expect(planningCommitments(thirds, range, owes, { shiftMinutes: nineHour.shiftMinutes })).toMatchObject({ reservedPtoDayEquivalent: 1, reservedPtoDays: 1 });
  });

  it('reports hourly day-equivalents for other planners', () => {
    const partial = hourly('p', '2027-01-11', '2027-01-11', 'planned', shifts8, 240);
    expect(committedRequestDays([partial], owes, { hoursPerDay: 8 })).toEqual({ approvedDays: 0, tentativeDays: 0.5 });
    expect(requestDayEquivalent(partial, '2027-01-11', { hoursPerDay: 8 })).toBe(0.5);
    expect(requestDayEquivalent(request('w', '2027-01-11', '2027-01-11'), '2027-01-11', { hoursPerDay: 8 })).toBe(1);
  });

  it('totals committed days after a saved balance date for other planners', () => {
    const entries = [request('a', '2027-01-04', '2027-01-06', 'approved'), request('t', '2027-01-11', '2027-01-12', 'planned')];
    expect(committedRequestDays(entries, owes)).toEqual({ approvedDays: 2, tentativeDays: 2 });
    expect(committedRequestDays(entries, { ...owes, includesApprovedLeave: true })).toEqual({ approvedDays: 0, tentativeDays: 2 });
  });
});

describe('shared balance basis preference', () => {
  it('round-trips locally and tolerates missing or legacy values', () => {
    let saved: string | null = null;
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
    expect(readBalanceBasisPreference(storage)).toBeUndefined();
    expect(writeBalanceBasisPreference(true, storage)).toBe(true);
    expect(readBalanceBasisPreference(storage)).toBe(true);
    saved = '{"version":1,"balanceIncludesApprovedLeave":"yes"}';
    expect(readBalanceBasisPreference(storage)).toBeUndefined();
    saved = '{';
    expect(readBalanceBasisPreference(storage)).toBeUndefined();
    expect(readBalanceBasisPreference({ getItem() { throw new Error('denied'); }, setItem() {} })).toBeUndefined();
    expect(BALANCE_BASIS_STORAGE_KEY).toBe('gapless.personal.workspace.v1');
  });

  it('keeps the published workday schedule beside the balance basis without either overwriting the other', () => {
    let saved: string | null = '{"version":1,"balanceIncludesApprovedLeave":true}';
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
    expect(readWorkdaySchedulePreference(storage)).toBeUndefined();
    expect(writeWorkdaySchedulePreference({ shiftMinutes: [600, 600, 600, 600, 0, 0, 0], hoursPerDay: 10 }, storage)).toBe(true);
    expect(readWorkdaySchedulePreference(storage)).toEqual({ shiftMinutes: [600, 600, 600, 600, 0, 0, 0], hoursPerDay: 10 });
    expect(readBalanceBasisPreference(storage)).toBe(true);
    expect(writeBalanceBasisPreference(false, storage)).toBe(true);
    expect(readWorkdaySchedulePreference(storage)).toEqual({ shiftMinutes: [600, 600, 600, 600, 0, 0, 0], hoursPerDay: 10 });
    saved = '{"version":1,"balanceIncludesApprovedLeave":true,"workdaySchedule":{"shiftMinutes":[1,2],"hoursPerDay":-1}}';
    expect(readWorkdaySchedulePreference(storage)).toBeUndefined();
  });
});

describe('committed entries the planner keeps visible', () => {
  it('lists booked and tentative requests overlapping the window in date order with their saved cost', () => {
    const entries = [
      request('later', '2027-01-18', '2027-01-19', 'approved'),
      request('tracked', '2027-01-11', '2027-01-12', 'planned'),
      request('idea', '2027-01-13', '2027-01-13', 'considering'),
      request('gone', '2027-01-14', '2027-01-14', 'canceled'),
      request('outside', '2027-03-01', '2027-03-02', 'approved'),
      request('edge', '2027-01-01', '2027-01-04', 'requested'),
    ];
    expect(committedPlanEntries(entries, range).map(e => [e.id, e.role, e.status, e.start, e.end, e.ptoDays])).toEqual([
      ['edge', 'tentative', 'requested', '2027-01-01', '2027-01-04', 1],
      ['tracked', 'tentative', 'planned', '2027-01-11', '2027-01-12', 2],
      ['later', 'booked', 'approved', '2027-01-18', '2027-01-19', 2],
    ]);
  });
});
