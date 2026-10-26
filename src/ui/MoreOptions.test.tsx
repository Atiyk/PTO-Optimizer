import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MoreOptions, blockNextNDays } from './MoreOptions';
import { DEFAULT_WORK_WEEK } from '../solver/types';

describe('blockNextNDays (Phase 3: "Block the next N days" bulk helper)', () => {
  it('includes today itself as day 1, not day 0 - "the next 14 days" is 14 dates total', () => {
    const dates = blockNextNDays('2026-10-25', 14);
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe('2026-10-25');
    expect(dates[13]).toBe('2026-11-07');
  });

  it('a single day for n=1', () => {
    expect(blockNextNDays('2026-10-25', 1)).toEqual(['2026-10-25']);
  });

  it('crosses a month/year boundary correctly', () => {
    const dates = blockNextNDays('2026-12-28', 7);
    expect(dates).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });

  it('returns nothing for zero, negative, or non-finite n, rather than throwing', () => {
    expect(blockNextNDays('2026-10-25', 0)).toEqual([]);
    expect(blockNextNDays('2026-10-25', -5)).toEqual([]);
    expect(blockNextNDays('2026-10-25', NaN)).toEqual([]);
  });
});

describe('MoreOptions (Phase 3: consolidated "Days I can\'t take off")', () => {
  const baseProps = {
    weekStartOverride: 'auto' as const,
    onChangeWeekStartOverride: () => {},
    accrualEnabled: false,
    onToggleAccrual: () => {},
    accrualPerMonth: 1.25,
    onChangeAccrualPerMonth: () => {},
    expiryEnabled: false,
    onToggleExpiry: () => {},
    expiryDate: '',
    onChangeExpiryDate: () => {},
    carryoverCap: 0,
    onChangeCarryoverCap: () => {},
    noticePeriodDays: 14,
    onChangeNoticePeriodDays: () => {},
    peakCapEnabled: false,
    onTogglePeakCap: () => {},
    peakCapStart: '',
    onChangePeakCapStart: () => {},
    peakCapEnd: '',
    onChangePeakCapEnd: () => {},
    peakCapMaxDays: 5,
    onChangePeakCapMaxDays: () => {},
    overlapDays: [],
    onAddOverlapDay: () => {},
    onRemoveOverlapDay: () => {},
    workWeek: DEFAULT_WORK_WEEK,
    onChangeWorkWeek: () => {},
    altFridayEnabled: false,
    onToggleAltFriday: () => {},
    altFridayStart: '',
    onChangeAltFridayStart: () => {},
    blackouts: [],
    onAddBlackout: () => {},
    onAddBlackouts: () => {},
    onRemoveBlackout: () => {},
    holidayEntries: [],
    onRemoveHoliday: () => {},
    onToggleStateHoliday: () => {},
    onAddCustomHoliday: () => {},
  };

  it('replaces the old "Blackout dates" label with "Days I can\'t take off"', () => {
    const html = renderToStaticMarkup(<MoreOptions {...baseProps} />);
    expect(html).toContain("Days I can&#x27;t take off");
    expect(html).not.toContain('Blackout dates');
  });

  it('renders the "Block the next N days" bulk helper beside the picker', () => {
    const html = renderToStaticMarkup(<MoreOptions {...baseProps} />);
    expect(html).toContain('Block the next');
    expect(html).toContain('notice period');
  });

  it('renders the narrow 9/80 "every other Friday" option, not a general recurrence engine', () => {
    const html = renderToStaticMarkup(<MoreOptions {...baseProps} />);
    expect(html).toContain('Compressed schedule (9/80)');
    expect(html).toContain('Every other Friday off');
  });

  it('wires the .ics import into the same blackout bulk-add handler as "Block the next N days"', () => {
    const html = renderToStaticMarkup(<MoreOptions {...baseProps} />);
    expect(html).toContain('Import my calendar (.ics)');
    expect(html).toContain('Parsed in your browser. Nothing is uploaded.');
  });

  it('Phase 5.1: the peak season limit is off by default, with its date/max-days fields hidden until enabled', () => {
    const html = renderToStaticMarkup(<MoreOptions {...baseProps} />);
    expect(html).toContain('Peak season limit');
    expect(html).toContain('Off by default');
    expect(html).not.toContain('PTO days in that window');
  });

  it('Phase 5.1: shows the window/max-days fields once the peak season limit is enabled', () => {
    const html = renderToStaticMarkup(<MoreOptions {...baseProps} peakCapEnabled />);
    expect(html).toContain('PTO days in that window');
  });
});
