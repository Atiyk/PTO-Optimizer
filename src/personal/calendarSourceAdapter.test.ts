import { describe, expect, it } from 'vitest';
import { normalizeCalendarSources, applyCalendarSources } from './calendarSourceAdapter';
import { calendarAvailability } from './recurringAvailability';
describe('privacy-safe bounded calendar source adapter', () => {
  it('separates hard, advisory and contextual dates across leap day', () => {
    const result = normalizeCalendarSources([{ source: 'ics', completeness: 'complete', events: [
      { start: '2028-02-28', end: '2028-02-29', blocking: 'review' },
      { start: '2028-02-29', end: '2028-02-29', blocking: 'hard' },
      { start: '2028-03-01', end: '2028-03-01', blocking: 'context' },
    ] }])!;
    expect(result.hardBlockDays).toEqual(['2028-02-29']);
    expect(result.advisoryBusyDays).toEqual(['2028-02-28', '2028-02-29']);
    expect(result.contextDays).toEqual(['2028-03-01']);
    expect(result.partial).toBe(false);
  });
  it('retains existing source dates and discloses truncation without private details', () => {
    const result = normalizeCalendarSources([{ source: 'ics', completeness: 'partial', truncated: true,
      events: [{ start: '2028-01-04', end: '2028-01-04', blocking: 'review', title: 'PRIVATE' } as never] }])!;
    const input = applyCalendarSources({ start: '2028-01-03', end: '2028-01-05',
      schedule: { kind: 'weekly', weekly: [true,true,true,true,true,false,false] },
      hardBlockDays: ['2028-01-03'], calendarPartial: false }, result);
    expect(calendarAvailability(input)?.days[0].hardBlocked).toBe(true);
    expect(input.calendarPartial).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('rejects unbounded and malformed event ranges', () => {
    expect(normalizeCalendarSources([{ source: 'ics', completeness: 'complete', events:
      [{ start: '2028-02-30', end: '2028-03-01', blocking: 'hard' }] }])).toBeNull();
    expect(normalizeCalendarSources([{ source: 'ics', completeness: 'complete', events:
      [{ start: '2028-01-01', end: '2029-12-31', blocking: 'hard' }] }])).toBeNull();
  });
});
