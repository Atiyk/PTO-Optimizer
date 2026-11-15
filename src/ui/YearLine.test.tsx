import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { YearLine, type YearLineBreak } from './YearLine';

// jsdom has no layout: give the line's track a width and a ResizeObserver that reports it.
let trackWidth = 0;
let resize: (() => void) | null = null;
function measureTrackAs(width: number) {
  trackWidth = width;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  const real = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-year-line-track') ? DOMRect.fromRect({ width: trackWidth, height: 44 }) : real.call(this);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resize = null;
});

const brk = (n: number, start: string, end: string, totalDaysOff = 4, ptoCost = 1): YearLineBreak => ({ id: `b${n}`, start, end, totalDaysOff, ptoCost });
const href = (_: YearLineBreak, index: number) => `#break-card-${index + 1}`;
// Measured positions are written as percentages of the measured width (so a resize before
// the next measurement scales instead of overflowing); read them back as pixels.
const px = (value: string) => { expect(value).toMatch(/%$/); return (parseFloat(value) / 100) * trackWidth; };
const targets = () => [...document.querySelectorAll<HTMLElement>('[data-line-target]')].map((el) => ({ left: px(el.style.left), width: px(el.style.width) }));
const bars = () => [...document.querySelectorAll<HTMLElement>('[data-line-bar]')].map((el) => ({ left: px(el.style.left), width: px(el.style.width) }));

function expectNoOverlap(areas: { left: number; width: number }[], width: number) {
  areas.forEach((area, index) => {
    expect(area.width).toBeGreaterThanOrEqual(24 - 1e-9);
    expect(area.left).toBeGreaterThanOrEqual(0);
    expect(area.left + area.width).toBeLessThanOrEqual(width + 1e-9);
    if (index > 0) expect(area.left).toBeGreaterThanOrEqual(areas[index - 1].left + areas[index - 1].width - 1e-9);
  });
}

describe('YearLine hit areas', () => {
  // Fri Jul 2 - Mon Jul 5 and Sat Jul 10 - Sun Jul 11, 2027: a week apart, about 6px apart at 320px.
  const adjacent = [brk(1, '2027-07-02', '2027-07-05'), brk(2, '2027-07-09', '2027-07-11', 3, 1)];

  it('gives two close breaks their own 24px links that never overlap, bars still at their dates', () => {
    measureTrackAs(320);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={adjacent} hrefFor={href} />);
    const links = within(screen.getByRole('list', { name: 'Breaks across your dates' })).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#break-card-1', '#break-card-2']);
    const areas = targets();
    expectNoOverlap(areas, 320);
    // The bars are not moved: Jul 2 is day 182 of 365, four days long.
    const [first, second] = bars();
    expect(first.left + first.width / 2).toBeCloseTo(((182 + 2) / 365) * 320, 6);
    expect(second.left + second.width / 2).toBeCloseTo(((189 + 1.5) / 365) * 320, 6);
    // Each link still covers its own bar's centre.
    [first, second].forEach((bar, index) => {
      const centre = bar.left + bar.width / 2;
      expect(centre).toBeGreaterThanOrEqual(areas[index].left);
      expect(centre).toBeLessThanOrEqual(areas[index].left + areas[index].width);
    });
  });

  it('keeps the accessible names exactly', () => {
    measureTrackAs(320);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={adjacent} hrefFor={href} />);
    expect(screen.getByRole('link', { name: 'Break 1: Jul 2 – 5, 4 days off for 1 PTO day' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Break 2: Jul 9 – 11, 3 days off for 1 PTO day' })).toBeTruthy();
  });

  it('puts each number on its own hit area, so close numbers never collide', () => {
    measureTrackAs(320);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={adjacent} hrefFor={href} />);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.querySelector('[aria-hidden="true"]')?.textContent)).toEqual(['1', '2']);
  });

  it('keeps the homepage picture free of links while still separating its numbers', () => {
    measureTrackAs(320);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={adjacent} />);
    expect(screen.queryByRole('link')).toBeNull();
    expectNoOverlap(targets(), 320);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1Break 1: Jul 2 – 5, 4 days off for 1 PTO day',
      '2Break 2: Jul 9 – 11, 3 days off for 1 PTO day',
    ]);
  });

  it('sweeps back from the end when breaks crowd the right edge', () => {
    measureTrackAs(300);
    const late = [brk(1, '2027-12-24', '2027-12-26'), brk(2, '2027-12-28', '2027-12-28'), brk(3, '2027-12-31', '2027-12-31')];
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={late} hrefFor={href} />);
    const areas = targets();
    expectNoOverlap(areas, 300);
    expect(areas[2].left + areas[2].width).toBeCloseTo(300, 6);
  });

  it('re-lays out when the track is resized', () => {
    measureTrackAs(1000);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={adjacent} hrefFor={href} />);
    expect(targets()[1].left).toBeGreaterThan(500);
    trackWidth = 320;
    act(() => resize?.());
    expect(targets()[1].left).toBeLessThan(200);
    expectNoOverlap(targets(), 320);
  });

  it('draws a two-year range with the breaks in each year in place', () => {
    measureTrackAs(600);
    const twoYears = [brk(1, '2027-03-01', '2027-03-07', 9, 5), brk(2, '2028-03-01', '2028-03-07', 9, 5)];
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2028-12-31" breaks={twoYears} hrefFor={href} />);
    const span = 365 + 366;
    const [first, second] = bars();
    // Mar 1 2027 is day 59 of the range, Mar 1 2028 day 425 (2028 is a leap year); a week is
    // 5.7px here, so each stretch is drawn at the 6px floor, centred on its real week.
    expect(first.left + first.width / 2).toBeCloseTo(((59 + 3.5) / span) * 600, 6);
    expect(second.left + second.width / 2).toBeCloseTo(((425 + 3.5) / span) * 600, 6);
    expect(first.width).toBe(6);
    expectNoOverlap(targets(), 600);
    expect(screen.getAllByRole('link')[1].textContent).toBe('2Break 2: Mar 1 – 7, 9 days off for 5 PTO days');
  });

  it('clips a break that runs past either end of the range, but names its real dates', () => {
    measureTrackAs(730);
    const edges = [brk(1, '2026-12-26', '2027-01-03', 9, 3), brk(2, '2027-12-24', '2028-01-02', 10, 4)];
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={edges} hrefFor={href} />);
    const [first, second] = bars();
    // Two pixels a day: Jan 1-3 and Dec 24-31 are what is drawn.
    expect(first.left).toBeCloseTo(0, 6);
    expect(first.width).toBeCloseTo(6, 6);
    expect(second.left).toBeCloseTo(714, 6);
    expect(second.left + second.width).toBeCloseTo(730, 6);
    expectNoOverlap(targets(), 730);
    const links = screen.getAllByRole('link');
    expect(links[0].textContent).toContain('Break 1: Dec 26, 2026 – Jan 3, 2027, 9 days off for 3 PTO days');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#break-card-1', '#break-card-2']);
  });

  it('becomes a picture on a line too narrow for every link, keeping the breaks as text', () => {
    measureTrackAs(280);
    const dense = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      return brk(index + 1, `2027-${month}-10`, `2027-${month}-11`, 2, 0);
    });
    const { container } = render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={dense} hrefFor={href} />);
    expect(container.querySelector('[data-year-line]')!.getAttribute('data-year-line')).toBe('dense');
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelectorAll('[data-line-target]')).toHaveLength(0);
    const items = within(screen.getByRole('list', { name: 'Breaks across your dates' })).getAllByRole('listitem');
    expect(items).toHaveLength(12);
    expect(items[11].textContent).toBe('Break 12: Dec 10 – 11, 2 days off for 0 PTO days');
  });

  it('links the same twelve breaks once the line is wide enough', () => {
    measureTrackAs(1000);
    const dense = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, '0');
      return brk(index + 1, `2027-${month}-10`, `2027-${month}-11`, 2, 0);
    });
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={dense} hrefFor={href} />);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(dense.map((_, index) => `#break-card-${index + 1}`));
    expectNoOverlap(targets(), 1000);
  });

  it('prerendered, without a width, still gives every link at least 24px, centred on its stretch', () => {
    // jsdom drops max()/calc() from inline styles, so read the server markup itself.
    const html = renderToStaticMarkup(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={adjacent} hrefFor={href} />);
    const links = [...html.matchAll(/<a [^>]*style="([^"]*)"/g)].map((match) => match[1]);
    expect(links).toHaveLength(2);
    // Jul 2 is day 182 of 365, four days long.
    const left = (182 / 365) * 100;
    const width = (4 / 365) * 100;
    expect(links[0]).toBe(`left:${left}%;width:max(24px, ${width}%);margin-left:calc((${width}% - max(24px, ${width}%)) / 2)`);
  });

  it('stays a picture in compact mode, even with destinations', () => {
    measureTrackAs(320);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={adjacent} hrefFor={href} compact />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('[data-month-label]')).toBeNull();
  });
});

describe('YearLine month names', () => {
  // A 320px phone: 16px page gutter and 16px card padding each side leave a 256px line.
  const labelCentres = () => [...document.querySelectorAll<HTMLElement>('[data-month-label]')].map((el) => px(el.style.left));

  function expectApart(centres: number[], width: number) {
    expect(centres.length).toBeGreaterThan(0);
    // The range's first name sits at the left edge (about 28px wide); the next is well clear.
    expect(centres[0]).toBeGreaterThanOrEqual(44);
    centres.forEach((centre, index) => {
      expect(centre).toBeLessThanOrEqual(width - 16);
      if (index > 0) expect(centre - centres[index - 1]).toBeGreaterThanOrEqual(48);
    });
  }

  it.each([256, 288, 343])('never collide for twelve months at %ipx', (width) => {
    measureTrackAs(width);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={[brk(1, '2027-07-02', '2027-07-05')]} />);
    expectApart(labelCentres(), width);
  });

  it.each([256, 288, 343])('never collide for twenty-four months at %ipx', (width) => {
    measureTrackAs(width);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2028-12-31" breaks={[brk(1, '2027-07-02', '2027-07-05')]} />);
    expectApart(labelCentres(), width);
  });

  it('never collide for a range starting mid-month', () => {
    measureTrackAs(256);
    render(<YearLine rangeStart="2027-03-15" rangeEnd="2028-03-14" breaks={[brk(1, '2027-07-02', '2027-07-05')]} />);
    expectApart(labelCentres(), 256);
  });

  it('names quarters on a phone and every month on a wide line', () => {
    measureTrackAs(256);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={[]} />);
    expect([...document.querySelectorAll('[data-month-label]')].map((el) => el.textContent)).toEqual(['Apr', 'Jul', 'Oct']);
    cleanup();
    measureTrackAs(900);
    render(<YearLine rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={[]} />);
    expect([...document.querySelectorAll('[data-month-label]')].map((el) => el.textContent)).toEqual(['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  });
});
