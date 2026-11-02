import { describe, expect, it } from 'vitest';
import { parseICSBusyDays } from '../ui/icsImport';
import { buildSchoolCalendar, MAX_SCHOOL_CALENDAR_DAYS } from './schoolCalendar';

const calendar = (events: string) => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + events + 'END:VCALENDAR\r\n';
const event = (dates: string) => 'BEGIN:VEVENT\r\n' + dates + '\r\nSUMMARY:Private child name not retained\r\nEND:VEVENT\r\n';

describe('consumer school-calendar normalization', () => {
  it('deduplicates manual closures across the academic year without inferring unlisted dates', () => {
    const school = buildSchoolCalendar({
      manualOffDays: ['2027-01-01', '2026-12-31', '2027-01-01'],
      inSessionDays: ['2027-01-04'],
    });
    expect(school).toEqual({
      version: 1, source: 'manual', offDays: ['2026-12-31', '2027-01-01'],
      inSessionDays: ['2027-01-04'], coverage: 'partial', warnings: [],
    });
    expect(school?.offDays).not.toContain('2027-01-02');
  });

  it('reuses the existing local ICS parser, including exclusive DTEND across DST and year boundaries', () => {
    const parsed = parseICSBusyDays(calendar(
      event('DTSTART;VALUE=DATE:20270313\r\nDTEND;VALUE=DATE:20270316')
      + event('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270102'),
    ));
    const school = buildSchoolCalendar({ imported: parsed });
    expect(school?.source).toBe('ics');
    expect(school?.offDays).toEqual([
      '2026-12-31', '2027-01-01', '2027-03-13', '2027-03-14', '2027-03-15',
    ]);
    expect(school?.offDays).not.toContain('2027-03-16');
    expect(JSON.stringify(school)).not.toContain('Private child name');
  });

  it('reports skipped recurring events and truncated imports instead of claiming complete coverage', () => {
    const school = buildSchoolCalendar({
      imported: { busyDays: ['2027-05-03'], cappedAt: 500, skippedRecurring: 2 },
      manualOffDays: ['2027-05-04'],
    });
    expect(school?.source).toBe('mixed');
    expect(school?.warnings).toEqual(['import-truncated', 'recurring-events-skipped']);
    expect(school?.coverage).toBe('partial');
  });

  it('preserves contradictory manual labels as an explicit warning, not a silent assumption', () => {
    const school = buildSchoolCalendar({ manualOffDays: ['2027-06-01'], inSessionDays: ['2027-06-01'] });
    expect(school?.warnings).toContain('conflicting-school-labels');
    expect(school?.inSessionDays).toContain('2027-06-01');
  });

  it('fails closed on malformed dates, missing input and oversized payloads', () => {
    expect(buildSchoolCalendar({})).toBeNull();
    expect(buildSchoolCalendar({ manualOffDays: ['2027-02-29'] })).toBeNull();
    expect(buildSchoolCalendar({ imported: { busyDays: ['invalid'], cappedAt: null, skippedRecurring: 0 } })).toBeNull();
    expect(buildSchoolCalendar({ manualOffDays: Array(MAX_SCHOOL_CALENDAR_DAYS + 1).fill('2027-01-01') })).toBeNull();
    expect(buildSchoolCalendar({ imported: { busyDays: [], cappedAt: -1, skippedRecurring: 0 } })).toBeNull();
    expect(buildSchoolCalendar({ imported: { busyDays: [], cappedAt: null, skippedRecurring: -1 } })).toBeNull();
  });
});
