import { describe, expect, it } from 'vitest';
import { calendarAvailability } from '../personal/recurringAvailability';
import type { RecommendationAlternative } from '../planning/recommendationAlternatives';
import { filterJointRecommendations } from './jointRecommendationHandoff';

const candidate = (start: string, end = start): RecommendationAlternative => ({
  start, end, ptoDays: 1, breakDays: start === end ? 1 : 2, getawayCount: 1,
  hardExcludedDates: [], reviewDates: [], objective: 'balanced', explanation: 'solo',
});
const base = {
  start: '2027-01-04', end: '2027-01-06',
  schedule: { kind: 'weekly' as const, weekly: [true, true, true, true, true, false, false] as [boolean,boolean,boolean,boolean,boolean,boolean,boolean] },
  calendarPartial: false,
};
describe('couple-facing canonical handoff', () => {
  it('excludes partner-only hard blocks and separately exhausted bank, retaining genuinely funded intervals', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability({ ...base, hardBlockDays: ['2027-01-05'], employerOffDays: ['2027-01-06'] })!;
    const candidates = [candidate('2027-01-04'), candidate('2027-01-05'), candidate('2027-01-06')];
    const result = filterJointRecommendations(candidates, a, b, 3, 1)!;
    expect(result.rejected).toBe(1);
    expect(result.feasible.map(x => x.recommendation.start)).toEqual(['2027-01-04', '2027-01-06']);
    expect(result.feasible[1].feasibility.ptoDaysB).toBe(0);
    const unfunded = filterJointRecommendations(candidates, a, b, 3, 0)!;
    expect(unfunded.feasible.map(x => x.recommendation.start)).toEqual(['2027-01-06']);
    expect(unfunded.rejected).toBe(2);
  });
  it('does not assert unconditional joint feasibility with partial data, advisory events or school gaps', () => {
    const a = calendarAvailability({ ...base, schoolOffDays: ['2027-01-04'] })!;
    const b = calendarAvailability({ ...base, calendarPartial: true, advisoryBusyDays: ['2027-01-04'] })!;
    const result = filterJointRecommendations([candidate('2027-01-04')], a, b, 2, 2)!;
    expect(result.feasible).toEqual([]);
    expect(result.needsReview).toHaveLength(1);
    expect(result.needsReview[0].potentialSchoolCoverageGapDays).toBe(1);
    expect(result.needsReview[0].feasibility.reviewDates).toEqual(['2027-01-04']);
  });
  it('strips imported recommendation secrets and refuses forged PTO or date metadata', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability(base)!;
    const imported = {
      ...candidate('2027-01-04'),
      explanation: 'PRIVATE_MEDICAL_CALENDAR_TITLE',
      privateNote: 'PRIVATE_PARTNER_CONTACT',
      nested: { email: 'PRIVATE_EMAIL' },
      reviewDates: ['2027-01-06'],
    };
    const output = filterJointRecommendations([imported], a, b, 3, 3)!;
    expect(output.feasible).toHaveLength(1);
    expect(output.feasible[0].recommendation).toEqual({
      start: '2027-01-04', end: '2027-01-04',
      ptoDays: 1, breakDays: 1, getawayCount: 1,
      hardExcludedDates: [], reviewDates: [], objective: 'balanced',
      explanation: expect.stringContaining('1 PTO days for adult A'),
    });
    expect(JSON.stringify(output)).not.toContain('PRIVATE_');
    expect(JSON.stringify(output)).not.toContain('2027-01-06');
    expect(filterJointRecommendations([{ ...imported, ptoDays: 0 }], a, b, 3, 3)).toBeNull();
    expect(filterJointRecommendations([{ ...imported, breakDays: 2 }], a, b, 3, 3)).toBeNull();
    expect(filterJointRecommendations([{ ...imported, getawayCount: 2 }], a, b, 3, 3)).toBeNull();
    expect(filterJointRecommendations([{ ...imported, objective: 'most-getaways' }], a, b, 3, 3)).toBeNull();
    expect(filterJointRecommendations([{ ...imported, hardExcludedDates: ['2027-01-04'] }], a, b, 3, 3)).toBeNull();
    expect(filterJointRecommendations([{ ...imported, reviewDates: ['not-a-date'] }], a, b, 3, 3)).toBeNull();
  });

  it('rejects forged provenance and incomplete candidate dates rather than claiming funded results', () => {
    const a = calendarAvailability(base)!;
    const b = calendarAvailability(base)!;
    expect(filterJointRecommendations([candidate('2027-01-07')], a, b, 3, 3)).toBeNull();
    const forged = { ...b, days: b.days.map((d, i) => i === 0 ? { ...d, alreadyOff: true } : d) };
    expect(filterJointRecommendations([candidate('2027-01-04')], a, forged, 3, 3)).toBeNull();
  });
});
