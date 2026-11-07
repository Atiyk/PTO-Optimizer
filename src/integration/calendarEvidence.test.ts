import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { buildIntegratedCalendarEvidence } from './calendarEvidence';
import { hardExcludedDates } from '../personal/dateConstraints';
import { jointWindowFeasibility } from '../personal/recurringAvailability';

const schedule = { kind: 'weekly' as const, weekly: DEFAULT_WORK_WEEK };

describe('orchestrator integrated calendar evidence', () => {
  it('preserves ICS context separately from hard, review, employer holiday, and approved PTO', () => {
    const evidence = buildIntegratedCalendarEvidence({
      start: '2028-02-28', end: '2028-03-02', schedule,
      employerOffDays: ['2028-02-29'], approvedOffDays: ['2028-03-01'],
      schoolOffDays: ['2028-03-01'], calendarPartial: false,
    }, [{
      source: 'ics', completeness: 'complete',
      events: [
        { start: '2028-02-28', end: '2028-02-28', blocking: 'hard' },
        { start: '2028-02-29', end: '2028-02-29', blocking: 'review' },
        { start: '2028-03-02', end: '2028-03-02', blocking: 'context', title: 'PRIVATE' } as never,
      ],
    }])!;
    expect(evidence).not.toBeNull();
    expect(hardExcludedDates(evidence.constraints)).toEqual(['2028-02-28']);
    expect(evidence.constraints.dates).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2028-02-29', severity: 'review-needed', provenance: 'calendar-busy' }),
      expect.objectContaining({ date: '2028-02-29', severity: 'context', provenance: 'employer-holiday' }),
      expect.objectContaining({ date: '2028-03-01', severity: 'context', provenance: 'approved-leave' }),
      expect.objectContaining({ date: '2028-03-01', severity: 'context', provenance: 'school-closure' }),
    ]));
    expect(evidence.importedContextDates).toEqual(['2028-03-02']);
    expect(evidence.constraints.dates.some(day => day.date === '2028-03-02' && day.severity === 'hard-block')).toBe(false);
    expect(evidence.partial).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain('PRIVATE');
  });

  it('discloses partial/truncated sources and rejects forged event dates', () => {
    const input = { start: '2028-03-01', end: '2028-03-03', schedule, calendarPartial: false };
    const partial = buildIntegratedCalendarEvidence(input, [{
      source: 'manual', completeness: 'partial', truncated: true,
      events: [{ start: '2028-03-02', end: '2028-03-02', blocking: 'context' }],
    }])!;
    expect(partial.importedContextDates).toEqual(['2028-03-02']);
    expect(partial.partial).toBe(true);
    expect(partial.sourceWarnings).toContain('Calendar coverage is incomplete');
    expect(buildIntegratedCalendarEvidence(input, [{
      source: 'ics', completeness: 'complete',
      events: [{ start: '2028-02-30', end: '2028-03-01', blocking: 'context' }],
    }])).toBeNull();
  });

  it('retains two adults’ independent holiday budgets while rejecting fractional day input', () => {
    const base = { start: '2028-02-28', end: '2028-03-02', schedule, calendarPartial: false };
    const a = buildIntegratedCalendarEvidence({ ...base, employerOffDays: ['2028-02-29'] }, [])!;
    const b = buildIntegratedCalendarEvidence({ ...base, employerOffDays: ['2028-03-01'] }, [])!;
    const joint = jointWindowFeasibility(a.availability, b.availability, 3, 3);
    expect(joint).toMatchObject({ possible: true, ptoDaysA: 3, ptoDaysB: 3, partial: false });
    expect(jointWindowFeasibility(a.availability, b.availability, 2, 3)?.possible).toBe(false);
    expect(jointWindowFeasibility(a.availability, b.availability, 3.5, 3)).toBeNull();
  });
});
