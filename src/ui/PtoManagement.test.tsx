import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { REQUEST_STORAGE_KEY, parseRequestLedger } from '../personal/requestLedger';
import { useRequestLedger } from './useRequestLedger';
import { QuickForecast } from './QuickForecast';
import { PtoTracker } from './PtoTracker';

const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: ['2027-01-01'] };
const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', currentBalance: 10, balanceAsOf: '2027-01-01', plannedDays: [],
};

afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks(); });

function Harness() {
  const ledger = useRequestLedger();
  const [date, setDate] = useState('2027-01-14');
  return <>
    <button onClick={() => ledger.addRequest({ start: '2027-01-01', end: '2027-01-05' }, calendar)}>Track recommended break</button>
    <QuickForecast policy={policy} requests={ledger.requests} forecastDate={date} onForecastDateChange={setDate} />
    <PtoTracker ledger={ledger} calendar={calendar} today="2026-12-31" />
  </>;
}

const forecastBalance = () => screen.getByText('Estimated available PTO on Jan 14, 2027').nextElementSibling?.textContent;

describe('personal tracker and forecast workflow', () => {
  it('tracks a break, updates manual status, and changes confirmed forecast exactly once', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Track recommended break'));
    expect(screen.getByText('2 PTO days')).toBeTruthy();
    expect(forecastBalance()).toBe('10 days');
    fireEvent.change(screen.getByLabelText('Status for request 2027-01-01'), { target: { value: 'approved' } });
    expect(forecastBalance()).toBe('8 days');
    fireEvent.change(screen.getByLabelText('Status for request 2027-01-01'), { target: { value: 'canceled' } });
    expect(forecastBalance()).toBe('10 days');
    expect(parseRequestLedger(window.localStorage.getItem(REQUEST_STORAGE_KEY))[0].status).toBe('canceled');
  });
  it('restores requests after remount and preserves private notes as escaped text', () => {
    const first = render(<Harness />);
    fireEvent.click(screen.getByText('Track recommended break'));
    const note = '<img src=x onerror=alert(1)>';
    fireEvent.change(screen.getByLabelText('Personal note for request 2027-01-01'), { target: { value: note } });
    first.unmount();
    render(<Harness />);
    expect((screen.getByLabelText('Personal note for request 2027-01-01') as HTMLTextAreaElement).value).toBe(note);
    expect(document.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByLabelText('Delete request 2027-01-01'));
    expect(parseRequestLedger(window.localStorage.getItem(REQUEST_STORAGE_KEY))).toEqual([]);
  });
  it('prevents duplicate exact-range entries and supports correcting request dates', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Track recommended break'));
    fireEvent.click(screen.getByText('Track recommended break'));
    expect(screen.getAllByLabelText('Status for request 2027-01-01')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('End date for request 2027-01-01'), { target: { value: '2027-01-06' } });
    expect(screen.getByText('3 PTO days')).toBeTruthy();
  });
  it('keeps request edits in memory and clearly reports storage failure', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
    render(<Harness />);
    fireEvent.click(screen.getByText('Track recommended break'));
    expect(screen.getByText('2 PTO days')).toBeTruthy();
    expect(screen.getByText(/Browser storage is unavailable\. Your tracker works/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Status for request 2027-01-01'), { target: { value: 'approved' } });
    expect(forecastBalance()).toBe('8 days');
  });
  it('syncs independent hooks in the same page through the shared ledger event', () => {
    function Writer() { const ledger = useRequestLedger(); return <button onClick={() => ledger.addRequest({ start: '2027-01-04', end: '2027-01-04' }, calendar)}>Track independently</button>; }
    function Reader() { const ledger = useRequestLedger(); return <p>Reader requests: {ledger.requests.length}</p>; }
    render(<><Writer /><Reader /></>);
    fireEvent.click(screen.getByText('Track independently'));
    expect(screen.getByText('Reader requests: 1')).toBeTruthy();
  });
  it('does not display a fictional finite balance for unlimited PTO', () => {
    const onUsed = vi.fn();
    const onChange = vi.fn();
    render(<QuickForecast policy={{ ...policy, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 } }} forecastDate="2027-02-01" onForecastDateChange={onChange} onForecastUsed={onUsed} />);
    expect(screen.getByText(/Unlimited PTO has no banked balance/)).toBeTruthy();
    expect(onUsed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Forecast my balance on'), { target: { value: '2027-03-01' } });
    expect(onChange).toHaveBeenCalledWith('2027-03-01');
    expect(onUsed).toHaveBeenCalledTimes(1);
  });
  it('renders the signed-out management workflow without browser APIs during prerender', () => {
    vi.stubGlobal('window', undefined);
    try {
      const html = renderToString(<Harness />);
      expect(html).toContain('PTO balance forecast');
      expect(html).toContain('My PTO requests');
      expect(html).toContain('Browser storage is unavailable');
    } finally { vi.unstubAllGlobals(); }
  });
});
