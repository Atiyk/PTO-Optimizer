import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import {
  createPtoRequest, createSavedBreakRequest, parseRequestLedger, REQUEST_STORAGE_KEY, writeRequestLedger, type RequestCalendar,
} from '../personal/requestLedger';
import { PtoTracker } from './PtoTracker';
import { useRequestLedger } from './useRequestLedger';
import { requestSubmitBy } from './returnVisit';
import { useWholeDayDraft } from './useWholeDayDraft';

const calendar: RequestCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [], rangeStart: '2027-01-01', rangeEnd: '2027-12-31' };
const saved = () => parseRequestLedger(window.localStorage.getItem(REQUEST_STORAGE_KEY));

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('a request keeps the notice period it was planned with (N-P1-2)', () => {
  it('stores it on breaks saved and tracked from the planner, and reads it back', () => {
    const fromPlan = createSavedBreakRequest({ start: '2027-03-15', end: '2027-03-19', ptoDates: ['2027-03-15', '2027-03-16'], noticePeriodDays: 30, noticeUnit: 'calendar' }, calendar, 'plan')!;
    const tracked = createPtoRequest({ start: '2027-04-05', end: '2027-04-06', status: 'planned', noticePeriodDays: 5, noticeUnit: 'working' }, calendar, 'tracked')!;
    writeRequestLedger([fromPlan, tracked]);
    expect(saved().map(({ id, noticePeriodDays, noticeUnit }) => ({ id, noticePeriodDays, noticeUnit }))).toEqual([
      { id: 'plan', noticePeriodDays: 30, noticeUnit: 'calendar' },
      { id: 'tracked', noticePeriodDays: 5, noticeUnit: 'working' },
    ]);
  });

  it('keeps old requests readable and drops only an invalid notice, never the request', () => {
    const base = { start: '2027-03-15', end: '2027-03-15', ptoDates: ['2027-03-15'], ptoDays: 1, status: 'planned', note: '', createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z' };
    const raw = JSON.stringify({ version: 1, requests: [
      { ...base, id: 'legacy' },
      { ...base, id: 'bad', start: '2027-03-16', end: '2027-03-16', ptoDates: ['2027-03-16'], noticePeriodDays: -3, noticeUnit: 'fortnights' },
      { ...base, id: 'unit-only', start: '2027-03-17', end: '2027-03-17', ptoDates: ['2027-03-17'], noticeUnit: 'working' },
    ] });
    const requests = parseRequestLedger(raw);
    expect(requests.map(request => request.id)).toEqual(['legacy', 'bad', 'unit-only']);
    for (const request of requests) {
      expect(request).not.toHaveProperty('noticePeriodDays');
      expect(request).not.toHaveProperty('noticeUnit');
    }
  });

  it('survives a date edit in My PTO', () => {
    writeRequestLedger([createPtoRequest({ start: '2027-03-15', end: '2027-03-16', status: 'planned', noticePeriodDays: 30 }, calendar, 'one', '2027-01-01T00:00:00.000Z')!]);
    const { result } = renderHook(() => useRequestLedger());
    act(() => { result.current.updateRequest('one', { end: '2027-03-17' }, calendar); });
    expect(saved()[0]).toMatchObject({ end: '2027-03-17', noticePeriodDays: 30 });
  });

  it('decides the submit-by date the same way for the tracker and the homepage', () => {
    const planned = createPtoRequest({ start: '2027-03-15', end: '2027-03-16', status: 'planned', noticePeriodDays: 30 }, calendar, 'p')!;
    const legacy = createPtoRequest({ start: '2027-03-15', end: '2027-03-16', status: 'planned' }, calendar, 'l')!;
    // 30 days before Monday Mar 15 is Saturday Feb 13, moved back to Friday Feb 12.
    expect(requestSubmitBy(planned, '2027-01-10', calendar)).toEqual({ date: '2027-02-12', noticePeriodDays: 30, noticeUnit: 'calendar' });
    expect(requestSubmitBy(legacy, '2027-01-10', calendar)).toEqual({ date: '2027-03-01', noticePeriodDays: 14, noticeUnit: 'calendar' });
    // A page-level setting (the planner) wins over what the request was saved with.
    expect(requestSubmitBy(planned, '2027-01-10', calendar, { noticePeriodDays: 7 })?.noticePeriodDays).toBe(7);
    for (const status of ['considering', 'requested', 'approved'] as const) {
      expect(requestSubmitBy({ ...planned, status }, '2027-01-10', calendar)).toBeNull();
    }
    expect(requestSubmitBy(planned, '2027-03-16', calendar)).toBeNull();
  });

  it('shows the stored notice period in the My PTO tracker on /policy', () => {
    writeRequestLedger([createPtoRequest({ start: '2027-03-15', end: '2027-03-16', status: 'planned', noticePeriodDays: 30 }, calendar, 'one')!]);
    function Harness() {
      const ledger = useRequestLedger();
      return <PtoTracker ledger={ledger} calendar={calendar} today="2027-01-10" />;
    }
    render(<Harness />);
    expect(screen.getByText('Submit by Feb 12, 2027')).toBeTruthy();
    expect(screen.getByText(/30-day notice/)).toBeTruthy();
    expect(screen.queryByText(/14-day notice/)).toBeNull();
  });
});

describe('useWholeDayDraft blank on blur', () => {
  it('refills the value in effect on blur by default', () => {
    const { result } = renderHook(() => useWholeDayDraft(15, () => {}));
    act(() => result.current.onChange(''));
    expect(result.current.empty).toBe(true);
    act(() => result.current.onBlur());
    expect(result.current.text).toBe('15');
    expect(result.current.empty).toBe(false);
  });

  it('keeps blank as blank on blur when asked (the homepage)', () => {
    const { result } = renderHook(() => useWholeDayDraft(15, () => {}, { keepBlankOnBlur: true }));
    act(() => result.current.onChange(''));
    act(() => result.current.onBlur());
    expect(result.current.text).toBe('');
    expect(result.current.empty).toBe(true);
  });

  it('a field wired to it stays blank through a real blur', () => {
    function Field() {
      const draft = useWholeDayDraft(15, () => {}, { keepBlankOnBlur: true });
      return <input aria-label="days" value={draft.text} onChange={e => draft.onChange(e.target.value)} onBlur={draft.onBlur} />;
    }
    render(<Field />);
    const input = screen.getByLabelText('days') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('');
  });
});
