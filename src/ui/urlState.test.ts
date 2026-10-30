import { describe, it, expect } from 'vitest';
import {
  readSliderStateFromURL,
  writeSliderStateToURL,
  readFullStateFromURL,
  writeFullStateToURL,
  buildOverlapShareURL,
  readOverlapPayloadFromURL,
} from './urlState';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { WriteStateInput } from './urlState';

describe('readSliderStateFromURL', () => {
  it('reads explicit w and count params', () => {
    expect(readSliderStateFromURL('?w=70&count=3')).toEqual({ w: 70, breakCount: 3 });
  });

  it('defaults to w=30, count=0 with no params', () => {
    expect(readSliderStateFromURL('')).toEqual({ w: 30, breakCount: 0 });
  });

  it('migrates a legacy objective param to a sensible (w, count) pair instead of erroring', () => {
    expect(readSliderStateFromURL('?objective=most-days-off')).toEqual({ w: 0, breakCount: 0 });
    expect(readSliderStateFromURL('?objective=avoid-peak')).toEqual({ w: 90, breakCount: 0 });
    expect(readSliderStateFromURL('?objective=single-days')).toEqual({ w: 30, breakCount: 7 });
  });

  it('migrates an unrecognised legacy objective value without throwing, falling back to defaults', () => {
    expect(() => readSliderStateFromURL('?objective=some-removed-mode-nobody-remembers')).not.toThrow();
    expect(readSliderStateFromURL('?objective=some-removed-mode-nobody-remembers')).toEqual({ w: 30, breakCount: 0 });
  });

  it('clamps out-of-range or non-multiple-of-10 w to the nearest valid step', () => {
    expect(readSliderStateFromURL('?w=73')).toEqual({ w: 70, breakCount: 0 });
    expect(readSliderStateFromURL('?w=150')).toEqual({ w: 100, breakCount: 0 });
    expect(readSliderStateFromURL('?w=-20')).toEqual({ w: 0, breakCount: 0 });
  });

  it('clamps out-of-range count to 0-7', () => {
    expect(readSliderStateFromURL('?count=99')).toEqual({ w: 30, breakCount: 7 });
    expect(readSliderStateFromURL('?count=-5')).toEqual({ w: 30, breakCount: 0 });
  });
});

describe('writeSliderStateToURL', () => {
  it('writes w and count, and strips every legacy param', () => {
    const params = new URLSearchParams('?objective=most-days-off&shape=single-days&minBreakLength=3&other=keep');
    writeSliderStateToURL(params, { w: 50, breakCount: 2 });
    expect(params.get('w')).toBe('50');
    expect(params.get('count')).toBe('2');
    expect(params.has('objective')).toBe(false);
    expect(params.has('shape')).toBe(false);
    expect(params.has('minBreakLength')).toBe(false);
    expect(params.get('other')).toBe('keep');
  });
});

const defaults = { rangeStart: '2026-01-01', rangeEnd: '2026-12-31', budget: 15, country: 'US' };

function fullState(overrides: Partial<WriteStateInput> = {}): WriteStateInput {
  return {
    country: 'US',
    subdivision: undefined,
    rangeStart: '2026-03-01',
    rangeEnd: '2026-06-30',
    budget: 20,
    w: 40,
    breakCount: 2,
    weekStartOverride: 'auto',
    accrualEnabled: false,
    accrualPerMonth: 1.25,
    expiryEnabled: false,
    expiryDate: '2026-12-31',
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

describe('full state URL round-trip (Phase 1A: shareable URL)', () => {
  it('round-trips every field at once - country, dates, budget, weighting, break count, pinned/ruled-out, accrual, expiry, carryover, blackouts, overlap, work week', () => {
    const state = fullState({
      country: 'DE',
      subdivision: undefined,
      rangeStart: '2026-04-01',
      rangeEnd: '2026-10-31',
      budget: 25,
      w: 70,
      breakCount: 3,
      weekStartOverride: 1,
      accrualEnabled: true,
      accrualPerMonth: 2,
      expiryEnabled: true,
      expiryDate: '2026-09-30',
      carryoverCap: 5,
      overlapDays: ['2026-05-01', '2026-05-02'],
      blackouts: ['2026-06-15'],
      workWeek: [true, true, true, true, false, false, true],
      forced: { '2026-04-10': 'include', '2026-04-11': 'exclude' },
    });
    const params = new URLSearchParams();
    writeFullStateToURL(params, state);

    const read = readFullStateFromURL(`?${params.toString()}`, defaults);
    expect(read.country).toBe('DE');
    expect(read.rangeStart).toBe('2026-04-01');
    expect(read.rangeEnd).toBe('2026-10-31');
    expect(read.budget).toBe(25);
    expect(read.w).toBe(70);
    expect(read.breakCount).toBe(3);
    expect(read.weekStartOverride).toBe(1);
    expect(read.accrualEnabled).toBe(true);
    expect(read.accrualPerMonth).toBe(2);
    expect(read.expiryEnabled).toBe(true);
    expect(read.expiryDate).toBe('2026-09-30');
    expect(read.carryoverCap).toBe(5);
    expect(read.overlapDays).toEqual(['2026-05-01', '2026-05-02']);
    expect(read.blackouts).toEqual(['2026-06-15']);
    expect(read.workWeek).toEqual([true, true, true, true, false, false, true]);
    expect(read.pinnedDays).toEqual(['2026-04-10']);
    expect(read.ruledOutDays).toEqual(['2026-04-11']);
  });

  it('always writes country and rangeStart/rangeEnd even when they equal the current viewer defaults, so a link opened later or by someone else does not silently re-anchor', () => {
    const state = fullState({ country: defaults.country, rangeStart: defaults.rangeStart, rangeEnd: defaults.rangeEnd });
    const params = new URLSearchParams();
    writeFullStateToURL(params, state);
    expect(params.get('c')).toBe(defaults.country);
    expect(params.get('s')).toBe(defaults.rangeStart);
    expect(params.get('e')).toBe(defaults.rangeEnd);
  });

  it('omits subdivision, accrual, expiry, overlap, blackouts, pinned/ruled-out, and a default work week when not set, keeping the URL short', () => {
    const params = new URLSearchParams();
    writeFullStateToURL(params, fullState());
    expect(params.has('sd')).toBe(false);
    expect(params.has('ac')).toBe(false);
    expect(params.has('am')).toBe(false);
    expect(params.has('ex')).toBe(false);
    expect(params.has('xd')).toBe(false);
    expect(params.has('cc')).toBe(false);
    expect(params.has('od')).toBe(false);
    expect(params.has('bo')).toBe(false);
    expect(params.has('ww')).toBe(false);
    expect(params.has('p')).toBe(false);
    expect(params.has('r')).toBe(false);
  });

  it('malformed or garbage params fall back to defaults instead of crashing', () => {
    expect(() => readFullStateFromURL('?s=not-a-date&e=2026-13-45&b=nope&ww=garbage&od=xx,2026-01-01,yy', defaults)).not.toThrow();
    const read = readFullStateFromURL('?s=not-a-date&e=2026-13-45&b=nope&ww=garbage&od=xx,2026-01-01,yy', defaults);
    expect(read.rangeStart).toBe(defaults.rangeStart);
    expect(read.rangeEnd).toBe(defaults.rangeEnd);
    expect(read.budget).toBe(defaults.budget);
    expect(read.workWeek).toEqual(DEFAULT_WORK_WEEK);
    expect(read.overlapDays).toEqual(['2026-01-01']); // only the valid date survives
  });

  it('a rangeEnd before rangeStart in the URL falls back rather than producing an inverted range', () => {
    const read = readFullStateFromURL('?s=2026-06-01&e=2026-01-01', defaults);
    expect(read.rangeEnd >= read.rangeStart).toBe(true);
  });

  it('missing params fall back to the given defaults field-by-field', () => {
    const read = readFullStateFromURL('', defaults);
    expect(read.rangeStart).toBe(defaults.rangeStart);
    expect(read.rangeEnd).toBe(defaults.rangeEnd);
    expect(read.budget).toBe(defaults.budget);
    expect(read.country).toBe(defaults.country);
    expect(read.accrualEnabled).toBe(false);
    expect(read.expiryEnabled).toBe(false);
    expect(read.overlapDays).toEqual([]);
    expect(read.blackouts).toEqual([]);
    expect(read.pinnedDays).toEqual([]);
    expect(read.ruledOutDays).toEqual([]);
  });
});

describe('notice period in URL (Phase 4.1: "notice period encoded in the URL")', () => {
  it('round-trips a non-default notice period', () => {
    const params = new URLSearchParams();
    writeFullStateToURL(params, fullState({ noticePeriodDays: 21 }));
    expect(params.get('np')).toBe('21');
    const read = readFullStateFromURL(`?${params.toString()}`, defaults);
    expect(read.noticePeriodDays).toBe(21);
  });

  it('omits np from the URL when it equals the default (14 days), keeping the URL short', () => {
    const params = new URLSearchParams();
    writeFullStateToURL(params, fullState({ noticePeriodDays: 14 }));
    expect(params.has('np')).toBe(false);
  });

  it('falls back to 14 when np is missing or garbage, rather than crashing', () => {
    expect(readFullStateFromURL('', defaults).noticePeriodDays).toBe(14);
    expect(readFullStateFromURL('?np=garbage', defaults).noticePeriodDays).toBe(14);
    expect(readFullStateFromURL('?np=-5', defaults).noticePeriodDays).toBe(14);
  });
});

describe('partner overlap link (Phase 1D)', () => {
  it('builds a minimal, standalone URL carrying only the day list, no other state', () => {
    const url = buildOverlapShareURL('https://pto.example', '/', ['2026-10-24', '2026-10-25']);
    expect(url).toBe('https://pto.example/?ov=2026-10-24%2C2026-10-25');
  });

  it('reads the payload back out', () => {
    expect(readOverlapPayloadFromURL('?ov=2026-10-24,2026-10-25')).toEqual(['2026-10-24', '2026-10-25']);
  });

  it('drops malformed dates from the payload rather than throwing', () => {
    expect(() => readOverlapPayloadFromURL('?ov=garbage,2026-10-24,2026-13-99')).not.toThrow();
    expect(readOverlapPayloadFromURL('?ov=garbage,2026-10-24,2026-13-99')).toEqual(['2026-10-24']);
  });

  it('returns an empty list when there is no payload', () => {
    expect(readOverlapPayloadFromURL('')).toEqual([]);
  });

  it('writeFullStateToURL always strips a stale ov param, since it is a one-shot input, never ongoing state', () => {
    const params = new URLSearchParams('?ov=2026-10-24,2026-10-25');
    writeFullStateToURL(params, fullState());
    expect(params.has('ov')).toBe(false);
  });
});
