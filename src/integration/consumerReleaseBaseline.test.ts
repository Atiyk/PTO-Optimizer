import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { SolveInput } from '@daysoff/engine/solver/types';
import { createPtoRequest, requestDatesForScenario } from '../personal/requestLedger';
import { planFamilyTime } from '../personal/familyPlan';
import { solveLegacyConsumer, validatePtoDates } from '../planning/optimizer';
import { buildOverlapShareURL, readFullStateFromURL, readOverlapPayloadFromURL } from '../ui/urlState';

/**
 * Orchestrator-owned pre-integration baseline. These invariants must remain green
 * while W/C/S modules are serially integrated. This is NOT a substitute for the
 * new cross-feature wallet/calendar/recommendation acceptance test on the merged SHA.
 */
describe('consumer engineering release baseline', () => {
  it('deduplicates approved requests while keeping pending PTO tentative', () => {
    const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: ['2027-01-04'] };
    const now = '2026-11-07T16:00:00.000Z';
    const approved = createPtoRequest({
      start: '2027-01-05', end: '2027-01-06', status: 'approved', note: 'Private appointment',
    }, calendar, 'approved-a', now)!;
    const overlapping = createPtoRequest({
      start: '2027-01-06', end: '2027-01-06', status: 'approved',
    }, calendar, 'approved-b', now)!;
    const pending = createPtoRequest({
      start: '2027-01-06', end: '2027-01-07', status: 'requested',
    }, calendar, 'pending', now)!;
    const entries = [approved, overlapping, pending];
    expect(requestDatesForScenario(entries, '2027-01-01', '2027-01-31'))
      .toEqual(['2027-01-05', '2027-01-06']);
    expect(requestDatesForScenario(entries, '2027-01-01', '2027-01-31', true))
      .toEqual(['2027-01-05', '2027-01-06', '2027-01-07']);
  });

  it('preserves legacy objective, pins, blackouts, and an observed employer holiday', () => {
    const defaults = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 6, country: 'US' };
    const state = readFullStateFromURL(
      '?objective=one-long-trip&s=2027-01-01&e=2027-01-31&b=6&p=2027-01-05&bo=2027-01-08',
      defaults,
    );
    expect([state.w, state.breakCount]).toEqual([20, 1]);
    expect(state.pinnedDays).toEqual(['2027-01-05']);
    expect(state.blackouts).toEqual(['2027-01-08']);
    const input: SolveInput = {
      offDays: ['2027-01-04'], rangeStart: state.rangeStart, rangeEnd: state.rangeEnd,
      budget: state.budget, workWeek: state.workWeek, mustIncludeDays: state.pinnedDays,
      blackouts: state.blackouts, w: state.w, breakCount: state.breakCount,
    };
    expect(validatePtoDates(input, ['2027-01-04', '2027-01-05']))
      .toMatchObject({ valid: true, ptoDays: ['2027-01-05'] });
    expect(validatePtoDates(input, ['2027-01-08']).valid).toBe(false);
    const solved = solveLegacyConsumer(input);
    expect(solved.result.budgetSpent).toBeLessThanOrEqual(input.budget);
    expect(validatePtoDates(input, solved.result.primary.flatMap(brk => brk.days)).valid).toBe(true);
  });

  it('uses a minimal partner-overlap link and distinguishes third-party school coverage', () => {
    const url = buildOverlapShareURL(
      'https://pto.example', '/', ['2027-01-05', '2027-01-06'],
    );
    const parsed = new URL(url);
    expect([...parsed.searchParams.keys()]).toEqual(['ov']);
    expect(readOverlapPayloadFromURL(parsed.search))
      .toEqual(['2027-01-05', '2027-01-06']);
    expect(url).not.toContain('Private appointment');

    const family = planFamilyTime({
      start: '2027-01-04', end: '2027-01-08',
      schoolOffDays: ['2027-01-06'],
      parentFreeDays: ['2027-01-04'],
      otherAdultDays: ['2027-01-06'],
      ptoBudget: 0,
    });
    expect(family).not.toBeNull();
    expect(family?.gaps).toContainEqual({ date: '2027-01-06', cover: 'other-adult' });
    expect(family?.uncoveredDays).toEqual([]);
  });
});
