import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { buildPartnerShareURL, readPartnerAvailability } from '../planning/partner';
import { PartnerPlanner } from './PartnerPlanner';
import type { Break } from '@daysoff/engine/solver/types';

const brk: Break = { id: '2027-07-03|2027-07-11', start: '2027-07-03', end: '2027-07-11', days: rangeISO('2027-07-03', '2027-07-11'), ptoCost: 4, totalDaysOff: 9, tags: [], meanDemand: 1, multiplier: 9 / 4 };
const otherBreak = { ...brk, id: '2027-09-04|2027-09-06', start: '2027-09-04', end: '2027-09-06', days: rangeISO('2027-09-04', '2027-09-06'), totalDaysOff: 3 };
const input = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', offDays: ['2027-07-05'], budget: 5 };
const copied: string[] = [];
vi.mock('./requestText', () => ({ copyText: vi.fn(async (text: string) => { copied.push(text); return true; }) }));
beforeEach(() => { copied.length = 0; });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('partner planner controls', () => {
  it('requires fresh confirmation when the dates or free-day classification changes', () => {
    const input = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', offDays: [], budget: 5 };
    const { rerender } = render(<PartnerPlanner breaks={[brk]} freeDays={[]} input={input} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan with someone' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Jul 3 - Jul 11, 2027' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show which of these dates I already have off.' }));
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
    expect(screen.getByText(/Pick one option/)).toBeTruthy();
    expect(screen.getByText(/Timebower does not contact either employer/)).toBeTruthy();
    expect(JSON.stringify(input)).toBe(original);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show options for time off together.' }));
    expect(new URLSearchParams(window.location.search).get('jp')).toBe('0');
    expect(new URLSearchParams(window.location.search).has('pp')).toBe(true);
  });
  it('opens with exactly the selected break and copies only the date preview by default', async () => {
    window.history.replaceState(null, '', '/pto?c=US&b=21&eh=private&note=private');
    const { rerender } = render(<PartnerPlanner breaks={[brk, otherBreak]} freeDays={['2027-07-03', '2027-07-05', '2027-09-04']} input={input} />);
    rerender(<PartnerPlanner breaks={[brk, otherBreak]} freeDays={['2027-07-03', '2027-07-05', '2027-09-04']} input={input} openKey={1} selectedBreakId={brk.id} />);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Jul 3 - Jul 11, 2027' }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Sep 4 - Sep 6, 2027' }).checked).toBe(false);
    expect(screen.getByText('proposed availability (9 dates)', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy partner link' }));
    await waitFor(() => expect(copied).toHaveLength(1));
    const url = new URL(copied[0]);
    expect([...url.searchParams.keys()]).toEqual(['pp', 's', 'e']);
    expect(readPartnerAvailability(url.search).availability).toEqual({ days: brk.days, freeDays: null, status: 'proposed' });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Show which of these dates I already have off.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy partner link' }));
    await waitFor(() => expect(copied).toHaveLength(2));
    expect(readPartnerAvailability(new URL(copied[1]).search).availability?.freeDays).toEqual(['2027-07-03', '2027-07-05']);
  });

  it('clears a return proposal when recipient settings make its dates infeasible', () => {
    window.history.replaceState(null, '', buildPartnerShareURL(window.location.origin, '/pto', { days: brk.days, freeDays: null, status: 'proposed' }));
    const { rerender } = render(<PartnerPlanner breaks={[]} freeDays={[]} input={input} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Propose these dates' })[0]);
    expect(screen.getByRole('button', { name: 'Copy proposal link' })).toBeTruthy();
    rerender(<PartnerPlanner breaks={[]} freeDays={[]} input={{ ...input, blackouts: brk.days }} />);
    expect(screen.queryByRole('button', { name: 'Copy proposal link' })).toBeNull();
    expect(screen.getByText(/Your plan changed/)).toBeTruthy();
  });

  it('lets a recipient preview and copy a proposal from only the sender’s disclosed dates', async () => {
    const days = [...brk.days, ...otherBreak.days];
    window.history.replaceState(null, '', buildPartnerShareURL(window.location.origin, '/pto', { days, freeDays: null, status: 'proposed' }));
    render(<PartnerPlanner breaks={[otherBreak]} freeDays={['2027-07-03', '2027-07-05', '2027-09-04']} input={input} />);
    expect(screen.getAllByText('PTO not shared').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Propose these dates' })[0]);
    expect(copied).toHaveLength(0);
    expect(screen.getByText('What your partner will see')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy proposal link' }));
    await waitFor(() => expect(copied).toHaveLength(1));
    const proposal = readPartnerAvailability(new URL(copied[0]).search).availability!;
    expect(proposal.days.length).toBeGreaterThanOrEqual(3);
    expect(proposal.days.every(date => days.includes(date))).toBe(true);
    expect(proposal.status).toBe('proposed');
    expect(proposal.freeDays).toBeNull();
  });

  it('tells a first-time sender what to do next and exactly what the partner will see', async () => {
    render(<PartnerPlanner breaks={[brk]} freeDays={[]} input={input} />);
    fireEvent.click(screen.getByRole('button', { name: 'Plan with someone' }));
    expect(screen.getByRole('group', { name: 'Dates you could take off' })).toBeTruthy();
    expect(screen.getByText('Tick at least one set of dates to make a link.')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Jul 3 - Jul 11, 2027' }));
    expect(screen.getByText('What your partner will see')).toBeTruthy();
    expect(screen.getByText(/Anyone with the link sees only these dates/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy partner link' }));
    expect(await screen.findByText('Partner link copied with 9 proposed dates. Send it to your partner in any message.')).toBeTruthy();
  });

});
