import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rawHolidaysToHolidays, type Holiday } from '@daysoff/engine/data/holidays';
import {
  consumerHolidayLookupEnd, getConsumerHolidays, getConsumerHolidaysWithStatus, getConsumerSubdivisionCandidates, readPreloadedConsumerHolidays,
} from './consumerHolidays';

const provider = vi.hoisted(() => ({ withStatus: vi.fn(), holidays: vi.fn(), subdivisions: vi.fn() }));
vi.mock('@daysoff/engine/data/holidays', async (original) => ({
  ...await original<typeof import('@daysoff/engine/data/holidays')>(),
  getHolidaysWithStatus: provider.withStatus,
  getHolidays: provider.holidays,
  getSubdivisionCandidates: provider.subdivisions,
}));

const rawNewYear = (date: string, name = 'New Year’s Day') => ({
  date, localName: name, name, countryCode: 'US', fixed: true, global: true,
  counties: null, launchYear: null, types: ['Public'],
});

beforeEach(() => {
  provider.withStatus.mockReset().mockResolvedValue({ holidays: [], degraded: false });
  provider.holidays.mockReset().mockResolvedValue([]);
  provider.subdivisions.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  delete window.__PTO_PRELOADED_HOLIDAY_YEARS__;
  delete window.__PTO_PRELOADED_HOLIDAYS__;
});

describe('consumer nominal-year holiday lookup', () => {
  it.each(['US', 'GB', 'CA', 'AU', 'FM', 'MP', 'MX', 'PR', 'VI'])('looks up the nominal next year for a Saturday New Year observed on December 31: %s', (country) => {
    expect(consumerHolidayLookupEnd(country, '2027-12-01', '2027-12-31')).toBe('2028-01-01');
  });

  it('preserves all other lookup years, including ranges already crossing New Year', () => {
    expect(consumerHolidayLookupEnd('DE', '2027-12-01', '2027-12-30')).toBe('2027-12-30');
    expect(consumerHolidayLookupEnd('US', '2027-12-01', '2027-12-30')).toBe('2027-12-30');
    expect(consumerHolidayLookupEnd('US', '2026-12-01', '2026-12-31')).toBe('2026-12-31');
    expect(consumerHolidayLookupEnd('US', '2027-12-01', '2028-01-02')).toBe('2028-01-02');
    expect(consumerHolidayLookupEnd('US', '2026-01-01', '2026-01-31')).toBe('2026-01-31');
  });

  it('requires complete embedded nominal years and handles already-observed records outside the shift-normalized countries', async () => {
    const observed = rawHolidaysToHolidays([{ ...rawNewYear('2027-12-31'), countryCode: 'MX' }]);
    window.__PTO_PRELOADED_HOLIDAYS__ = { MX: observed };
    window.__PTO_PRELOADED_HOLIDAY_YEARS__ = { MX: [2027] };
    expect(readPreloadedConsumerHolidays('MX', '2027-12-27', '2027-12-31')).toBeUndefined();
    window.__PTO_PRELOADED_HOLIDAY_YEARS__.MX.push(2028);
    expect(readPreloadedConsumerHolidays('MX', '2027-12-27', '2027-12-31')).toEqual(observed);

    provider.withStatus.mockResolvedValue({ holidays: observed, degraded: false });
    await expect(getConsumerHolidaysWithStatus('MX', '2027-12-27', '2027-12-31')).resolves.toEqual({ holidays: observed, degraded: false });
    expect(provider.withStatus).toHaveBeenCalledExactlyOnceWith('MX', '2027-12-27', '2028-01-01', undefined);
  });

  it('returns the real normalized Dec 31 holiday from the nominal 2028 data and removes repeated copies', async () => {
    // Simulate the provider's year-based fetch using its real normalization function.
    // The 2027 response may already include an observed copy; the 2028 copy must not add a second day.
    provider.withStatus.mockImplementation(async (_country: string, start: string, end: string) => {
      const raw = [rawNewYear('2027-01-01'), rawNewYear('2027-12-31')];
      if (Number(end.slice(0, 4)) >= 2028) raw.push(rawNewYear('2028-01-01'), rawNewYear('2028-01-03', 'Outside requested range'));
      return { holidays: rawHolidaysToHolidays(raw).filter(({ date }) => date >= start && date <= end), degraded: false };
    });
    const result = await getConsumerHolidaysWithStatus('US', '2027-12-01', '2027-12-31');
    expect(provider.withStatus).toHaveBeenCalledExactlyOnceWith('US', '2027-12-01', '2028-01-01', undefined);
    expect(result.degraded).toBe(false);
    expect(result.holidays.map(({ date, name }) => ({ date, name }))).toEqual([{ date: '2027-12-31', name: 'New Year’s Day' }]);
  });

  it('includes the observed date when only the nominal 2028 response contains it', async () => {
    provider.withStatus.mockImplementation(async (_country: string, _start: string, end: string) => ({
      holidays: Number(end.slice(0, 4)) >= 2028 ? rawHolidaysToHolidays([rawNewYear('2028-01-01')]) : [], degraded: false,
    }));
    const result = await getConsumerHolidaysWithStatus('US', '2027-12-31', '2027-12-31');
    expect(result.holidays).toHaveLength(1);
    expect(result.holidays[0].date).toBe('2027-12-31');
    expect(result.holidays[0].nominalDate).toBe('2028-01-01');
  });

  it('mirrors the list API and preserves separate names on one date for employer exclusions', async () => {
    const observed = rawHolidaysToHolidays([rawNewYear('2028-01-01')])[0];
    provider.holidays.mockResolvedValue([observed, observed, { ...observed, name: 'Another holiday' }]);
    const holidays = await getConsumerHolidays('US', '2027-12-01', '2027-12-31', 'US-CA');
    expect(provider.holidays).toHaveBeenCalledExactlyOnceWith('US', '2027-12-01', '2028-01-01', 'US-CA');
    expect(holidays).toHaveLength(2);
    expect(new Set(holidays.map(({ date }) => date)).size).toBe(1);
  });

  it('merges duplicate regional coverage without dropping a selectable subdivision', async () => {
    const observed: Holiday = { ...rawHolidaysToHolidays([rawNewYear('2028-01-01')])[0], counties: ['US-CA'] };
    provider.subdivisions.mockResolvedValue([observed, { ...observed, counties: ['US-MA'] }, { ...observed, date: '2028-01-01' }]);
    const holidays = await getConsumerSubdivisionCandidates('US', '2027-12-01', '2027-12-31');
    expect(provider.subdivisions).toHaveBeenCalledExactlyOnceWith('US', '2027-12-01', '2028-01-01');
    expect(holidays).toHaveLength(1);
    expect(holidays[0].counties).toEqual(['US-CA', 'US-MA']);
  });

  it('retains the provider’s degraded status and does not add an unrelated prior year', async () => {
    provider.withStatus.mockResolvedValue({ holidays: [], degraded: true });
    expect(await getConsumerHolidaysWithStatus('US', '2026-01-01', '2026-12-31')).toEqual({ holidays: [], degraded: true });
    expect(provider.withStatus).toHaveBeenCalledExactlyOnceWith('US', '2026-01-01', '2026-12-31', undefined);
  });

  it('returns a degraded empty calendar when an unexpected provider rejection occurs', async () => {
    provider.withStatus.mockRejectedValue(new Error('Malformed cached holiday payload'));
    await expect(getConsumerHolidaysWithStatus('US', '2027-12-01', '2027-12-31'))
      .resolves.toEqual({ holidays: [], degraded: true });
    provider.withStatus.mockResolvedValue({ holidays: [null], degraded: false });
    await expect(getConsumerHolidaysWithStatus('US', '2027-12-01', '2027-12-31'))
      .resolves.toEqual({ holidays: [], degraded: true });
    provider.withStatus.mockResolvedValue({ holidays: 'invalid-list', degraded: false });
    await expect(getConsumerHolidaysWithStatus('US', '2027-12-01', '2027-12-31'))
      .resolves.toEqual({ holidays: [], degraded: true });
  });

  it('keeps list and subdivision consumers from receiving unexpected rejections or malformed records', async () => {
    provider.holidays.mockRejectedValue(new Error('Invalid static payload'));
    provider.subdivisions.mockRejectedValue(new Error('Invalid cached payload'));
    await expect(getConsumerHolidays('US', '2027-12-01', '2027-12-31')).resolves.toEqual([]);
    await expect(getConsumerSubdivisionCandidates('US', '2027-12-01', '2027-12-31')).resolves.toEqual([]);
    provider.holidays.mockResolvedValue([rawHolidaysToHolidays([rawNewYear('2028-01-01')])[0], { date: 'not-a-date' }]);
    provider.subdivisions.mockResolvedValue(null);
    await expect(getConsumerHolidays('US', '2027-12-01', '2027-12-31')).resolves.toEqual([]);
    await expect(getConsumerSubdivisionCandidates('US', '2027-12-01', '2027-12-31')).resolves.toEqual([]);
  });

  it.each([
    ['US', '2027-02-30', '2027-12-31'],
    ['US', '2027-01-01', '2037-01-02'],
    ['US', '2027-12-31', '2027-01-01'],
    ['invalid', '2027-01-01', '2027-12-31'],
  ])('bounds invalid lookup inputs without fetching: %s %s %s', async (country, start, end) => {
    expect(await getConsumerHolidaysWithStatus(country, start, end)).toEqual({ holidays: [], degraded: true });
    expect(await getConsumerHolidays(country, start, end)).toEqual([]);
    expect(await getConsumerSubdivisionCandidates(country, start, end)).toEqual([]);
    expect(provider.withStatus).not.toHaveBeenCalled();
    expect(provider.holidays).not.toHaveBeenCalled();
    expect(provider.subdivisions).not.toHaveBeenCalled();
  });
});
