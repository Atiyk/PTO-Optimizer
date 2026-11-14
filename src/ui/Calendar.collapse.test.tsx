import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Calendar } from './Calendar';
import type { DayCategory } from './types';

afterEach(cleanup);

function Harness({ keep, onDayClick, today = '2026-11-14' }: { keep?: string[]; onDayClick: (date: string) => void; today?: string }) {
  const [showAll, setShowAll] = useState(false);
  return (
    <Calendar
      rangeStart="2027-01-01"
      rangeEnd="2027-06-30"
      weekStart={1}
      today={today}
      offRuns={[]}
      previewRun={null}
      breakBandByRunIndex={new Map()}
      hoveredBreakDaySet={new Set()}
      onHoverBreak={() => {}}
      categoryOf={(): DayCategory => 'working'}
      isBlackoutDay={() => false}
      overlapSet={new Set()}
      marginalValues={new Map()}
      holidayNameFor={() => undefined}
      hasHover
      onDayClick={onDayClick}
      alternativeForDate={() => undefined}
      onSwapAlternative={() => {}}
      onHoverAlternative={() => {}}
      narrowKeepDates={keep}
      narrowShowAll={showAll}
      onNarrowShowAllChange={setShowAll}
    />
  );
}

const collapsedMonths = () => [...document.querySelectorAll('[data-collapsed-month="true"]')];

describe('Calendar month collapse on phones (F11)', () => {
  it('keeps months with a kept date and the tab stop month, and hides the rest behind a phone-only toggle', () => {
    render(<Harness keep={['2027-03-10']} onDayClick={() => {}} />);
    // Kept: March (a break or pin) and January (the range start holds the roving tab stop).
    const hidden = collapsedMonths();
    expect(hidden).toHaveLength(4);
    for (const month of hidden) expect(month.className).toContain('max-md:hidden');
    expect(document.getElementById('day-2027-03-10')!.closest('[data-collapsed-month]')).toBeNull();
    expect(document.getElementById('day-2027-01-01')!.closest('[data-collapsed-month]')).toBeNull();
    expect(screen.getByText(/Showing 2 of 6 months/)).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'Show all 6 months' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.parentElement!.className).toContain('md:hidden');

    fireEvent.click(toggle);
    expect(collapsedMonths()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Show fewer months' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('pins a day in a shown month, and in a month revealed by Show all', () => {
    const onDayClick = vi.fn();
    render(<Harness keep={['2027-03-10']} onDayClick={onDayClick} />);
    fireEvent.click(document.getElementById('day-2027-03-15')!);
    expect(onDayClick).toHaveBeenLastCalledWith('2027-03-15');
    fireEvent.click(screen.getByRole('button', { name: 'Show all 6 months' }));
    fireEvent.click(document.getElementById('day-2027-05-12')!);
    expect(onDayClick).toHaveBeenLastCalledWith('2027-05-12');
  });

  it('keeps every month and offers no toggle when it is not asked to collapse (sabbatical)', () => {
    render(<Harness onDayClick={() => {}} />);
    expect(collapsedMonths()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('offers no toggle when every month already has something in it', () => {
    render(<Harness keep={['2027-02-01', '2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01']} onDayClick={() => {}} />);
    expect(collapsedMonths()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });
});
