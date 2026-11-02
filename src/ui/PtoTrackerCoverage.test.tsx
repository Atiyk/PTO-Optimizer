import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, parseRequestLedger, REQUEST_STORAGE_KEY, writeRequestLedger, type RequestCalendar } from '../personal/requestLedger';
import { PtoTracker } from './PtoTracker';
import { useRequestLedger } from './useRequestLedger';

const calendar: RequestCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: ['2027-01-01'], rangeStart: '2027-01-01', rangeEnd: '2027-01-31' };
const saved = () => parseRequestLedger(window.localStorage.getItem(REQUEST_STORAGE_KEY));
const addInputs = () => within(screen.getByText('Track another date range').closest('details')!);

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); });

function Harness({ coverage = calendar, ready = true }: { coverage?: RequestCalendar; ready?: boolean }) {
  const ledger = useRequestLedger();
  return <>
    <button onClick={() => ledger.addRequest({ start: '2027-01-30', end: '2027-02-01' }, coverage)}>Try unknown calendar dates</button>
    <button onClick={() => ledger.updateRequest('one', { end: '2027-02-01' }, coverage)}>Try unknown date edit</button>
    <PtoTracker ledger={ledger} calendar={coverage} calendarReady={ready} calendarNotice="Choose a later forecast date or open the optimizer to load other dates." today="2026-12-31" />
  </>;
}

function seed() {
  const entry = createPtoRequest({ start: '2027-01-01', end: '2027-01-05' }, calendar, 'one', '2026-12-01T12:00:00.000Z')!;
  writeRequestLedger([entry]);
}

describe('tracker employer calendar coverage', () => {
  it('bounds draft inputs, starts inside future coverage and explains how to extend it', () => {
    render(<Harness />);
    const start = addInputs().getByLabelText('Start date') as HTMLInputElement;
    const end = addInputs().getByLabelText('End date') as HTMLInputElement;
    expect(start.value).toBe('2027-01-01');
    expect(end.value).toBe('2027-01-01');
    expect(start.min).toBe('2027-01-01'); expect(start.max).toBe('2027-01-31');
    expect(end.min).toBe('2027-01-01'); expect(end.max).toBe('2027-01-31');
    expect(screen.getByText(/This calendar covers 2027-01-01 through 2027-01-31/)).toBeTruthy();
    expect(screen.getByText(/Choose a later forecast date or open the optimizer/)).toBeTruthy();
  });
  it('refuses out-of-coverage additions in both the UI and the ledger action', () => {
    render(<Harness />);
    fireEvent.change(addInputs().getByLabelText('End date'), { target: { value: '2027-02-01' } });
    expect((addInputs().getByRole('button', { name: 'Track these dates' }) as HTMLButtonElement).disabled).toBe(true);
    expect(addInputs().getByText(/These dates are outside the loaded employer calendar/)).toBeTruthy();
    fireEvent.click(screen.getByText('Try unknown calendar dates'));
    expect(saved()).toEqual([]);
    expect(screen.getByText(/outside the employer calendar loaded on this page/)).toBeTruthy();
  });
  it('keeps the saved cost when a date edit leaves coverage, then recalculates a valid edit', () => {
    seed(); render(<Harness />);
    const end = screen.getByLabelText('End date for request 2027-01-01') as HTMLInputElement;
    expect(end.min).toBe('2027-01-01'); expect(end.max).toBe('2027-01-31');
    fireEvent.change(end, { target: { value: '2027-02-01' } });
    expect(saved()[0]).toMatchObject({ end: '2027-01-05', ptoDays: 2, ptoDates: ['2027-01-04', '2027-01-05'] });
    expect(screen.getByText(/The saved PTO cost is retained/)).toBeTruthy();
    fireEvent.change(end, { target: { value: '2027-01-06' } });
    expect(saved()[0]).toMatchObject({ end: '2027-01-06', ptoDays: 3 });
  });
  it('rejects an out-of-coverage date edit at the ledger action boundary too', () => {
    seed(); render(<Harness />);
    fireEvent.click(screen.getByText('Try unknown date edit'));
    expect(saved()[0]).toMatchObject({ end: '2027-01-05', ptoDays: 2, ptoDates: ['2027-01-04', '2027-01-05'] });
    expect(screen.getByText(/The saved request and PTO cost have not changed/)).toBeTruthy();
  });
  it('pauses new dates while holidays load but allows status/note/deletion without repricing old requests', () => {
    seed();
    const changedCalendar: RequestCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: [], rangeStart: '2028-01-01', rangeEnd: '2028-12-31' };
    render(<Harness coverage={changedCalendar} ready={false} />);
    expect((addInputs().getByRole('button', { name: 'Track these dates' }) as HTMLButtonElement).disabled).toBe(true);
    expect((addInputs().getByLabelText('Start date') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Start date for request 2027-01-01') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Status for request 2027-01-01') as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Status for request 2027-01-01'), { target: { value: 'approved' } });
    fireEvent.change(screen.getByLabelText('Personal note for request 2027-01-01'), { target: { value: 'Corrected note' } });
    expect(saved()[0]).toMatchObject({ status: 'approved', note: 'Corrected note', ptoDays: 2, ptoDates: ['2027-01-04', '2027-01-05'] });
    expect(screen.getByText(/New requests and date edits are paused/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Delete request 2027-01-01'));
    expect(saved()).toEqual([]);
  });
  it('keeps historical costs when status changes under a different ready employer calendar', () => {
    seed();
    render(<Harness coverage={{ workWeek: DEFAULT_WORK_WEEK, offDays: [], rangeStart: '2028-01-01', rangeEnd: '2028-12-31' }} />);
    fireEvent.change(screen.getByLabelText('Status for request 2027-01-01'), { target: { value: 'completed' } });
    expect(saved()[0]).toMatchObject({ status: 'completed', ptoDays: 2, ptoDates: ['2027-01-04', '2027-01-05'] });
  });
});
