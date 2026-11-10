import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, type PtoRequest } from '../personal/requestLedger';
import { defaultEmployerCalendar, encodeEmployerCalendar, saveEmployerCalendar } from '../personal/employerCalendar';
import { defaultRangeEnd, discoverSubdivisions, useAppState } from './useAppState';
import type { Holiday } from '@daysoff/engine/data/holidays';

describe('defaultRangeEnd (Phase 2, bug found: always stuck to the current year)', () => {
  // Nothing in the solver/holiday-fetch/date-arithmetic layer actually blocks a
  // multi-year range (confirmed directly against a real Apr 2027 - Mar 2028 solve) - the
  // tool only ever APPEARED bounded to the current year because this default never rolled
  // forward, even when almost no useful planning window was left in it.

  it('stays at this year\'s Dec 31 when plenty of the year remains', () => {
    expect(defaultRangeEnd('2026-10-25')).toBe('2026-12-31'); // ~67 days left
    expect(defaultRangeEnd('2026-01-01')).toBe('2026-12-31');
    expect(defaultRangeEnd('2026-06-15')).toBe('2026-12-31');
  });

  it('still returns this year\'s Dec 31 right at the rollover threshold', () => {
    // 22 days remain (Dec 9 -> Dec 31 inclusive of neither endpoint as "today"): still
    // "more than a few weeks", per spec.
    expect(defaultRangeEnd('2026-12-09')).toBe('2026-12-31');
  });

  it('rolls forward to next year\'s Dec 31 once only a few weeks remain', () => {
    expect(defaultRangeEnd('2026-12-20')).toBe('2027-12-31'); // 11 days left
    expect(defaultRangeEnd('2026-12-31')).toBe('2027-12-31'); // 0 days left (today is the 31st itself)
  });

  it('rolls forward correctly across a leap year boundary', () => {
    expect(defaultRangeEnd('2027-12-20')).toBe('2028-12-31');
  });
});

function makeHoliday(overrides: Partial<Holiday> = {}): Holiday {
  return { date: '2027-01-01', nominalDate: '2027-01-01', name: 'Test holiday', countryCode: 'DE', counties: null, ...overrides };
}

describe('discoverSubdivisions (Phase 2: subdivisions via the counties field, any country)', () => {
  it('collects unique subdivision codes from holidays that carry them', () => {
    const holidays = [
      makeHoliday({ counties: ['DE-BW', 'DE-BY'] }),
      makeHoliday({ counties: ['DE-BE'] }),
      makeHoliday({ counties: null }), // national holiday - no counties
    ];
    expect(discoverSubdivisions(holidays)).toEqual(['DE-BE', 'DE-BW', 'DE-BY']);
  });

  it('deduplicates a code that appears on multiple holidays', () => {
    const holidays = [makeHoliday({ counties: ['DE-BY'] }), makeHoliday({ counties: ['DE-BY', 'DE-BW'] })];
    expect(discoverSubdivisions(holidays)).toEqual(['DE-BW', 'DE-BY']);
  });

  it('returns an empty list when nothing has subdivision data - the "no subdivisions" case, not a crash', () => {
    expect(discoverSubdivisions([makeHoliday({ counties: null })])).toEqual([]);
    expect(discoverSubdivisions([])).toEqual([]);
  });

  it('is not tied to any particular country - works for any code shape', () => {
    const holidays = [makeHoliday({ countryCode: 'JP', counties: ['JP-13'] })];
    expect(discoverSubdivisions(holidays)).toEqual(['JP-13']);
  });
});

describe('private approved requests in the consumer planner', () => {
  it('updates recommendations on approval and deducts bookings only from a gross budget', () => {
    window.history.replaceState(null, '', '/pto?c=US&s=2027-01-04&e=2027-01-17&b=6&rv=0');
    const approved = createPtoRequest({
      start: '2027-01-07', end: '2027-01-08', status: 'approved', note: 'private request note',
    }, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'booking')!;
    const planned: PtoRequest = { ...approved, status: 'planned' };
    const view = renderHook(
      ({ requests }: { requests: readonly PtoRequest[] }) => useAppState(requests, '2027-01-04'),
      { initialProps: { requests: [planned] } },
    );
    try {
      expect(view.result.current.solveInput.blackouts).toEqual([]);
      view.rerender({ requests: [approved] });
      expect(view.result.current.solveInput.blackouts).toEqual(['2027-01-07', '2027-01-08']);
      expect(view.result.current.effectiveBudget).toBe(6);
      expect(view.result.current.breaks.flatMap(brk => brk.days)).not.toContain('2027-01-07');
      act(() => view.result.current.setReserveApprovedPto(true));
      expect(view.result.current.effectiveBudget).toBe(4);
      expect(view.result.current.planSearch).not.toContain('2027-01-07');
      expect(window.location.search).not.toContain('2027-01-07');
      expect(view.result.current.planSearch).not.toContain('private');
    } finally {
      view.unmount();
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('planner address privacy and shared calendars', () => {
  it('hydrates a legacy private calendar, cleans the URL and restores the same-tab draft', () => {
    const employerCalendar = { ...defaultEmployerCalendar('US'), custom: [{ date: '2027-01-08', name: 'Private employer day' }] };
    const search = new URLSearchParams({
      c: 'US', s: '2027-01-04', e: '2027-01-17', b: '6', bo: '2027-01-11',
      eh: encodeEmployerCalendar(employerCalendar),
    });
    window.history.replaceState(null, '', `/pto?${search}`);
    const first = renderHook(() => useAppState());
    try {
      expect(first.result.current.holidayNameFor('2027-01-08')).toBe('Private employer day');
      const clean = new URLSearchParams(window.location.search);
      expect(clean.has('eh')).toBe(false);
      expect(clean.has('bo')).toBe(false);
      first.unmount();
      const replay = renderHook(() => useAppState());
      try {
        expect(replay.result.current.holidayNameFor('2027-01-08')).toBe('Private employer day');
        expect(replay.result.current.solveInput.blackouts).toContain('2027-01-11');
      } finally { replay.unmount(); }
    } finally {
      first.unmount();
      window.history.replaceState(null, '', '/');
    }
  });

  it('opens a date-only snapshot without applying private employer and approval data', () => {
    saveEmployerCalendar({ ...defaultEmployerCalendar('US'), custom: [{ date: '2027-01-08', name: 'Private employer day' }] });
    const request = createPtoRequest({
      start: '2027-01-07', end: '2027-01-07', status: 'approved',
    }, { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'private')!;
    window.history.replaceState(null, '', '/pto?c=US&s=2027-01-04&e=2027-01-17&b=6&sv=1&ho=2027-01-12');
    const view = renderHook(() => useAppState([request], '2027-01-04'));
    try {
      expect(view.result.current.holidaysReady).toBe(true);
      expect(view.result.current.holidayNameFor('2027-01-12')).toBe('Shared observed holiday');
      expect(view.result.current.holidayNameFor('2027-01-08')).toBeUndefined();
      expect(view.result.current.solveInput.blackouts).not.toContain('2027-01-07');
      act(() => view.result.current.setApplyTrackedRequests(true));
      expect(view.result.current.solveInput.blackouts).toContain('2027-01-07');
      expect(window.location.search).not.toContain('2027-01-07');
      act(() => view.result.current.restoreMyEmployerCalendar());
      expect(view.result.current.holidayNameFor('2027-01-08')).toBe('Private employer day');
    } finally {
      view.unmount();
      window.localStorage.clear();
      window.history.replaceState(null, '', '/');
    }
  });

  it('keeps unsaved employer edits made after opening a public link in the same history entry', () => {
    const incoming = { ...defaultEmployerCalendar('US'), custom: [{ date: '2027-01-08', name: 'Injected employer day' }] };
    const search = new URLSearchParams({ c: 'US', s: '2027-01-04', e: '2027-01-17', b: '6', sv: '1', eh: encodeEmployerCalendar(incoming) });
    window.history.replaceState(null, '', `/pto?${search}`);
    const first = renderHook(() => useAppState());
    try {
      expect(first.result.current.holidayNameFor('2027-01-08')).toBeUndefined();
      act(() => first.result.current.addCustomHoliday('2027-01-08', 'My same-tab edit'));
      expect(first.result.current.holidayNameFor('2027-01-08')).toBe('My same-tab edit');
      expect(window.location.search).not.toContain('eh=');
      first.unmount();
      const refreshed = renderHook(() => useAppState());
      try {
        expect(refreshed.result.current.holidayNameFor('2027-01-08')).toBe('My same-tab edit');
      } finally { refreshed.unmount(); }
    } finally {
      first.unmount();
      window.history.replaceState(null, '', '/');
    }
  });
});
