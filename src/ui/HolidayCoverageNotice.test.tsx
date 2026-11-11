import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { HolidayCoverageNotice } from './HolidayCoverageNotice';
import { holidayCoverageMessage, yearsOutsideBundledHolidayData } from './holidayCoverage';

const lookup = vi.hoisted(() => ({ withStatus: vi.fn() }));
vi.mock('../personal/consumerHolidays', async (original) => ({
  ...await original<typeof import('../personal/consumerHolidays')>(),
  getConsumerHolidaysWithStatus: lookup.withStatus,
}));

beforeEach(() => lookup.withStatus.mockReset());
afterEach(cleanup);

describe('holidayCoverageMessage (issue 17)', () => {
  it('names the uncovered years and the assumption the results make', () => {
    expect(holidayCoverageMessage([])).toBeNull();
    expect(holidayCoverageMessage([2029])).toBe('Holiday data not available for 2029 — results assume no public holidays in 2029. Add your employer’s holidays in More options.');
    expect(holidayCoverageMessage([2029, 2030])).toBe('Holiday data not available for 2029 and 2030 — results assume no public holidays in those years. Add your employer’s holidays in More options.');
    expect(holidayCoverageMessage([2029, 2030, 2031])).toContain('2029, 2030 and 2031');
  });
});

describe('yearsOutsideBundledHolidayData', () => {
  it('lists plan years this build did not bundle (bundled: 2026-2028)', () => {
    expect(yearsOutsideBundledHolidayData('2027-01-01', '2028-12-31')).toEqual([]);
    expect(yearsOutsideBundledHolidayData('2028-12-01', '2029-01-31')).toEqual([2029]);
    expect(yearsOutsideBundledHolidayData('2029-06-01', '2030-05-31')).toEqual([2029, 2030]);
    expect(yearsOutsideBundledHolidayData('bad', '2030-05-31')).toEqual([]);
  });
});

describe('HolidayCoverageNotice', () => {
  it('makes no extra lookup and shows nothing when every plan year is bundled', () => {
    render(<HolidayCoverageNotice country="US" rangeStart="2027-01-01" rangeEnd="2027-12-31" />);
    expect(lookup.withStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('checks only the unbundled years, and says when 2029 has no data', async () => {
    lookup.withStatus.mockResolvedValue({ holidays: [], degraded: false, uncoveredYears: [2029] });
    render(<HolidayCoverageNotice country="US" rangeStart="2028-12-01" rangeEnd="2029-01-31" />);
    expect((await screen.findByRole('status')).textContent).toContain('Holiday data not available for 2029');
    expect(lookup.withStatus).toHaveBeenCalledExactlyOnceWith('US', '2029-01-01', '2029-01-31');
  });

  it('shows nothing when the live lookup did cover the later year', async () => {
    lookup.withStatus.mockResolvedValue({ holidays: [], degraded: false, uncoveredYears: [] });
    render(<HolidayCoverageNotice country="US" rangeStart="2029-01-01" rangeEnd="2029-12-31" />);
    await vi.waitFor(() => expect(lookup.withStatus).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('treats a failed lookup of unbundled years as uncovered', async () => {
    lookup.withStatus.mockResolvedValue({ holidays: [], degraded: true });
    render(<HolidayCoverageNotice country="US" rangeStart="2029-06-01" rangeEnd="2030-05-31" />);
    expect((await screen.findByRole('status')).textContent).toContain('2029 and 2030');
  });
});
