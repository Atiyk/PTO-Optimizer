import { describe, expect, it } from 'vitest';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { decodePartnerAvailability, type PartnerAvailability } from '../planning/partner';
import { MAX_SCHOOL_CALENDAR_DAYS } from '../personal/schoolCalendar';
import {
  buildFamilyShareURL, decodeDateRanges, DEFAULT_FAMILY_PTO, encodeDateRanges,
  MAX_FAMILY_DATES_PARAM, readFamilyStateFromURL, writeFamilyStateToURL,
} from './familyUrlState';

const WINTER = rangeISO('2026-12-21', '2027-01-01');

describe('encodeDateRanges / decodeDateRanges', () => {
  it('matches the contract example', () => {
    expect(encodeDateRanges([...WINTER, '2027-01-10', '2027-01-11'])).toBe('20261221.c,9.2');
    expect(decodeDateRanges('20261221.c,9.2')).toEqual([...WINTER, '2027-01-10', '2027-01-11']);
  });

  it('sorts, dedupes, drops invalid dates and round-trips', () => {
    const dates = ['2027-03-29', '2026-11-26', '2026-11-27', '2026-11-26', 'nope', '2026-02-30', '2027-03-30'];
    const encoded = encodeDateRanges(dates);
    expect(encoded).toBe('20261126.2,3e.2');
    expect(decodeDateRanges(encoded)).toEqual(['2026-11-26', '2026-11-27', '2027-03-29', '2027-03-30']);
    expect(encodeDateRanges([])).toBe('');
    expect(decodeDateRanges('')).toEqual([]);
  });

  it('round-trips a realistic school year and stays compact', () => {
    const year = [
      '2026-09-07', '2026-09-21', '2026-10-12', '2026-11-03', '2026-11-11', '2026-11-26', '2026-11-27',
      ...WINTER, '2027-01-18', ...rangeISO('2027-02-15', '2027-02-19'), ...rangeISO('2027-03-29', '2027-04-02'), '2027-05-31',
    ];
    const encoded = encodeDateRanges(year);
    expect(encoded.length).toBeLessThan(80);
    expect(decodeDateRanges(encoded)).toEqual(year);
  });

  it('crosses leap days and year ends exactly', () => {
    const dates = ['2028-02-28', '2028-02-29', '2028-03-01', '2028-12-31', '2029-01-01'];
    expect(decodeDateRanges(encodeDateRanges(dates))).toEqual(dates);
  });

  it('rejects malformed or oversized input', () => {
    for (const raw of [
      '20261221', '20261221.', '2026122.c', '20261321.1', '20260230.1', '20261221.0', '20261221.c,0.1',
      '20261221.c,,1.1', '20261221.c,9', '20261221.C', '20261221.c,9.2,', 'x', '20261221.zzzzz', ' 20261221.1',
      '99991231.2', '20261221.1,-1.1',
    ]) expect(decodeDateRanges(raw), raw).toBeNull();
    expect(decodeDateRanges('20260101.1' + ',2.1'.repeat(400))).toBeNull(); // > 1500 chars
    expect(decodeDateRanges(`20000101.${(MAX_SCHOOL_CALENDAR_DAYS + 1).toString(36)}`)).toBeNull();
    expect(decodeDateRanges(`20000101.${MAX_SCHOOL_CALENDAR_DAYS.toString(36)}`)).toHaveLength(MAX_SCHOOL_CALENDAR_DAYS);
    expect(decodeDateRanges(`20000101.zz,2.zz,2.zz,2.zz`)).toBeNull();
  });
});

describe('readFamilyStateFromURL', () => {
  it('returns defaults for an empty query', () => {
    expect(readFamilyStateFromURL('')).toEqual({ ptoBudget: DEFAULT_FAMILY_PTO, customOffDays: [], excludedBreaks: [], ask: false, invalid: [] });
  });

  it('reads every param', () => {
    const state = readFamilyStateFromURL('?c=US&s=2026-08-17&pto=15&d=nyc-doe-2026-27&sd=20261221.c&x=20261219.1&ask=1&pp=1:p:20261221~20261223:-');
    expect(state).toEqual({
      country: 'US', start: '2026-08-17', ptoBudget: 15, districtId: 'nyc-doe-2026-27',
      customOffDays: WINTER, excludedBreaks: ['2026-12-19'], ask: true, invalid: [],
      availability: { days: ['2026-12-21', '2026-12-22', '2026-12-23'], freeDays: null, status: 'proposed' },
    });
  });

  it('clamps pto into 0..60 and rounds', () => {
    expect(readFamilyStateFromURL('?pto=999').ptoBudget).toBe(60);
    expect(readFamilyStateFromURL('?pto=-4').ptoBudget).toBe(0);
    expect(readFamilyStateFromURL('?pto=7.6').ptoBudget).toBe(8);
  });

  it('flags bad params in invalid instead of throwing, keeping the rest', () => {
    const state = readFamilyStateFromURL('?c=United%20States&s=2026-02-30&pto=abc&d=../etc&sd=garbage&x=20261219&ask=yes&pp=1:z:bad:-&d2=ignored');
    expect(state.invalid).toEqual(['c', 's', 'pto', 'd', 'sd', 'x', 'pp', 'ask']);
    expect(state).toMatchObject({ ptoBudget: DEFAULT_FAMILY_PTO, customOffDays: [], excludedBreaks: [], ask: false });
    expect(state.country).toBeUndefined();
    expect(state.start).toBeUndefined();
    expect(state.districtId).toBeUndefined();
    expect(state.availability).toBeUndefined();
    expect(readFamilyStateFromURL('?pto=').invalid).toEqual(['pto']);
  });

  it('refuses pathological query strings outright', () => {
    expect(readFamilyStateFromURL(`?sd=${'1'.repeat(60_000)}`).invalid).toEqual(['search']);
    expect(readFamilyStateFromURL(`?sd=20260101.1${',2.1'.repeat(400)}`).invalid).toEqual(['sd']);
  });
});

describe('writeFamilyStateToURL', () => {
  const base = { ptoBudget: DEFAULT_FAMILY_PTO, customOffDays: [], excludedBreaks: [] };

  it('writes nothing for defaults and removes stale params', () => {
    const params = new URLSearchParams('pto=20&sd=20261221.c&x=20261219.1&ask=1&pp=1:p:20261221:-&s=2026-11-04&d=old');
    writeFamilyStateToURL(params, { ...base, start: '2026-11-04', defaultStart: '2026-11-04' });
    expect(params.toString()).toBe('');
  });

  it('round-trips through readFamilyStateFromURL', () => {
    const availability: PartnerAvailability = { days: ['2026-12-28', '2026-12-29'], freeDays: ['2026-12-28'], status: 'confirmed' };
    const params = new URLSearchParams('utm=keep');
    const skipped = writeFamilyStateToURL(params, {
      country: 'GB', start: '2026-09-01', defaultStart: '2026-11-04', ptoBudget: 25, districtId: 'nyc-doe-2026-27',
      customOffDays: WINTER, excludedBreaks: ['2027-02-13', '2026-12-19'], availability, ask: true,
    });
    expect(skipped).toEqual([]);
    expect(params.get('utm')).toBe('keep');
    expect(readFamilyStateFromURL(params.toString())).toEqual({
      country: 'GB', start: '2026-09-01', ptoBudget: 25, districtId: 'nyc-doe-2026-27',
      customOffDays: WINTER, excludedBreaks: ['2026-12-19', '2027-02-13'], availability, ask: true, invalid: [],
    });
  });

  it('clamps pto on write and reports params too large for a link', () => {
    const params = new URLSearchParams();
    const everyOtherDay = rangeISO('2020-01-01', '2030-01-01').filter((_, i) => i % 2 === 0).slice(0, 1200);
    const skipped = writeFamilyStateToURL(params, { ...base, ptoBudget: 500, customOffDays: everyOtherDay });
    expect(params.get('pto')).toBe('60');
    expect(skipped).toEqual(['sd']);
    expect(params.has('sd')).toBe(false);
    expect(encodeDateRanges(everyOtherDay).length).toBeGreaterThan(MAX_FAMILY_DATES_PARAM);
  });
});

describe('buildFamilyShareURL', () => {
  it('shares only school dates, country and availability, reusing the partner encoding', () => {
    const availability: PartnerAvailability = { days: ['2026-12-28', '2026-12-29', '2026-12-30'], freeDays: null, status: 'proposed' };
    const url = buildFamilyShareURL('https://example.com', { districtId: 'nyc-doe-2026-27', customOffDays: ['2027-01-18'], country: 'US', availability });
    expect(url.startsWith('https://example.com/family?')).toBe(true);
    const params = new URL(url).searchParams;
    expect([...params.keys()].sort()).toEqual(['c', 'd', 'pp', 'sd']);
    expect(params.get('pp')).toBe('1:p:20261228~20261230:-');
    expect(decodePartnerAvailability(params.get('pp')!)).toEqual(availability);
    const read = readFamilyStateFromURL(new URL(url).search);
    expect(read).toMatchObject({ districtId: 'nyc-doe-2026-27', customOffDays: ['2027-01-18'], country: 'US', availability, invalid: [] });
  });

  it('builds a plain ask link and omits empty parts', () => {
    expect(buildFamilyShareURL('https://example.com', { customOffDays: [], ask: true })).toBe('https://example.com/family?ask=1');
    expect(buildFamilyShareURL('https://example.com', { customOffDays: [] })).toBe('https://example.com/family');
    expect(buildFamilyShareURL('https://example.com', { customOffDays: [], availability: { days: [], freeDays: null, status: 'proposed' } }))
      .toBe('https://example.com/family');
  });
});
