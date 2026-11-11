import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TimeOffPolicy } from '../policy/model';
import { forecastPresets } from './forecastPresets';
import { QuickForecast } from './QuickForecast';
import { createPtoRequest } from '../personal/requestLedger';

const policy: TimeOffPolicy = {
  unit: 'days',
  hoursPerDay: 8,
  accrual: { kind: 'front-loaded', amount: 0, grantDate: '2026-01-01' },
  planYear: { kind: 'calendar' },
  carryover: { mode: 'all' },
  negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure',
  currentBalance: 12,
  balanceAsOf: '2026-01-31',
  plannedDays: [],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('quick forecast with hourly requests', () => {
  it('charges a partial day as its share of the shift in a day balance and says so', () => {
    const half = createPtoRequest({ start: '2026-02-02', end: '2026-02-02', status: 'approved', partialMinutes: 240 },
      { workWeek: [true, true, true, true, true, false, false], offDays: [], shiftMinutes: [480, 480, 480, 480, 480, 0, 0] }, 'half')!;
    render(<QuickForecast policy={policy} requests={[half]} forecastDate="2026-02-15" onForecastDateChange={vi.fn()} />);
    expect(screen.getByText('11.5 days')).toBeTruthy();
    expect(screen.getByText(/A partial day counts as its share of that day's shift: half a shift is 0.5 day./)).toBeTruthy();
  });
});

describe('quick forecast date shortcuts', () => {
  it('anchors shortcuts to the balance date and clamps month ends', () => {
    expect(forecastPresets('2026-01-31').map((preset) => preset.date))
      .toEqual(['2026-02-28', '2026-04-30', '2026-07-31', '2026-12-31']);
    expect(forecastPresets('2024-01-31')[0].date).toBe('2024-02-29');
    expect(forecastPresets('2026-11-30')[1].date).toBe('2027-02-28');
  });

  it('returns no shortcuts for an invalid balance date or out-of-range year', () => {
    expect(forecastPresets('2026-02-30')).toEqual([]);
    expect(forecastPresets('not-a-date')).toEqual([]);
    expect(forecastPresets('9999-12-31').map((preset) => preset.key)).toEqual(['year-end']);
  });

  it('updates the same date callback used by the free-form date field', () => {
    const onForecastDateChange = vi.fn();
    const onForecastUsed = vi.fn();
    const view = render(
      <QuickForecast policy={policy} forecastDate="2026-02-15"
        onForecastDateChange={onForecastDateChange} onForecastUsed={onForecastUsed} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '3 months' }));
    expect(onForecastDateChange).toHaveBeenCalledWith('2026-04-30');
    expect(onForecastUsed).toHaveBeenCalledTimes(1);
    view.rerender(
      <QuickForecast policy={policy} forecastDate="2026-04-30"
        onForecastDateChange={onForecastDateChange} onForecastUsed={onForecastUsed} />,
    );
    expect(screen.getByRole('button', { name: '3 months' }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Forecast my balance on') as HTMLInputElement).value).toBe('2026-04-30');
    fireEvent.change(screen.getByLabelText('Forecast my balance on'), { target: { value: '2026-05-09' } });
    expect(onForecastDateChange).toHaveBeenLastCalledWith('2026-05-09');
    expect(onForecastUsed).toHaveBeenCalledTimes(2);
  });

  it('offers a disclosed, on-demand explanation from the same policy forecast', () => {
    const onForecastDateChange = vi.fn();
    render(<QuickForecast policy={policy} forecastDate="2026-04-30"
      onForecastDateChange={onForecastDateChange} />);
    expect(screen.queryByText('How time is earned')).toBeNull();
    expect(screen.getByRole('button', { name: 'Explain this forecast using my policy' }).getAttribute('aria-controls')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Explain this forecast using my policy' }));
    const disclosure = screen.getByRole('button', { name: 'Hide policy explanation' });
    expect(document.getElementById(disclosure.getAttribute('aria-controls')!)).toBeTruthy();
    expect(screen.getByText('How time is earned')).toBeTruthy();
    expect(screen.getByText(/Your modeled plan year resets on January 1/)).toBeTruthy();
    expect(screen.getByText(/not a legal determination/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Learn how PTO policies work' }).getAttribute('href')).toBe('/glossary');
    fireEvent.click(screen.getByRole('button', { name: 'Hide policy explanation' }));
    expect(screen.queryByText('How time is earned')).toBeNull();
  });

  it('keeps the unlimited-PTO caveat and supports year-end shortcuts', () => {
    const onForecastDateChange = vi.fn();
    render(<QuickForecast policy={{ ...policy, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 } }}
      balanceEntered={false} forecastDate="2026-03-01" onForecastDateChange={onForecastDateChange} />);
    expect(screen.getByText(/Unlimited PTO has no banked balance/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Explain this forecast using my policy' }));
    expect(screen.getByText('How time is earned')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Year-end' }));
    expect(onForecastDateChange).toHaveBeenCalledWith('2026-12-31');
  });
});
