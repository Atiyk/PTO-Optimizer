import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Policy } from './Policy';
import { initialPolicyPreferences, readBrowserPolicyDraft, savePolicyPreferences } from '../personal/policyPreferences';

const INITIAL_SEARCH = '?c=US&cb=10&bao=2027-01-01&ak=pp&am=1&fq=m&pda=2027-01-15&cm=a&ace=0&fd=2027-03-15';
const quickInputs = () => within(screen.getByRole('region', { name: 'Quick balance forecast' }));
const forecastOutput = () => within(screen.getByRole('region', { name: 'PTO balance forecast' }));
const expectForecast = (text: string) => expect(forecastOutput().getByText((_content, node) => node?.getAttribute('aria-live') === 'polite' && node.textContent === text)).toBeTruthy();
const advanced = () => screen.getByText('Advanced policy options and explanation').closest('details')!;

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', `/policy${INITIAL_SEARCH}`);
});
afterEach(() => { cleanup(); window.localStorage.clear(); window.history.replaceState(null, '', '/policy'); });

describe('quick policy forecast in the real consumer page', () => {
  it('updates from only the current balance, as-of date and accrual inputs without a submission', () => {
    render(<Policy />);
    expectForecast('13 days');
    fireEvent.change(quickInputs().getByLabelText('Current PTO balance (days)'), { target: { value: '20' } });
    expectForecast('23 days');
    fireEvent.change(quickInputs().getByLabelText('Balance as-of date'), { target: { value: '2027-01-16' } });
    expectForecast('22 days');
    fireEvent.change(quickInputs().getByLabelText('Days earned each pay period'), { target: { value: '2' } });
    expectForecast('24 days');
    expect(quickInputs().queryByRole('button', { name: /generate|calculate/i })).toBeNull();
  });

  it('opens legacy fd/car inputs, scrubs private URL values and restores the same-tab draft', () => {
    window.history.replaceState(null, '', '/policy?c=US&cb=12&bao=2027-02-01&ak=fl&am=0&gd=2027-01-01&cm=a&ace=0&cue=1&cub=2027-03-31&car=3&fd=2027-04-01');
    const first = render(<Policy />);
    expectForecast('9 days');
    fireEvent.change(screen.getByLabelText('Forecast my balance on'), { target: { value: '2027-03-01' } });
    expectForecast('12 days');
    expect(window.location.search).toBe('?c=US');
    expect(initialPolicyPreferences(window.location.search, 'US', readBrowserPolicyDraft())).toMatchObject({ forecastDate: '2027-03-01', currentCarriedBalance: 3, currentBalance: 12 });
    first.unmount();
    render(<Policy />);
    expectForecast('12 days');
    expect((screen.getByLabelText('Forecast my balance on') as HTMLInputElement).value).toBe('2027-03-01');
  });

  it('keeps advanced policy controls collapsed while preserving access to them', () => {
    render(<Policy />);
    expect(advanced().open).toBe(false);
    const options = within(advanced());
    expect(options.getByLabelText('Plan year')).toBeTruthy();
    expect(options.getByLabelText('Can your balance go negative?')).toBeTruthy();
    expect(options.getByLabelText('Already-carried PTO included in your balance (days)')).toBeTruthy();
    expect(options.getByLabelText("If you leave, is unused PTO paid out?")).toBeTruthy();
    fireEvent.click(screen.getByText('Advanced policy options and explanation'));
    expect(advanced().open).toBe(true);
    fireEvent.change(options.getByLabelText('Can your balance go negative?'), { target: { value: '2' } });
    expect(window.location.search).toBe('?c=US');
    expect(initialPolicyPreferences(window.location.search, 'US', readBrowserPolicyDraft()).negativeBalanceAllowance).toBe(2);
  });

  it('saves an optional local policy and restores it on a clean revisit', () => {
    const first = render(<Policy />);
    fireEvent.change(quickInputs().getByLabelText('Current PTO balance (days)'), { target: { value: '17' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy in this browser' }));
    expect(screen.getByText('Policy saved in this browser.')).toBeTruthy();
    first.unmount();
    window.history.replaceState(null, '', '/policy');
    render(<Policy />);
    expect((quickInputs().getByLabelText('Current PTO balance (days)') as HTMLInputElement).value).toBe('17');
    expectForecast('20 days');
  });

  it('lets an explicit policy URL override saved preferences without silently replacing them', () => {
    expect(savePolicyPreferences('c=US&cb=17&bao=2027-01-01&ak=pp&am=1&fq=m&pda=2027-01-15&cm=a&ace=0&fd=2027-03-15')).toBe(true);
    window.history.replaceState(null, '', `/policy${INITIAL_SEARCH.replace('cb=10', 'cb=4')}`);
    render(<Policy />);
    expect((quickInputs().getByLabelText('Current PTO balance (days)') as HTMLInputElement).value).toBe('4');
    expectForecast('7 days');
    expect(initialPolicyPreferences('', 'US').currentBalance).toBe(17);
  });

  it('shows invalid carried-balance input clearly and does not claim the policy is risk free', () => {
    window.history.replaceState(null, '', '/policy?c=US&cb=10&bao=2027-02-01&ak=fl&am=0&gd=2027-01-01&cm=a&ace=0&cue=1&cub=2027-03-31&car=99&fd=2027-04-01');
    render(<Policy />);
    expect(forecastOutput().getByText(/current carried PTO portion must be between zero and your current balance/)).toBeTruthy();
    expect(forecastOutput().queryByText('Estimated available PTO on Apr 1, 2027')).toBeNull();
    expect(screen.queryByText(/Nothing to flag: no forfeiture/)).toBeNull();
    expect(screen.queryByText(/No balance to chart — unlimited/)).toBeNull();
  });

  it('shows an unlimited-PTO explanation instead of a finite banked balance', () => {
    render(<Policy />);
    fireEvent.change(quickInputs().getByLabelText('How PTO accrues'), { target: { value: 'unlimited' } });
    expect(forecastOutput().getByText(/Unlimited PTO has no banked balance to forecast/)).toBeTruthy();
    expect(forecastOutput().queryByText(/Estimated available PTO on/)).toBeNull();
    expect(window.location.search).toBe('?c=US');
    expect(initialPolicyPreferences(window.location.search, 'US', readBrowserPolicyDraft()).accrualKind).toBe('unlimited');
  });

  it('labels hourly accrual in the hours unit expected by the shared policy model', () => {
    render(<Policy />);
    fireEvent.change(quickInputs().getByLabelText('How PTO accrues'), { target: { value: 'per-hour-worked' } });
    expect(quickInputs().getByLabelText('Hours earned per hour worked')).toBeTruthy();
    expect(quickInputs().queryByLabelText('days earned per hour worked')).toBeNull();
  });

  it('says an upcoming forfeiture beside the forecast figure, never a reassuring "−0"', () => {
    window.history.replaceState(null, '', '/policy?c=US&cb=12&bao=2030-10-01&ak=fl&am=0&gd=2030-01-01&cm=n&ace=0&fd=2030-12-31');
    render(<Policy />);
    const region = forecastOutput();
    expect(region.getByText('Estimated available PTO on Dec 31, 2030')).toBeTruthy();
    expect(region.getByText(/You could lose 12 days on Jan 1, 2031\./)).toBeTruthy();
    expect(region.getByText(/not in this number/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'PTO balance forecast' }).textContent).not.toMatch(/[−+-]0 days/);
    expect(screen.getByText('Expected expiration').nextElementSibling?.textContent).toBe('0 days');
  });

  it('distinguishes an explicitly entered zero from an empty field, including legacy links', () => {
    window.history.replaceState(null, '', '/policy?c=US&cb=0&bao=2030-01-01&ak=pp&am=1&fq=m&pda=2030-01-15&cm=a&ace=0&fd=2030-03-15');
    const first = render(<Policy />);
    const input = quickInputs().getByLabelText('Current PTO balance (days)') as HTMLInputElement;
    expect(input.value).toBe('0');
    expect(forecastOutput().queryByText('Current balance (not entered yet)')).toBeNull();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText(/Starts at 0 until you enter yours/)).toBeTruthy();
    expect(forecastOutput().getByText('Current balance (not entered yet)')).toBeTruthy();
    fireEvent.change(input, { target: { value: '0' } });
    expect(forecastOutput().queryByText('Current balance (not entered yet)')).toBeNull();
    first.unmount();
    render(<Policy />);
    expect((quickInputs().getByLabelText('Current PTO balance (days)') as HTMLInputElement).value).toBe('0');
    expect(forecastOutput().queryByText('Current balance (not entered yet)')).toBeNull();
  });
});
