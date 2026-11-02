import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, parseRequestLedger, readRequestLedger, requestConflicts, requestDatesForScenario, requestPtoDates, REQUEST_STATUSES, REQUEST_TRANSITIONS, validRequestRange, writeRequestLedger, type PtoRequest, type RequestCalendar } from './requestLedger';

const calendar: RequestCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: ['2027-01-01', '2027-01-01'] };
function request(id: string, start = '2027-01-01', end = '2027-01-05', status: PtoRequest['status'] = 'planned'): PtoRequest {
  return createPtoRequest({ start, end, status, note: 'Private note' }, calendar, id, '2026-11-02T10:00:00.000Z')!;
}

describe('personal PTO requests', () => {
  it('uses actual working dates and deduplicated employer holidays', () => {
    expect(requestPtoDates('2027-01-01', '2027-01-05', calendar)).toEqual(['2027-01-04', '2027-01-05']);
    expect(request('one').ptoDays).toBe(2);
  });
  it('supports nonstandard workweeks and alternating Friday exceptions from the optimizer', () => {
    const nonstandard: RequestCalendar = { workWeek: [true, true, true, true, true, true, false], offDays: ['2027-01-08'] };
    expect(requestPtoDates('2027-01-08', '2027-01-10', nonstandard)).toEqual(['2027-01-09']);
  });
  it('rejects reversed, impossible and unbounded date ranges', () => {
    expect(validRequestRange('2027-02-30', '2027-03-02')).toBe(false);
    expect(validRequestRange('2027-03-02', '2027-03-01')).toBe(false);
    expect(validRequestRange('2027-01-01', '2040-01-01')).toBe(false);
    expect(createPtoRequest({ start: '', end: '' }, calendar, 'one')).toBeNull();
  });
  it('allows correction of every manually entered status', () => {
    for (const status of REQUEST_STATUSES) {
      expect(REQUEST_TRANSITIONS[status]).toEqual(REQUEST_STATUSES.filter((next) => next !== status));
      expect(request('one', undefined, undefined, status).status).toBe(status);
    }
  });
  it('ignores canceled and rejected entries, while approved future dates are charged once', () => {
    const entries = [request('approved', undefined, undefined, 'approved'), request('again', undefined, undefined, 'approved'), request('canceled', '2027-01-06', '2027-01-07', 'canceled'), request('rejected', '2027-01-08', '2027-01-08', 'rejected')];
    expect(requestDatesForScenario(entries, '2027-01-01', '2027-01-31')).toEqual(['2027-01-04', '2027-01-05']);
  });
  it('does not deduct completed past leave already reflected in the starting balance', () => {
    expect(requestDatesForScenario([request('past', undefined, undefined, 'completed')], '2027-01-05', '2027-12-31')).toEqual([]);
  });
  it('keeps planned and requested days in a separate tentative scenario', () => {
    const entries = [request('planned'), request('requested', '2027-01-06', '2027-01-06', 'requested')];
    expect(requestDatesForScenario(entries, '2026-12-31', '2027-01-31')).toEqual([]);
    expect(requestDatesForScenario(entries, '2026-12-31', '2027-01-31', true)).toEqual(['2027-01-04', '2027-01-05', '2027-01-06']);
  });
  it('flags overlapping calendar ranges, including a shared weekend, without inactive requests', () => {
    const entries = [request('first', '2027-01-01', '2027-01-03'), request('second', '2027-01-03', '2027-01-05'), request('inactive', '2027-01-01', '2027-01-05', 'rejected')];
    expect(requestConflicts(entries)).toEqual([{ firstId: 'first', secondId: 'second', start: '2027-01-03', end: '2027-01-03' }]);
  });
});

describe('versioned local request persistence', () => {
  it('round-trips private notes/status locally and recomputes a tampered PTO total', () => {
    const item = { ...request('one'), ptoDays: 999, ptoDates: ['2027-01-04', '2027-01-04', '2027-01-05'] };
    const result = parseRequestLedger(JSON.stringify({ version: 1, requests: [item, item] }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ note: 'Private note', status: 'planned', ptoDays: 2, ptoDates: ['2027-01-04', '2027-01-05'] });
  });
  it('drops malformed or unsupported data rather than trusting it', () => {
    expect(parseRequestLedger('{')).toEqual([]);
    expect(parseRequestLedger(JSON.stringify({ version: 2, requests: [request('one')] }))).toEqual([]);
    expect(parseRequestLedger(JSON.stringify({ version: 1, requests: [{ ...request('one'), status: 'employer-approved' }, { ...request('two'), ptoDates: ['2099-01-01'] }] }))).toEqual([]);
  });
  it('survives inaccessible browser storage without reporting success', () => {
    const denied = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('quota'); } };
    expect(readRequestLedger(denied)).toEqual({ requests: [], available: false });
    expect(writeRequestLedger([request('one')], denied)).toBe(false);
    expect(readRequestLedger(null).available).toBe(false);
  });
  it('persists a validated ledger using a versioned envelope', () => {
    let saved: string | null = null;
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
    expect(writeRequestLedger([request('one')], storage)).toBe(true);
    expect(readRequestLedger(storage).requests).toEqual([request('one')]);
    expect(JSON.parse(saved!).version).toBe(1);
  });
});
