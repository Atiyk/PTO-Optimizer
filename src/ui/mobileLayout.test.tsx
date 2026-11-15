import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Break } from '@daysoff/engine/solver/types';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { BreakStrip } from './BreakStrip';
import { YearOverview } from './YearOverview';
import { PlanStyleCompare } from './PlanStyleCompare';
import { PlanActions } from './PlanActions';
import { ReserveControls } from './PrimaryControls';
import type { PlanComparisonEntry } from '../planning/planComparison';

afterEach(cleanup);

const brk = (start: string, end: string): Break => ({
  id: `${start}|${end}`, start, end, days: rangeISO(start, end), totalDaysOff: rangeISO(start, end).length, ptoCost: 2, multiplier: 2, tags: [], meanDemand: 1,
});

describe('BreakStrip', () => {
  it('keeps list semantics and every card in the accessibility tree', () => {
    render(<BreakStrip count={3} label="Breaks"><li>One</li><li>Two</li><li>Three</li></BreakStrip>);
    const list = screen.getByRole('list', { name: 'Breaks' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    // The phone strip is a tab stop so arrow keys scroll it.
    expect(list.tabIndex).toBe(0);
    expect(screen.getByRole('button', { name: 'Previous break' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Next break' })).toHaveProperty('disabled', false);
  });
});

describe('YearOverview', () => {
  it('draws one row per month and says each month’s breaks in words', () => {
    render(<YearOverview rangeStart="2027-01-01" rangeEnd="2027-03-31" breaks={[brk('2027-01-16', '2027-01-24')]} isPtoDay={(d) => d === '2027-01-19' || d === '2027-01-20'} categoryOf={() => 'working'} />);
    const list = screen.getByRole('list', { name: 'Your year at a glance' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText(/January 2027: break Jan 16 – 24, 2 PTO days this month\./)).toBeTruthy();
    expect(within(list).getByText('February 2027: no breaks.')).toBeTruthy();
  });
});

describe('PlanStyleCompare', () => {
  const entry = (style: PlanComparisonEntry['style'], label: string, totalDaysOff: number): PlanComparisonEntry => ({
    style, label, ptoUsed: 13, totalDaysOff, longestBreak: 9, breakCount: 4, monthsTouched: ['2027-01'], seasonsTouched: ['winter', 'summer'], remainingPto: 2, reserveKept: 2, tradeOff: `Trade-off for ${label}.`, breaks: [],
  });
  it('shows each plan’s numbers and sets the goal live when one is chosen', () => {
    const onChangeStyle = vi.fn();
    render(<PlanStyleCompare layout="wide" style="year" onChangeStyle={onChangeStyle} entries={[entry('year', 'Spread across the year', 31), entry('max', 'Most days off', 40)]} />);
    const group = screen.getByRole('radiogroup', { name: 'Compare plan styles' });
    const radios = within(group).getAllByRole<HTMLInputElement>('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);
    expect(within(group).getByText('40 days off')).toBeTruthy();
    expect(within(group).getAllByText('Winter, Summer')).toHaveLength(2);
    fireEvent.click(radios[1]);
    expect(onChangeStyle).toHaveBeenCalledWith('max');
    expect(screen.queryByRole('button', { name: /submit|generate|apply/i })).toBeNull();
  });
});

describe('PlanActions', () => {
  it('shows one primary action and keeps everything else in More', () => {
    render(<PlanActions layout="narrow" kind="calendar" onKeep={() => {}} pinMessage="" justKept={false}><button type="button">Copy plan link</button></PlanActions>);
    const region = screen.getByRole('region', { name: 'Use this plan' });
    expect(region.querySelectorAll('[data-primary-action]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add to calendar' }).getAttribute('data-primary-action')).toBe('calendar');
    expect(region.querySelector('details')!.textContent).toContain('Copy plan link');
  });
  it('copies the request email for the next break', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PlanActions layout="narrow" kind="copy-request" request={{ text: 'Hi, I would like to request…', range: 'Jan 16 – 24, 2027' }} onKeep={() => {}} pinMessage="" justKept={false} />);
    expect(screen.getByText('An email draft for your next break, Jan 16 – 24, 2027.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy request' }));
    expect(await screen.findByRole('button', { name: 'Request copied' })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith('Hi, I would like to request…');
  });
});

describe('ReserveControls', () => {
  it('says when a year-round style keeps PTO back on its own', () => {
    render(<ReserveControls budget={15} reserveDays={0} onChangeReserveDays={() => {}} unlimitedPto={false} onToggleUnlimitedPto={() => {}} autoKept={2} autoKeptBy="Spread across the year" />);
    expect(screen.getByTestId('auto-kept-reserve').textContent).toBe('Plus 2 kept automatically by Spread across the year.');
  });
});
