import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { planningCommitments } from './workspace';
import { calendarCoversRequest, createPtoRequest, initialRequestDate, parseRequestLedger, readRequestLedger, requestConflicts, requestDatesForScenario, requestPtoDates, REQUEST_STATUSES, REQUEST_TRANSITIONS, saveRequestLedger, validRequestRange, writeRequestLedger, type PtoRequest, type RequestCalendar } from './requestLedger';

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
  it('records actual shifts and refuses a partial request that exceeds its shift', () => {
    const schedule = { ...calendar, shiftMinutes: [540, 540, 540, 540, 480, 0, 0] };
    const full = createPtoRequest({ start: '2027-01-07', end: '2027-01-08' }, schedule, 'full')!;
    expect(full.ptoMinutes).toEqual({ '2027-01-07': 540, '2027-01-08': 480 });
    const partial = createPtoRequest({ start: '2027-01-04', end: '2027-01-04', partialMinutes: 241 }, schedule, 'partial')!;
    expect(partial.ptoMinutes).toEqual({ '2027-01-04': 241 });
    expect(parseRequestLedger(JSON.stringify({ version: 1, requests: [partial, full] }))).toEqual([partial, full]);
    expect(createPtoRequest({ start: '2027-01-04', end: '2027-01-04', partialMinutes: 541 }, schedule, 'large')).toBeNull();
    expect(createPtoRequest({ start: '2027-01-04', end: '2027-01-05', partialMinutes: 241 }, schedule, 'range')).toBeNull();
    expect(createPtoRequest({ start: '2027-01-04', end: '2027-01-04', partialMinutes: 241 }, calendar, 'unconfigured')).toBeNull();
  });
  it('rejects reversed, impossible and unbounded date ranges', () => {
    expect(validRequestRange('2027-02-30', '2027-03-02')).toBe(false);
    expect(validRequestRange('2027-03-02', '2027-03-01')).toBe(false);
    expect(validRequestRange('2027-01-01', '2040-01-01')).toBe(false);
    expect(createPtoRequest({ start: '', end: '' }, calendar, 'one')).toBeNull();
  });
  it('accepts the inclusive coverage boundary and refuses unknown holiday dates outside it', () => {
    const covered = { ...calendar, rangeStart: '2027-01-01', rangeEnd: '2027-01-31' };
    expect(calendarCoversRequest(covered, '2027-01-01', '2027-01-31')).toBe(true);
    expect(createPtoRequest({ start: '2027-01-31', end: '2027-02-01' }, covered, 'outside')).toBeNull();
    expect(createPtoRequest({ start: '2026-12-31', end: '2027-01-01' }, covered, 'outside')).toBeNull();
    expect(requestPtoDates('2027-01-31', '2027-02-01', covered)).toEqual([]);
    expect(requestPtoDates('2027-01-01', '2027-01-05', covered)).toEqual(['2027-01-04', '2027-01-05']);
  });
  it('handles one-sided coverage and rejects malformed coverage safely', () => {
    expect(calendarCoversRequest({ ...calendar, rangeStart: '2027-01-01' }, '2026-12-31', '2027-01-01')).toBe(false);
    expect(calendarCoversRequest({ ...calendar, rangeEnd: '2027-12-31' }, '2027-12-31', '2028-01-01')).toBe(false);
    expect(calendarCoversRequest({ ...calendar, rangeStart: 'bad' }, '2027-01-01', '2027-01-05')).toBe(false);
    expect(calendarCoversRequest({ ...calendar, rangeStart: '2027-02-01', rangeEnd: '2027-01-01' }, '2027-01-01', '2027-01-05')).toBe(false);
  });
  it('initializes tomorrow within known calendar coverage without changing existing requests', () => {
    const covered = { ...calendar, rangeStart: '2027-01-01', rangeEnd: '2027-12-31' };
    expect(initialRequestDate('2026-11-02', covered)).toBe('2027-01-01');
    expect(initialRequestDate('2027-01-04', covered)).toBe('2027-01-05');
    expect(initialRequestDate('2028-01-01', covered)).toBe('2027-12-31');
    expect(initialRequestDate('2027-01-04', calendar)).toBe('2027-01-05');
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
  // Planner commitments moved to the shared workspace rule (workspace.ts). Tentative
  // (requested) leave is now already-off and reserved, labelled separately, and a
  // completed request after the as-of date is charged like an approved one.
  it('reserves booked spans without recharging past, overlapping or out-of-range PTO', () => {
    const entries = [
      request('approved', '2027-01-03', '2027-01-06', 'approved'),
      request('overlap', '2027-01-05', '2027-01-07', 'approved'),
      request('completed', '2027-01-08', '2027-01-08', 'completed'),
      request('tentative', '2027-01-11', '2027-01-12', 'requested'),
      request('far', '2027-02-01', '2027-02-02', 'approved'),
    ];
    expect(planningCommitments(entries, { start: '2027-01-04', end: '2027-01-31' }, { asOf: '2027-01-04', includesApprovedLeave: false })).toEqual({
      unavailableDates: ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-11', '2027-01-12'],
      // Completed counts as booked, as in the forecast: 01-05..01-08 once each.
      approvedPtoDays: 4,
      tentativePtoDays: 2,
      reservedPtoDayEquivalent: 6,
      reservedPtoDays: 6,
      hasHourlyBookings: false,
    });
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

describe('atomic, recoverable request persistence', () => {
  function memory(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  }
  const KEY = 'gapless.personal.requests.v1';
  const hourlyCalendar: RequestCalendar = { workWeek: [true, true, true, true, true, false, false], offDays: [], shiftMinutes: [480, 480, 480, 480, 480, 0, 0] };
  const legacyShapes: Record<string, string> = {
    'v1 without revision (pre-P0)': JSON.stringify({ version: 1, requests: [request('one')] }),
    'v1 with a lock revision (P0)': JSON.stringify({ version: 1, requests: [request('one')], revision: '4f7c1b2e-0000-4000-8000-000000000000' }),
    'v1 with hourly entries': JSON.stringify({ version: 1, requests: [createPtoRequest({ start: '2027-01-04', end: '2027-01-04', partialMinutes: 240 }, hourlyCalendar, 'one', '2026-12-01T00:00:00.000Z')] }),
  };

  for (const [shape, raw] of Object.entries(legacyShapes)) {
    it(`migrates ${shape} without changing a request, keeping a recoverable copy of a pre-revision record`, () => {
      const storage = memory({ [KEY]: raw });
      const loaded = readRequestLedger(storage);
      expect(loaded.available).toBe(true);
      expect(loaded.recovery).toBeUndefined();
      expect(loaded.requests).toEqual(JSON.parse(raw).requests);
      expect(saveRequestLedger([...loaded.requests, request('two', '2027-02-01', '2027-02-02')], storage, loaded.revision).status).toBe('saved');
      const stored = JSON.parse(storage.getItem(KEY)!);
      expect(stored).toMatchObject({ version: 1 });
      expect(typeof stored.revision).toBe('string');
      expect(Number.isFinite(Date.parse(stored.updatedAt))).toBe(true);
      expect(readRequestLedger(storage).requests.map(r => r.id)).toEqual(['one', 'two']);
      const backup = storage.getItem(`${KEY}.backup`);
      if (JSON.parse(raw).revision) expect(backup).toBeNull();
      else expect(JSON.parse(backup!).raw).toBe(raw);
    });
  }

  it('detects a write based on a revision another tab has since replaced, and keeps the newer data', () => {
    const storage = memory();
    const tabA = readRequestLedger(storage);
    const tabB = readRequestLedger(storage);
    expect(saveRequestLedger([request('from-b')], storage, tabB.revision).status).toBe('saved');
    expect(saveRequestLedger([request('from-a')], storage, tabA.revision).status).toBe('stale');
    expect(readRequestLedger(storage).requests.map(r => r.id)).toEqual(['from-b']);
  });

  it('flags corrupt JSON instead of reading it as an empty tracker, and quarantines it before any replacement', () => {
    const storage = memory({ [KEY]: '{"version":1,"requests":[{"id":"one"' });
    const loaded = readRequestLedger(storage);
    expect(loaded).toMatchObject({ requests: [], available: true, recovery: 'unreadable' });
    expect(saveRequestLedger([request('new')], storage, loaded.revision)).toMatchObject({ status: 'saved', quarantined: true });
    expect(JSON.parse(storage.getItem(`${KEY}.quarantine`)!)[0].raw).toBe('{"version":1,"requests":[{"id":"one"');
  });

  it('flags and quarantines a ledger with entries it cannot read, so a write never silently drops them', () => {
    const raw = JSON.stringify({ version: 1, requests: [request('one'), { ...request('two'), status: 'employer-approved' }] });
    const storage = memory({ [KEY]: raw });
    const loaded = readRequestLedger(storage);
    expect(loaded).toMatchObject({ recovery: 'partial' });
    expect(loaded.requests.map(r => r.id)).toEqual(['one']);
    expect(writeRequestLedger(loaded.requests, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(`${KEY}.quarantine`)!)[0].raw).toBe(raw);
  });

  it('never overwrites a ledger written by a newer app version', () => {
    const raw = JSON.stringify({ version: 2, entries: [] });
    const storage = memory({ [KEY]: raw });
    expect(readRequestLedger(storage)).toMatchObject({ requests: [], recovery: 'newer-version' });
    expect(saveRequestLedger([request('one')], storage).status).toBe('newer-version');
    expect(writeRequestLedger([request('one')], storage)).toBe(false);
    expect(storage.getItem(KEY)).toBe(raw);
  });
});