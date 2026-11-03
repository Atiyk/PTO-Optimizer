import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TimeOffPolicy } from '../policy/model';
import { DeparturePayoutEstimator } from './DeparturePayoutEstimator';

const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, currentBalance: 10, balanceAsOf: '2027-01-01',
  accrual: { kind: 'front-loaded', amount: 0, grantDate: '2027-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'all' },
  negativeBalanceAllowance: 0, payoutOnLeaving: 'not-sure', plannedDays: [],
};
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function fill() {
  fireEvent.change(screen.getByLabelText('Work jurisdiction (where you work)'), { target: { value: 'New York, US' } });
  fireEvent.change(screen.getByLabelText('Hourly pay (gross)'), { target: { value: '25' } });
  fireEvent.change(screen.getByLabelText('Departure date'), { target: { value: '2027-02-01' } });
}

describe('departure payout scenario UI', () => {
  it('defaults to an unknown employer assumption, not a fabricated legal payout', () => {
    render(<DeparturePayoutEstimator policy={policy} />);
    expect(screen.getByText(/Employment law is not verified here/)).toBeTruthy();
    expect(screen.queryByText('$2,000.00')).toBeNull();
    fill();
    expect(screen.getByText(/Payout amount unknown until you confirm the employer rule/)).toBeTruthy();
    expect(screen.queryByText('$2,000.00')).toBeNull();
  });

  it('calculates gross hourly company-rule scenarios with a cap and no legal claim', () => {
    render(<DeparturePayoutEstimator policy={policy} />);
    fill();
    fireEvent.change(screen.getByLabelText('Employer payout assumption'), { target: { value: 'pays-all' } });
    expect(screen.getByText('$2,000.00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Employer payout assumption'), { target: { value: 'pays-up-to' } });
    fireEvent.change(screen.getByLabelText('Payout cap (days)'), { target: { value: '3.5' } });
    expect(screen.getByText('$700.00')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Employer payout assumption'), { target: { value: 'pays-none' } });
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.getByText(/We do not calculate legal entitlement/)).toBeTruthy();
  });

  it('uses annual pay conversion and never transmits salary into a link', () => {
    const historySpy = vi.spyOn(window.history, 'replaceState');
    render(<DeparturePayoutEstimator policy={policy} />);
    fill();
    fireEvent.change(screen.getByLabelText('Pay type'), { target: { value: 'annual' } });
    fireEvent.change(screen.getByLabelText('Annual salary (gross)'), { target: { value: '104000' } });
    fireEvent.change(screen.getByLabelText('Employer payout assumption'), { target: { value: 'pays-all' } });
    expect(screen.getByText('$4,000.00')).toBeTruthy();
    expect(historySpy).not.toHaveBeenCalled();
    historySpy.mockRestore();
  });

  it('keeps unlimited PTO out of a cash balance estimate', () => {
    render(<DeparturePayoutEstimator policy={{ ...policy, accrual: { kind: 'unlimited', expectedDaysPerYear: 20 } }} />);
    fill();
    fireEvent.change(screen.getByLabelText('Employer payout assumption'), { target: { value: 'pays-all' } });
    expect(screen.getByText(/Unlimited vacation has no banked cash balance/)).toBeTruthy();
    expect(screen.queryByText('$2,000.00')).toBeNull();
  });
});
