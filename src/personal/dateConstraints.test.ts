import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { calendarAvailability } from './recurringAvailability';
import { constraintsFromAvailability, hardExcludedDates } from './dateConstraints';

describe('calendar to recommendation contract', () => {
  it('keeps school closures contextual and advisory conflicts soft', () => {
    const window = calendarAvailability({ start: '2027-01-04', end: '2027-01-06',
      schedule: { kind: 'weekly', weekly: DEFAULT_WORK_WEEK },
      hardBlockDays: ['2027-01-05'], advisoryBusyDays: ['2027-01-06'],
      schoolOffDays: ['2027-01-04'], calendarPartial: false })!;
    const set = constraintsFromAvailability(window)!;
    expect(hardExcludedDates(set)).toEqual(['2027-01-05']);
    expect(set.dates.find(d => d.provenance === 'school-closure')?.severity).toBe('context');
    expect(set.dates.find(d => d.provenance === 'calendar-busy')?.severity).toBe('review-needed');
    expect(JSON.stringify(set)).not.toContain('title');
  });
  it('preserves employer holiday and approved leave as separate contextual sources', () => {
    const window = calendarAvailability({ start: '2027-01-04', end: '2027-01-06',
      schedule: { kind: 'weekly', weekly: DEFAULT_WORK_WEEK },
      employerOffDays: ['2027-01-04', '2027-01-05'],
      approvedOffDays: ['2027-01-05', '2027-01-06'], calendarPartial: false })!;
    const set = constraintsFromAvailability(window)!;
    expect(set.dates.filter(d => d.provenance === 'employer-holiday').map(d => d.date)).toEqual(['2027-01-04', '2027-01-05']);
    expect(set.dates.filter(d => d.provenance === 'approved-leave').map(d => d.date)).toEqual(['2027-01-05', '2027-01-06']);
    expect(hardExcludedDates(set)).toEqual([]);
  });
  it('discloses incomplete calendars without asserting freedom', () => {
    const window = calendarAvailability({ start: '2028-02-29', end: '2028-02-29',
      schedule: { kind: 'weekly', weekly: DEFAULT_WORK_WEEK } })!;
    expect(constraintsFromAvailability(window)).toMatchObject({ partial: true, missingSources: ['Calendar completeness unverified'] });
  });
});
