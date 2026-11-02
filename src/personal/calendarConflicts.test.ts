import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { checkCalendarConflicts } from './calendarConflicts';
import { createPtoRequest, type PtoRequest } from './requestLedger';
import { buildSchoolCalendar } from './schoolCalendar';

const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [] };
const request = (id: string, status: PtoRequest['status'], start = '2027-01-04', end = '2027-01-06') =>
  createPtoRequest({ start, end, status, note: 'Private employee medical details' }, calendar, id)!;

describe('consumer calendar conflict classification', () => {
  it('classifies declared blackouts and approved/completed PTO as hard, tentative PTO as advisory', () => {
    const result = checkCalendarConflicts({
      start: '2027-01-04', end: '2027-01-06',
      employerBlackouts: ['2027-01-04', '2027-01-04'],
      requests: [
        request('approved', 'approved', '2027-01-04', '2027-01-04'),
        request('completed', 'completed', '2027-01-05', '2027-01-05'),
        request('requested', 'requested', '2027-01-06', '2027-01-06'),
        request('planned', 'planned', '2027-01-06', '2027-01-06'),
        request('canceled', 'canceled', '2027-01-06', '2027-01-06'),
        request('rejected', 'rejected', '2027-01-06', '2027-01-06'),
      ],
    });
    expect(result?.status).toBe('hard-block');
    expect(result?.hardBlockDays).toBe(2);
    expect(result?.reviewNeededDays).toBe(1);
    expect(result?.matches.filter((m) => m.category === 'employer-blackout')).toHaveLength(1);
    expect(result?.matches.filter((m) => m.category === 'confirmed-leave')).toHaveLength(2);
    expect(result?.matches.filter((m) => m.category === 'tentative-leave')).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('Private employee medical details');
    expect(JSON.stringify(result)).not.toContain('approved');
  });

  it('treats school closures as useful context, not automatically a scheduling conflict', () => {
    const school = buildSchoolCalendar({
      manualOffDays: ['2027-01-04'],
      inSessionDays: ['2027-01-05'],
    })!;
    const result = checkCalendarConflicts({
      start: '2027-01-04', end: '2027-01-06',
      school, employerBlackouts: [], requests: [], personalBusyDays: [], commitments: [],
    });
    expect(result?.status).toBe('review-needed');
    expect(result?.schoolOffDays).toEqual(['2027-01-04']);
    expect(result?.matches).toEqual([{ date: '2027-01-05', category: 'school-in-session', severity: 'review-needed' }]);
    expect(result?.partial).toBe(true);
  });

  it('treats imported busy dates as advisory, preserves explicit commitment severity', () => {
    const result = checkCalendarConflicts({
      start: '2027-03-13', end: '2027-03-15',
      personalBusyDays: ['2027-03-14', '2027-03-14'],
      personalCalendarPartial: true,
      commitments: [{ date: '2027-03-15', severity: 'hard-block' }],
    });
    expect(result?.hardBlockDays).toBe(1);
    expect(result?.reviewNeededDays).toBe(1);
    expect(result?.partial).toBe(true);
    expect(result?.matches).toContainEqual({ date: '2027-03-14', category: 'personal-calendar-busy', severity: 'review-needed' });
  });

  it('never says all-clear when sources are absent or only partially known', () => {
    const empty = checkCalendarConflicts({ start: '2027-01-04', end: '2027-01-04' });
    expect(empty?.status).toBe('no-conflict-found-in-available-data');
    expect(empty?.partial).toBe(true);
    expect(empty?.missingSources).toEqual([
      'employer-blackouts', 'leave-ledger', 'personal-calendar', 'school-calendar', 'commitments',
    ]);
    const withEmptySources = checkCalendarConflicts({
      start: '2027-01-04', end: '2027-01-04',
      employerBlackouts: [], requests: [], personalBusyDays: [], commitments: [],
    });
    expect(withEmptySources?.missingSources).toEqual(['school-calendar']);
    expect(withEmptySources?.status).toBe('no-conflict-found-in-available-data');
  });

  it('ignores invalid or out-of-window dates and refuses invalid selected windows', () => {
    expect(checkCalendarConflicts({ start: '2027-02-30', end: '2027-03-02' })).toBeNull();
    expect(checkCalendarConflicts({ start: '2027-03-02', end: '2027-03-01' })).toBeNull();
    expect(checkCalendarConflicts({ start: '2027-01-01', end: '2040-01-01' })).toBeNull();
    const result = checkCalendarConflicts({
      start: '2027-01-04', end: '2027-01-04',
      employerBlackouts: ['2027-02-30', '2027-01-05'],
    });
    expect(result?.matches).toEqual([]);
  });

  it('returns date-only summaries without request IDs, notes, calendar titles or share URLs', () => {
    const result = checkCalendarConflicts({
      start: '2027-01-04', end: '2027-01-06',
      requests: [request('secret-person-id', 'approved')],
      personalBusyDays: ['2027-01-05'],
      school: buildSchoolCalendar({ manualOffDays: ['2027-01-06'] })!,
    });
    const serialized = JSON.stringify(result);
    for (const secret of ['secret-person-id', 'Private employee medical details', 'salary', 'http:', 'https:']) {
      expect(serialized).not.toContain(secret);
    }
  });
});
