import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { EmployerCalendar } from './employerCalendar';
import { createPtoRequest, requestDatesForScenario } from './requestLedger';
import {
  buildOverlapShareURL,
  readFullStateFromURL,
  readOverlapPayloadFromURL,
  writeFullStateToURL,
  type WriteStateInput,
} from '../ui/urlState';

const recipientDefaults = {
  rangeStart: '2027-01-01',
  rangeEnd: '2027-12-31',
  budget: 11,
  country: 'US',
};

function shareableState(overrides: Partial<WriteStateInput> = {}): WriteStateInput {
  return {
    country: 'US',
    subdivision: undefined,
    rangeStart: '2027-01-01',
    rangeEnd: '2027-12-31',
    budget: 6,
    w: 30,
    breakCount: 0,
    weekStartOverride: 'auto',
    accrualEnabled: false,
    accrualPerMonth: 1.25,
    expiryEnabled: false,
    expiryDate: '2027-12-31',
    carryoverCap: 0,
    overlapDays: [],
    blackouts: [],
    workWeek: DEFAULT_WORK_WEEK,
    forced: {},
    altFridayEnabled: false,
    altFridayStart: '',
    reserveDays: 3,
    unlimitedPto: false,
    noticePeriodDays: 14,
    peakCapEnabled: false,
    peakCapStart: '',
    peakCapEnd: '',
    peakCapMaxDays: 5,
    ...overrides,
  };
}

describe('signed-out link privacy and backward compatibility regressions', () => {
  it('shares only date availability derived from a private approved request, never request metadata', () => {
    const privateNote = 'Private medical appointment - do not share';
    const privateId = 'private-request-identifier';
    const approved = createPtoRequest(
      { start: '2027-01-05', end: '2027-01-07', status: 'approved', note: privateNote },
      { workWeek: DEFAULT_WORK_WEEK, offDays: ['2027-01-06'] },
      privateId,
      '2026-11-07T16:00:00.000Z',
    );
    expect(approved).not.toBeNull();
    const dates = requestDatesForScenario(approved ? [approved] : [], '2027-01-01', '2027-01-31');
    expect(dates).toEqual(['2027-01-05', '2027-01-07']);

    const share = buildOverlapShareURL('https://gapless.example', '/pto', dates);
    const url = new URL(share);
    expect(url.origin + url.pathname).toBe('https://gapless.example/pto');
    expect([...url.searchParams.keys()]).toEqual(['ov']);
    expect(readOverlapPayloadFromURL(url.search)).toEqual(dates);
    expect(share).not.toContain(privateNote);
    expect(share).not.toContain(privateId);
    expect(share).not.toContain('approved');

    // The recipient's country, PTO budget and local overlap settings are not overwritten
    // by the sender's one-shot date payload.
    const received = readFullStateFromURL(url.search, recipientDefaults);
    expect(received.country).toBe('US');
    expect(received.budget).toBe(11);
    expect(received.overlapDays).toEqual([]);
    expect(received.employerCalendar).toBeUndefined();

    const reserialized = new URLSearchParams(url.search);
    writeFullStateToURL(reserialized, shareableState({ overlapDays: ['2027-02-02'] }));
    expect(reserialized.has('ov')).toBe(false);
    expect(reserialized.get('od')).toBe('2027-02-02');
  });

  it('keeps a shared employer holiday override in its own country/subdivision only', () => {
    const calendar: EmployerCalendar = {
      version: 1,
      country: 'US',
      subdivision: 'NY',
      excluded: ['2027-07-05|Independence Day'],
      custom: [{ date: '2027-12-24', name: 'Employer Winter Shutdown' }],
    };
    const params = new URLSearchParams();
    writeFullStateToURL(params, shareableState({
      country: 'US', subdivision: 'NY', employerCalendar: calendar,
    }));
    const sameScope = readFullStateFromURL('?' + params.toString(), recipientDefaults);
    expect(sameScope.employerCalendar).toEqual(calendar);

    const otherState = new URLSearchParams(params);
    otherState.set('c', 'DE');
    expect(readFullStateFromURL('?' + otherState.toString(), recipientDefaults).employerCalendar)
      .toBeUndefined();
    otherState.set('c', 'US');
    otherState.set('sd', 'CA');
    expect(readFullStateFromURL('?' + otherState.toString(), recipientDefaults).employerCalendar)
      .toBeUndefined();
    otherState.set('sd', 'NY');
    otherState.set('eh', '1.not-valid-json');
    expect(readFullStateFromURL('?' + otherState.toString(), recipientDefaults).employerCalendar)
      .toBeUndefined();
  });

  it('round-trips a legacy pinned/blackout plan without resurrecting obsolete or one-shot params', () => {
    const original = readFullStateFromURL(
      '?objective=one-long-trip&shape=long-breaks&s=2027-03-01&e=2027-04-30'
      + '&b=9&p=2027-03-05&r=2027-03-06&bo=2027-03-12&ww=1111010'
      + '&ov=2027-03-20',
      recipientDefaults,
    );
    expect([original.w, original.breakCount]).toEqual([20, 1]);
    expect(original.pinnedDays).toEqual(['2027-03-05']);
    expect(original.ruledOutDays).toEqual(['2027-03-06']);

    const params = new URLSearchParams('?objective=one-long-trip&shape=long-breaks&ov=2027-03-20');
    writeFullStateToURL(params, shareableState({
      rangeStart: original.rangeStart,
      rangeEnd: original.rangeEnd,
      budget: original.budget,
      w: original.w,
      breakCount: original.breakCount,
      workWeek: original.workWeek,
      blackouts: original.blackouts,
      forced: { '2027-03-05': 'include', '2027-03-06': 'exclude' },
    }));
    for (const obsolete of ['objective', 'shape', 'ov', 'minBreakLength']) {
      expect(params.has(obsolete)).toBe(false);
    }
    const restored = readFullStateFromURL('?' + params.toString(), recipientDefaults);
    expect(restored.rangeStart).toBe(original.rangeStart);
    expect(restored.rangeEnd).toBe(original.rangeEnd);
    expect(restored.budget).toBe(original.budget);
    expect([restored.w, restored.breakCount]).toEqual([original.w, original.breakCount]);
    expect(restored.workWeek).toEqual(original.workWeek);
    expect(restored.blackouts).toEqual(original.blackouts);
    expect(restored.pinnedDays).toEqual(original.pinnedDays);
    expect(restored.ruledOutDays).toEqual(original.ruledOutDays);
    expect(readOverlapPayloadFromURL('?' + params.toString())).toEqual([]);
  });
});
