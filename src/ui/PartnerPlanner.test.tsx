import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { buildPartnerShareURL } from '../planning/partner';
import { PartnerPlanner } from './PartnerPlanner';
import type { Break } from '@daysoff/engine/solver/types';

const brk: Break = { id: '2027-07-03|2027-07-11', start: '2027-07-03', end: '2027-07-11', days: rangeISO('2027-07-03', '2027-07-11'), ptoCost: 4, totalDaysOff: 9, tags: [], meanDemand: 1, multiplier: 9 / 4 };
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('partner planner controls', () => {
  it('requires fresh confirmation when the dates or free-day classification changes', () => {
    const input = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', offDays: [], budget: 5 };
    const { rerender } = render(<PartnerPlanner breaks={[brk]} freeDays={[]} input={input} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan with someone' }));
    const confirmation = () => screen.getByRole('checkbox', { name: 'I have confirmed the availability I am sharing.' }) as HTMLInputElement;
    fireEvent.click(confirmation());
    expect(confirmation().checked).toBe(true);
    rerender(<PartnerPlanner breaks={[brk]} freeDays={['2027-07-05']} input={input} />);
    expect(confirmation().checked).toBe(false);
    fireEvent.click(confirmation());
    const different = { ...brk, id: 'different', start: '2027-07-04', days: brk.days.slice(1), totalDaysOff: 8 };
    rerender(<PartnerPlanner breaks={[different]} freeDays={['2027-07-05']} input={input} />);
    expect(confirmation().checked).toBe(false);
  });

  it('lets a user select availability and keeps confirmation opt-in', () => {
    render(<PartnerPlanner breaks={[brk]} freeDays={['2027-07-03', '2027-07-04', '2027-07-05', '2027-07-10', '2027-07-11']} input={{ rangeStart: '2027-01-01', rangeEnd: '2027-12-31', offDays: ['2027-07-05'], budget: 5 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan with someone' }));
    const confirmation = screen.getByRole('checkbox', { name: 'I have confirmed the availability I am sharing.' }) as HTMLInputElement;
    expect(confirmation.checked).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Jul 3 - Jul 11, 2027' }));
    expect((screen.getByRole('button', { name: 'Copy partner link' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also share other dates I already have off.' }));
    expect((screen.getByRole('button', { name: 'Copy partner link' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('uses independent recipient settings and preserves a URL-backed priority toggle', () => {
    const shared = buildPartnerShareURL(window.location.origin, '/pto', { days: brk.days, freeDays: ['2027-07-03', '2027-07-04', '2027-07-05', '2027-07-10', '2027-07-11'], status: 'proposed' });
    window.history.replaceState(null, '', shared);
    const input = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', offDays: ['2027-07-05'], budget: 2 };
    const original = JSON.stringify(input);
    render(<PartnerPlanner breaks={[brk]} freeDays={[]} input={input} />);
    expect(screen.getByText(/Choose one of these alternatives/)).toBeTruthy();
    expect(screen.getByText(/Timebower does not contact either employer/)).toBeTruthy();
    expect(JSON.stringify(input)).toBe(original);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Prioritize days off together.' }));
    expect(new URLSearchParams(window.location.search).get('jp')).toBe('0');
    expect(new URLSearchParams(window.location.search).has('pp')).toBe(true);
  });
});
