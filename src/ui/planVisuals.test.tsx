import { afterEach, describe, expect, it } from 'vitest';
import { createRef } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { rangeISO } from '@daysoff/engine/solver/dateUtils';
import { BreakRibbon } from './BreakRibbon';
import { YearLine } from './YearLine';
import { PlannerNav } from './PlannerNav';

afterEach(cleanup);

// Sat Jan 16 - Sun Jan 24, 2027: MLK Day on Mon Jan 18, PTO Tue-Fri.
const days = rangeISO('2027-01-16', '2027-01-24');
const pto = new Set(['2027-01-19', '2027-01-20', '2027-01-21', '2027-01-22']);
const holiday = (iso: string) => iso === '2027-01-18' ? 'Martin Luther King, Jr. Day' : undefined;

describe('BreakRibbon', () => {
  it('draws one cell per day and marks PTO, holiday and already-off days apart', () => {
    const { container } = render(<BreakRibbon days={days} isPtoDay={(d) => pto.has(d)} holidayNameFor={holiday} />);
    const kinds = [...container.querySelectorAll('[data-ribbon-day]')].map((cell) => cell.getAttribute('data-ribbon-day'));
    expect(kinds).toEqual(['off', 'off', 'holiday', 'pto', 'pto', 'pto', 'pto', 'off', 'off']);
  });

  it('is one image with the dates, PTO days and holidays in words', () => {
    render(<BreakRibbon days={days} isPtoDay={(d) => pto.has(d)} holidayNameFor={holiday} />);
    const label = screen.getByRole('img').getAttribute('aria-label')!;
    expect(label).toContain('9 days off in a row, Jan 16 to Jan 24.');
    expect(label).toContain('PTO on Tue Jan 19, Wed Jan 20, Thu Jan 21, Fri Jan 22.');
    expect(label).toContain('Holidays: Martin Luther King, Jr. Day.');
  });

  it('drops per-day labels for a long leave and names its two ends instead', () => {
    const long = rangeISO('2027-06-01', '2027-06-30');
    const { container } = render(<BreakRibbon days={long} isPtoDay={() => true} />);
    expect(container.querySelectorAll('[data-ribbon-day]')).toHaveLength(30);
    expect(container.textContent).toBe('Tue Jun 1Wed Jun 30');
  });
});

describe('YearLine', () => {
  const breaks = [
    { id: 'a', start: '2027-01-16', end: '2027-01-24', totalDaysOff: 9, ptoCost: 4 },
    { id: 'b', start: '2027-05-28', end: '2027-05-31', totalDaysOff: 4, ptoCost: 1 },
  ];

  it('places each break by its dates and links it to its card', () => {
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={breaks} hrefFor={(_, i) => `#break-card-${i + 1}`} />);
    const list = screen.getByRole('list', { name: 'Breaks across your dates' });
    const links = within(list).getAllByRole<HTMLAnchorElement>('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#break-card-1', '#break-card-2']);
    expect(links[0].textContent).toContain('Break 1: Jan 16 – 24, 9 days off for 4 PTO days');
    expect(links[1].textContent).toContain('4 days off for 1 PTO day');
    // Jan 16 is day 15 of 365.
    expect(parseFloat(links[0].style.left)).toBeCloseTo((15 / 365) * 100, 3);
    expect(parseFloat(links[1].style.left)).toBeGreaterThan(parseFloat(links[0].style.left));
  });

  it('is a picture without links when no destination is given', () => {
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={breaks} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('PlannerNav', () => {
  it('is inert until the result scrolls away, and lists every section as a link', () => {
    const watch = createRef<HTMLElement>();
    render(<PlannerNav watch={watch} items={[{ id: 'breaks-heading', label: 'Breaks' }, { id: 'complete-plan-heading', label: 'Calendar' }]} result={{ totalDaysOff: 31, budgetSpent: 13, breakCountActual: 4 }} />);
    const nav = document.querySelector('[data-planner-nav]')!;
    expect(nav.getAttribute('data-planner-nav')).toBe('hidden');
    expect(nav.hasAttribute('inert')).toBe(true);
    expect([...nav.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(['#breaks-heading', '#complete-plan-heading']);
    expect(nav.textContent).toContain('31 days off');
  });
});
